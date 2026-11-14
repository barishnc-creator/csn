-- CSN: ilk şema
-- Tek sunucu: üyeler, kanallar (metin/ses), mesajlar, davetler, dosyalar.
-- Erişim tamamen RLS ile: üye olmayan hiçbir şey okuyamaz.

-- ───────────── Tablolar ─────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 32),
  avatar_path text,
  custom_status text check (char_length(custom_status) <= 80),
  created_at timestamptz not null default now()
);

create type public.member_role as enum ('admin', 'mod', 'member');

create table public.members (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  role public.member_role not null default 'member',
  joined_at timestamptz not null default now()
);

create type public.channel_kind as enum ('text', 'voice');

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  kind public.channel_kind not null default 'text',
  topic text check (char_length(topic) <= 200),
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table public.messages (
  id bigint generated always as identity primary key,
  channel_id uuid not null references public.channels (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  content text not null default '' check (char_length(content) <= 4000),
  attachments jsonb not null default '[]'::jsonb,
  reply_to bigint references public.messages (id) on delete set null,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  check (content <> '' or jsonb_array_length(attachments) > 0)
);
create index messages_channel_created_idx on public.messages (channel_id, id desc);

create table public.invites (
  code text primary key default encode(extensions.gen_random_bytes(6), 'hex'),
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  max_uses int check (max_uses is null or max_uses > 0),
  uses int not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- ───────────── Yardımcı fonksiyonlar ─────────────

create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members where user_id = auth.uid());
$$;

create or replace function public.my_role()
returns public.member_role language sql stable security definer set search_path = '' as $$
  select role from public.members where user_id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.my_role() = 'admin', false);
$$;

create or replace function public.is_mod()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.my_role() in ('admin', 'mod'), false);
$$;

-- Yeni kullanıcıya profil aç (görünen ad kayıt sırasında metadata'dan gelir)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)), 32)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Davet koduyla katıl
create or replace function public.redeem_invite(invite_code text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  inv public.invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Giriş yapılmamış';
  end if;
  if exists (select 1 from public.members where user_id = auth.uid()) then
    return;
  end if;

  select * into inv from public.invites where code = lower(trim(invite_code)) for update;
  if not found then
    raise exception 'Davet kodu geçersiz';
  end if;
  if inv.expires_at is not null and inv.expires_at < now() then
    raise exception 'Davet kodunun süresi dolmuş';
  end if;
  if inv.max_uses is not null and inv.uses >= inv.max_uses then
    raise exception 'Davet kodunun kullanım hakkı bitmiş';
  end if;

  update public.invites set uses = uses + 1 where code = inv.code;
  insert into public.members (user_id, role) values (auth.uid(), 'member');
end;
$$;

-- Sunucuda henüz kimse yoksa ilk kullanıcı yönetici olur (kurulum adımı)
create or replace function public.claim_first_admin()
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    return false;
  end if;
  lock table public.members in exclusive mode;
  if exists (select 1 from public.members) then
    return false;
  end if;
  insert into public.members (user_id, role) values (auth.uid(), 'admin');
  return true;
end;
$$;

-- Sunucunun kurulu olup olmadığını (ilk yönetici var mı) giriş yapan herkes sorabilsin
create or replace function public.server_initialized()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members);
$$;

-- Mesaj yazarı yalnız içeriği değiştirebilsin; edited_at otomatik
create or replace function public.guard_message_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.id := old.id;
  new.channel_id := old.channel_id;
  new.author_id := old.author_id;
  new.created_at := old.created_at;
  new.reply_to := old.reply_to;
  if new.content is distinct from old.content or new.attachments is distinct from old.attachments then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

create trigger messages_guard_update
  before update on public.messages
  for each row execute function public.guard_message_update();

-- Son yönetici rolünü kaybetmesin / sunucudan atılamasın
create or replace function public.guard_last_admin()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'admin'
     and (tg_op = 'DELETE' or new.role <> 'admin')
     and (select count(*) from public.members where role = 'admin') <= 1 then
    raise exception 'Sunucuda en az bir yönetici kalmalı';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger members_guard_last_admin
  before update or delete on public.members
  for each row execute function public.guard_last_admin();

-- ───────────── RLS ─────────────

alter table public.profiles enable row level security;
alter table public.members enable row level security;
alter table public.channels enable row level security;
alter table public.messages enable row level security;
alter table public.invites enable row level security;

-- profiles
create policy "profil: kendi + üyeler okur" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_member());
create policy "profil: kendini günceller" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- members
create policy "üyeler: üyeler okur" on public.members
  for select to authenticated using (public.is_member() or user_id = auth.uid());
create policy "üyeler: yönetici rol değiştirir" on public.members
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "üyeler: yönetici atar, kişi ayrılır" on public.members
  for delete to authenticated using (public.is_admin() or user_id = auth.uid());

-- channels
create policy "kanallar: üyeler okur" on public.channels
  for select to authenticated using (public.is_member());
create policy "kanallar: yönetici ekler" on public.channels
  for insert to authenticated with check (public.is_admin());
create policy "kanallar: yönetici düzenler" on public.channels
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "kanallar: yönetici siler" on public.channels
  for delete to authenticated using (public.is_admin());

-- messages
create policy "mesajlar: üyeler okur" on public.messages
  for select to authenticated using (public.is_member());
create policy "mesajlar: üyeler yazar" on public.messages
  for insert to authenticated with check (
    public.is_member()
    and author_id = auth.uid()
    and exists (select 1 from public.channels c where c.id = channel_id and c.kind = 'text')
  );
create policy "mesajlar: yazar düzenler" on public.messages
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "mesajlar: yazar veya moderatör siler" on public.messages
  for delete to authenticated using (author_id = auth.uid() or public.is_mod());

-- invites (yalnız yönetici ve moderatör görür/oluşturur)
create policy "davetler: moderatör okur" on public.invites
  for select to authenticated using (public.is_mod());
create policy "davetler: moderatör oluşturur" on public.invites
  for insert to authenticated with check (public.is_mod() and created_by = auth.uid());
create policy "davetler: moderatör siler" on public.invites
  for delete to authenticated using (public.is_mod());

-- Tablo yetkileri (yeni projelerde tablolar Data API'ye otomatik açılmayabilir; erişimi RLS sınırlar)
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles, public.members, public.channels, public.messages, public.invites to authenticated;
revoke all on public.profiles, public.members, public.channels, public.messages, public.invites from anon;

-- Fonksiyon yetkileri
revoke execute on function public.redeem_invite(text) from public, anon;
revoke execute on function public.claim_first_admin() from public, anon;
revoke execute on function public.server_initialized() from public, anon;
grant execute on function public.redeem_invite(text) to authenticated;
grant execute on function public.claim_first_admin() to authenticated;
grant execute on function public.server_initialized() to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.guard_last_admin() from public, anon, authenticated;

-- ───────────── Realtime ─────────────

alter table public.messages replica identity full;
alter publication supabase_realtime add table public.messages, public.channels, public.members, public.profiles;

-- ───────────── Depolama (dosya ve avatar) ─────────────
-- Gizli kova: dosyalar yalnız üyelere imzalı bağlantıyla açılır.

insert into storage.buckets (id, name, public, file_size_limit)
values ('files', 'files', false, 26214400) -- 25 MB
on conflict (id) do nothing;

create policy "dosyalar: üyeler okur" on storage.objects
  for select to authenticated using (bucket_id = 'files' and public.is_member());
-- Yol biçimi: <kullanıcı id>/<rastgele>/<dosya adı>
create policy "dosyalar: üyeler kendi klasörüne yükler" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'files' and public.is_member()
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "dosyalar: sahibi siler" on storage.objects
  for delete to authenticated using (
    bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ───────────── Başlangıç kanalları ─────────────

insert into public.channels (name, kind, position) values
  ('genel', 'text', 0),
  ('duyurular', 'text', 1),
  ('Genel Ses', 'voice', 0),
  ('Oyun', 'voice', 1);
