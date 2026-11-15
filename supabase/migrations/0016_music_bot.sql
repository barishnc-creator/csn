-- Revize #18: müzik botu.
-- • "CSN Müzik" bot hesabı (giriş yapılamaz) sunucu üyesi olarak görünür; rol verilebilir.
-- • music_state: tekrar modu (loop), kontrol konsolunun gösterileceği metin kanalı (control_channel_id)
--   ve parçayı baştan başlatmak için sayaç (rev).
alter table public.music_state
  add column loop text not null default 'off' check (loop in ('off', 'one', 'all')),
  add column rev int not null default 0 check (rev >= 0),
  add column control_channel_id uuid references public.channels (id) on delete set null;

create or replace function public.music_state_stamp()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := pg_catalog.now();
  new.updated_by := auth.uid();
  if new.current is null then
    new.started_at := null;
    new.paused := false;
    new.paused_at := 0;
  elsif not new.paused and (
    tg_op = 'INSERT'
    or old.paused
    or new.current is distinct from old.current
    or new.paused_at is distinct from old.paused_at
    or new.rev is distinct from old.rev
    or old.started_at is null
  ) then
    new.started_at := pg_catalog.now() - pg_catalog.make_interval(secs => new.paused_at);
  end if;
  return new;
end;
$$;
revoke execute on function public.music_state_stamp() from public, anon, authenticated;

-- Bot hesabı: parolası yok, giriş yapılamaz
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous)
values ('b0700000-0000-4000-8000-00000000b070', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'muzik-bot@csn.invalid', '{"provider":"bot"}', '{"display_name":"CSN Müzik"}', now(), now(), false, false)
on conflict (id) do nothing;

insert into public.profiles (id, display_name, custom_status, bio, banner_color)
values ('b0700000-0000-4000-8000-00000000b070', 'CSN Müzik', 'Ses kanalında /çal yaz',
        'CSN''nin müzik botu. Ses kanalındayken /çal <YouTube bağlantısı> yaz; komutu yazdığın kanalda kontrol konsolu açılır.', '#1db954')
on conflict (id) do update set display_name = excluded.display_name, custom_status = excluded.custom_status, bio = excluded.bio, banner_color = excluded.banner_color;

insert into public.members (user_id, role) values ('b0700000-0000-4000-8000-00000000b070', 'member')
on conflict (user_id) do nothing;
