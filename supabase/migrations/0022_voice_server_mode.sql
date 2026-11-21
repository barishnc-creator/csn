-- Ses sunucusu seçimi: LiveKit Cloud önce, kota/bağlantı sorununda kendi (yedek) sunucumuz.
--   auto  : Cloud; biri Cloud'a bağlanamazsa livekit-token herkesi 3 saatliğine yedeğe geçirir
--   cloud : her zaman Cloud
--   self  : her zaman yedek sunucu (ayakta değilse Cloud)
alter table public.server_state
  add column voice_mode text not null default 'auto' check (voice_mode in ('auto', 'cloud', 'self')),
  add column voice_fallback_until timestamptz;

-- voice_fallback_until yalnız livekit-token (service role) tarafından yazılır; üyeler okur (mevcut kural).
create or replace function public.set_voice_mode(mode text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then
    raise exception 'Ses sunucusunu yalnız sunucu sahibi değiştirebilir';
  end if;
  if mode not in ('auto', 'cloud', 'self') then
    raise exception 'Geçersiz seçim';
  end if;
  update public.server_state set voice_mode = mode, voice_fallback_until = null where id = 1;
end;
$$;
revoke execute on function public.set_voice_mode(text) from public, anon;
grant execute on function public.set_voice_mode(text) to authenticated;
