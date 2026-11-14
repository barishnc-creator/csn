-- Özel roller ve yetkiler, gizli kanallar, doğrudan mesajlar, emoji tepkileri,
-- sabitlenen mesajlar, genişletilmiş profil.

-- ───────────── Profil ─────────────
alter table public.profiles
  add column bio text check (char_length(bio) <= 300),
  add column pronouns text check (char_length(pronouns) <= 40),
  add column banner_color text check (banner_color ~ '^#[0-9a-fA-F]{6}$');

-- ───────────── Roller ─────────────
-- Yetkiler: manage_channels, kick_members, create_invites, manage_messages, mention_everyone
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 32),
  color text not null default '#99aab5' check (color ~ '^#[0-9a-fA-F]{6}$'),
  permissions text[] not null default '{}' check (
    permissions <@ array['manage_channels','kick_members','create_invites','manage_messages','mention_everyone']::text[]
  ),
  hoist boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table public.member_roles (
  user_id uuid not null references public.members (user_id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete cascade,
  primary key (user_id, role_id)
);

-- Yönetici her şeyi yapar; moderatör davet + mesaj yönetimi; özel roller yetki ekler
create or replace function public.has_perm(perm text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select case m.role
              when 'admin' then true
              when 'mod' then perm in ('create_invites', 'manage_messages', 'mention_everyone')
              else false
            end
       or exists (
         select 1 from public.member_roles mr join public.roles r on r.id = mr.role_id
         where mr.user_id = m.user_id and perm = any (r.permissions)
       )
     from public.members m where m.user_id = auth.uid()),
    false);
$$;

-- ───────────── Kanallar: gizli kanal + DM ─────────────
alter table public.channels add column allowed_roles uuid[];

create table public.channel_members (
  channel_id uuid not null references public.channels (id) on delete cascade,
  user_id uuid not null references public.members (user_id) on delete cascade,
  primary key (channel_id, user_id)
);
create index channel_members_user_idx on public.channel_members (user_id);

create or replace function public.can_view_channel(cid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.channels c
    where c.id = cid and (
      (c.kind = 'dm' and exists (
        select 1 from public.channel_members cm where cm.channel_id = c.id and cm.user_id = auth.uid()))
      or (c.kind <> 'dm' and public.is_member() and (
        c.allowed_roles is null or cardinality(c.allowed_roles) = 0 or public.is_admin()
        or exists (select 1 from public.member_roles mr where mr.user_id = auth.uid() and mr.role_id = any (c.allowed_roles))))
    )
  );
$$;

-- İki üye arasında DM kanalı bul ya da aç
create or replace function public.open_dm(other uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  cid uuid;
begin
  if me is null or other is null or other = me then
    raise exception 'Geçersiz kişi';
  end if;
  if not exists (select 1 from public.members where user_id = me)
     or not exists (select 1 from public.members where user_id = other) then
    raise exception 'İki kişi de CSN üyesi olmalı';
  end if;

  select c.id into cid
  from public.channels c
  where c.kind = 'dm'
    and exists (select 1 from public.channel_members where channel_id = c.id and user_id = me)
    and exists (select 1 from public.channel_members where channel_id = c.id and user_id = other)
    and (select count(*) from public.channel_members where channel_id = c.id) = 2
  limit 1;

  if cid is null then
    insert into public.channels (name, kind, position) values ('dm', 'dm', 0) returning id into cid;
    insert into public.channel_members (channel_id, user_id) values (cid, me), (cid, other);
  end if;
  return cid;
end;
$$;

-- ───────────── Mesajlar: sabitleme ─────────────
alter table public.messages
  add column pinned_at timestamptz,
  add column pinned_by uuid references public.profiles (id) on delete set null;

create or replace function public.guard_message_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.id := old.id;
  new.channel_id := old.channel_id;
  new.author_id := old.author_id;
  new.created_at := old.created_at;
  new.reply_to := old.reply_to;
  if current_user in ('authenticated', 'anon') then
    new.pinned_at := old.pinned_at;
    new.pinned_by := old.pinned_by;
  end if;
  if new.content is distinct from old.content or new.attachments is distinct from old.attachments then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

create or replace function public.toggle_pin(mid bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  msg public.messages%rowtype;
  kind public.channel_kind;
begin
  select * into msg from public.messages where id = mid;
  if not found or not public.can_view_channel(msg.channel_id) then
    raise exception 'Mesaj bulunamadı';
  end if;
  select c.kind into kind from public.channels c where c.id = msg.channel_id;
  if kind <> 'dm' and not public.has_perm('manage_messages') then
    raise exception 'Mesaj sabitleme yetkin yok';
  end if;
  update public.messages
     set pinned_at = case when pinned_at is null then now() end,
         pinned_by = case when pinned_at is null then auth.uid() end
   where id = mid;
  return msg.pinned_at is null;
end;
$$;

-- ───────────── Emoji tepkileri ─────────────
create table public.reactions (
  message_id bigint not null references public.messages (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
create index reactions_message_idx on public.reactions (message_id);

-- ───────────── RLS (yeniden) ─────────────
alter table public.roles enable row level security;
alter table public.member_roles enable row level security;
alter table public.channel_members enable row level security;
alter table public.reactions enable row level security;

-- roles / member_roles: üyeler görür, yönetici yönetir
create policy "roller: üyeler okur" on public.roles for select to authenticated using (public.is_member());
create policy "roller: yönetici ekler" on public.roles for insert to authenticated with check (public.is_admin());
create policy "roller: yönetici düzenler" on public.roles for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "roller: yönetici siler" on public.roles for delete to authenticated using (public.is_admin());
create policy "rol atamaları: üyeler okur" on public.member_roles for select to authenticated using (public.is_member());
create policy "rol atamaları: yönetici verir" on public.member_roles for insert to authenticated with check (public.is_admin());
create policy "rol atamaları: yönetici alır" on public.member_roles for delete to authenticated using (public.is_admin());

-- channel_members: aynı DM'deki kişiler görür (yazma yalnız open_dm ile)
create policy "dm üyeleri: katılımcılar okur" on public.channel_members
  for select to authenticated using (public.can_view_channel(channel_id));

-- channels
drop policy "kanallar: üyeler okur" on public.channels;
drop policy "kanallar: yönetici ekler" on public.channels;
drop policy "kanallar: yönetici düzenler" on public.channels;
drop policy "kanallar: yönetici siler" on public.channels;
create policy "kanallar: erişimi olan okur" on public.channels
  for select to authenticated using (public.can_view_channel(id));
create policy "kanallar: yetkili ekler" on public.channels
  for insert to authenticated with check (public.has_perm('manage_channels') and kind <> 'dm');
create policy "kanallar: yetkili düzenler" on public.channels
  for update to authenticated using (public.has_perm('manage_channels') and kind <> 'dm')
  with check (public.has_perm('manage_channels') and kind <> 'dm');
create policy "kanallar: yetkili siler" on public.channels
  for delete to authenticated using (public.has_perm('manage_channels') and kind <> 'dm');

-- messages
drop policy "mesajlar: üyeler okur" on public.messages;
drop policy "mesajlar: üyeler yazar" on public.messages;
drop policy "mesajlar: yazar veya moderatör siler" on public.messages;
create policy "mesajlar: kanalı görenler okur" on public.messages
  for select to authenticated using (public.can_view_channel(channel_id));
create policy "mesajlar: kanalı görenler yazar" on public.messages
  for insert to authenticated with check (
    public.is_member() and author_id = auth.uid() and public.can_view_channel(channel_id)
    and exists (select 1 from public.channels c where c.id = channel_id and c.kind in ('text', 'dm'))
  );
create policy "mesajlar: yazar veya yetkili siler" on public.messages
  for delete to authenticated using (
    author_id = auth.uid()
    or (public.has_perm('manage_messages')
        and exists (select 1 from public.channels c where c.id = channel_id and c.kind <> 'dm'))
  );

-- reactions
create policy "tepkiler: kanalı görenler okur" on public.reactions
  for select to authenticated using (
    exists (select 1 from public.messages m where m.id = message_id and public.can_view_channel(m.channel_id)));
create policy "tepkiler: kendi adına ekler" on public.reactions
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from public.messages m where m.id = message_id and public.can_view_channel(m.channel_id)));
create policy "tepkiler: kendininkini kaldırır" on public.reactions
  for delete to authenticated using (user_id = auth.uid());

-- invites: yetkiye bağlı
drop policy "davetler: moderatör okur" on public.invites;
drop policy "davetler: moderatör oluşturur" on public.invites;
drop policy "davetler: moderatör siler" on public.invites;
create policy "davetler: yetkili okur" on public.invites for select to authenticated using (public.has_perm('create_invites'));
create policy "davetler: yetkili oluşturur" on public.invites for insert to authenticated
  with check (public.has_perm('create_invites') and created_by = auth.uid());
create policy "davetler: yetkili siler" on public.invites for delete to authenticated using (public.has_perm('create_invites'));

-- members: atma yetkisi olan yalnız "üye" rolündekileri atabilir
drop policy "üyeler: yönetici atar, kişi ayrılır" on public.members;
create policy "üyeler: yetkili atar, kişi ayrılır" on public.members
  for delete to authenticated using (
    public.is_admin() or user_id = auth.uid() or (public.has_perm('kick_members') and role = 'member'));

-- ───────────── Yetkiler ─────────────
grant select, insert, update, delete on public.roles, public.member_roles, public.reactions to authenticated;
grant select on public.channel_members to authenticated;
revoke all on public.roles, public.member_roles, public.channel_members, public.reactions from anon;

revoke execute on function public.has_perm(text) from public, anon;
revoke execute on function public.can_view_channel(uuid) from public, anon;
revoke execute on function public.open_dm(uuid) from public, anon;
revoke execute on function public.toggle_pin(bigint) from public, anon;
grant execute on function public.has_perm(text) to authenticated;
grant execute on function public.can_view_channel(uuid) to authenticated;
grant execute on function public.open_dm(uuid) to authenticated;
grant execute on function public.toggle_pin(bigint) to authenticated;

alter table public.reactions replica identity full;
alter publication supabase_realtime add table public.roles, public.member_roles, public.channel_members, public.reactions;
