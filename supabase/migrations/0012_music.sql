-- "Birlikte dinle": ses kanalı başına ortak müzik durumu.
-- Ses sunucudan akmaz; her istemci aynı YouTube videosunu resmi IFrame oynatıcısıyla çalar,
-- bu tablo yalnız kuyruğu ve konumu eşitler.
create table public.music_state (
  channel_id uuid primary key references public.channels (id) on delete cascade,
  queue jsonb not null default '[]'::jsonb,   -- [{videoId, title, addedBy}]
  current jsonb,                               -- çalan öğe ya da null
  started_at timestamptz,                      -- çalan öğenin 0. saniyesinin sunucu zamanı
  paused boolean not null default false,
  paused_at int not null default 0,            -- duraklatınca konum (sn); oynarken başlangıç konumu
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(queue) = 'array' and jsonb_array_length(queue) <= 100),
  check (current is null or jsonb_typeof(current) = 'object'),
  check (paused_at >= 0 and paused_at < 86400),
  check (pg_column_size(queue) < 65536)
);

-- Zamanı istemci değil sunucu belirler: oynatma başlarken / devam ederken / parça değişince
-- started_at = now() - paused_at. updated_at her yazmada yenilenir (çift ilerlemeye karşı koşullu güncelleme bunu kullanır).
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
    or old.started_at is null
  ) then
    new.started_at := pg_catalog.now() - pg_catalog.make_interval(secs => new.paused_at);
  end if;
  return new;
end;
$$;
revoke execute on function public.music_state_stamp() from public, anon, authenticated;

create trigger music_state_stamp
  before insert or update on public.music_state
  for each row execute function public.music_state_stamp();

-- İstemci saat farkını ölçmek için sunucu saati
create or replace function public.server_now()
returns timestamptz language sql stable set search_path = '' as $$
  select pg_catalog.now();
$$;
revoke execute on function public.server_now() from public, anon;
grant execute on function public.server_now() to authenticated;

alter table public.music_state enable row level security;
-- Kanalı görebilen her üye görür ve yönetir (bot gibi; ayrı yetki yok)
create policy "müzik: kanalı gören okur" on public.music_state
  for select to authenticated using (public.can_view_channel(channel_id));
create policy "müzik: kanalı gören başlatır" on public.music_state
  for insert to authenticated with check (public.can_view_channel(channel_id));
create policy "müzik: kanalı gören yönetir" on public.music_state
  for update to authenticated using (public.can_view_channel(channel_id)) with check (public.can_view_channel(channel_id));

grant select, insert, update on public.music_state to authenticated;
revoke all on public.music_state from anon;

alter table public.music_state replica identity full;
alter publication supabase_realtime add table public.music_state;
