-- Güvenlik denetimi: Realtime yayın/presence kanalları herkese açıktı (publishable anahtarı olan
-- herkes "kim çevrimiçi / hangi ses odasında" bilgisini görebilir, sahte presence ve "yazıyor…" gönderebilirdi).
-- İstemci artık tüm kanalları `private: true` açar; erişim aşağıdaki kurallarla yalnız üyelere verilir.
-- typing-<kanal> ve soundpad-<kanal> konularında ayrıca kanalı görme izni gerekir (gizli kanal / DM).
-- Not: Realtime Settings → "Allow public access" kapatılınca kurallar zorunlu hale gelir.

create or replace function public.can_use_realtime_topic(topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_member() and (
    case
      when topic ~ '^(typing|soundpad)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.can_view_channel(substring(topic from '[0-9a-f-]{36}$')::uuid)
      else true
    end
  );
$$;
revoke execute on function public.can_use_realtime_topic(text) from public, anon;
grant execute on function public.can_use_realtime_topic(text) to authenticated;

create policy "csn: üyeler gerçek zamanlı kanalları dinler" on realtime.messages
  for select to authenticated
  using (public.can_use_realtime_topic(realtime.topic()));

create policy "csn: üyeler gerçek zamanlı kanallara yazar" on realtime.messages
  for insert to authenticated
  with check (public.can_use_realtime_topic(realtime.topic()));
