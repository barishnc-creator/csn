-- Revize #20 + #22: müzik botu ayarları ve korumaları.
-- • Yöneticiler botun adını, resmini, özel durumunu, hakkında yazısını ve aktiflik durumunu düzenler
--   (update_bot_profile, yalnız is_admin()).
-- • profiles.bot_presence: botların görünen aktiflik durumu (insanlarda null).
-- • Bota arkadaşlık isteği gönderilemez, DM açılamaz (sunucu tarafında da).

alter table public.profiles
  add column if not exists bot_presence text check (bot_presence in ('online', 'idle', 'dnd', 'invisible'));

update public.profiles set bot_presence = 'online'
where id = 'b0700000-0000-4000-8000-00000000b070' and bot_presence is null;

create or replace function public.is_bot(uid uuid)
returns boolean language sql immutable set search_path = '' as $$
  select uid in ('b0700000-0000-4000-8000-00000000b070'::uuid, 'c5b00000-0000-4000-8000-00000000c5b0'::uuid);
$$;
grant execute on function public.is_bot(uuid) to authenticated;
revoke execute on function public.is_bot(uuid) from anon;

create or replace function public.update_bot_profile(
  bot uuid,
  p_display_name text,
  p_avatar_path text,
  p_custom_status text,
  p_bio text,
  p_presence text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Yalnız yöneticiler botu düzenleyebilir';
  end if;
  if bot is distinct from 'b0700000-0000-4000-8000-00000000b070'::uuid then
    raise exception 'Bu bot düzenlenemez';
  end if;
  if p_display_name is null or length(btrim(p_display_name)) = 0 or length(p_display_name) > 32 then
    raise exception 'Ad 1-32 karakter olmalı';
  end if;
  if p_presence not in ('online', 'idle', 'dnd', 'invisible') then
    raise exception 'Geçersiz durum';
  end if;
  -- Resim, CSN dosya deposunda yükleyen yöneticinin kendi klasöründe olmalı
  if p_avatar_path is not null and split_part(p_avatar_path, '/', 1) <> auth.uid()::text then
    raise exception 'Geçersiz resim';
  end if;
  update public.profiles set
    display_name = btrim(p_display_name),
    avatar_path = p_avatar_path,
    custom_status = nullif(btrim(coalesce(p_custom_status, '')), ''),
    bio = nullif(btrim(coalesce(p_bio, '')), ''),
    bot_presence = p_presence
  where id = bot;
end;
$$;
revoke execute on function public.update_bot_profile(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.update_bot_profile(uuid, text, text, text, text, text) to authenticated;

-- Bota arkadaşlık isteği yok
create or replace function public.reject_bot_friendship()
returns trigger language plpgsql set search_path = '' as $$
begin
  if public.is_bot(new.addressee) or public.is_bot(new.requester) then
    raise exception 'Botlara arkadaşlık isteği gönderilemez';
  end if;
  return new;
end;
$$;
revoke execute on function public.reject_bot_friendship() from public, anon, authenticated;
drop trigger if exists friendships_no_bots on public.friendships;
create trigger friendships_no_bots before insert or update on public.friendships
  for each row execute function public.reject_bot_friendship();

-- Botla DM açılmaz
create or replace function public.open_dm(other uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  me uuid := auth.uid();
  cid uuid;
begin
  if me is null or other is null or other = me then
    raise exception 'Geçersiz kişi';
  end if;
  if public.is_bot(other) then
    raise exception 'Botlara mesaj gönderilemez';
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
$function$;
