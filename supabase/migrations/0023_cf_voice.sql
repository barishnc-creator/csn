-- Ses için ikinci arka uç: Cloudflare Realtime SFU (ayda 1.000 GB ücretsiz).
--   voice_mode = 'cf' : ses Cloudflare üzerinden (cf-voice Edge Function). LiveKit yolu aynen durur.
-- Cloudflare'de "oda" kavramı yok: kimin hangi kanalda, hangi oturumla, hangi izleri yayınladığını
-- voice_sessions tutar. Satırları yalnız cf-voice (service role) yazar; üyeler görebildikleri
-- kanalın satırlarını okur. cf-voice bir ize abone olma isteğinde hedefin aynı kanalda olduğunu
-- bu tablodan doğrular.

alter table public.server_state drop constraint if exists server_state_voice_mode_check;
alter table public.server_state
  add constraint server_state_voice_mode_check check (voice_mode in ('auto', 'cloud', 'self', 'cf'));

create or replace function public.set_voice_mode(mode text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then
    raise exception 'Ses sunucusunu yalnız sunucu sahibi değiştirebilir';
  end if;
  if mode not in ('auto', 'cloud', 'self', 'cf') then
    raise exception 'Geçersiz seçim';
  end if;
  update public.server_state set voice_mode = mode, voice_fallback_until = null where id = 1;
end;
$$;
revoke execute on function public.set_voice_mode(text) from public, anon;
grant execute on function public.set_voice_mode(text) to authenticated;

create table public.voice_sessions (
  user_id uuid primary key references public.members (user_id) on delete cascade,
  channel_id uuid not null references public.channels (id) on delete cascade,
  pub_session text not null, -- Cloudflare oturumu: bu kişinin yayınladığı izler
  sub_session text not null, -- Cloudflare oturumu: bu kişinin dinlediği izler
  tracks text[] not null default '{}', -- yayındaki iz adları: mic, cam, screen, screen-audio
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index voice_sessions_channel_idx on public.voice_sessions (channel_id);

alter table public.voice_sessions enable row level security;

create policy "csn: kanalı görenler ses oturumlarını okur" on public.voice_sessions
  for select to authenticated
  using (public.can_view_channel(channel_id));
-- insert / update / delete kuralı yok: yalnız cf-voice (service role) ve aşağıdaki işlevler yazar.

-- Yaşam sinyali (30 sn'de bir): kendi satırını tazeler, kanaldaki taze satırları döndürür.
-- 90 sn sinyal vermeyen (sekmesi kapanan, bağlantısı kopan) kişi odada sayılmaz.
create or replace function public.voice_beat()
returns setof public.voice_sessions language plpgsql security definer set search_path = '' as $$
declare
  cid uuid;
begin
  update public.voice_sessions set last_seen = now() where user_id = auth.uid() returning channel_id into cid;
  if cid is null then
    return;
  end if;
  return query
    select * from public.voice_sessions v
    where v.channel_id = cid and v.last_seen > now() - interval '90 seconds';
end;
$$;
revoke execute on function public.voice_beat() from public, anon;
grant execute on function public.voice_beat() to authenticated;

-- Odadan çıkış: yalnız o oturuma aitse siler (başka odaya geçince yeni satır silinmesin).
create or replace function public.voice_leave(pub text)
returns void language sql security definer set search_path = '' as $$
  delete from public.voice_sessions where user_id = auth.uid() and pub_session = pub;
$$;
revoke execute on function public.voice_leave(text) from public, anon;
grant execute on function public.voice_leave(text) to authenticated;

alter publication supabase_realtime add table public.voice_sessions;
