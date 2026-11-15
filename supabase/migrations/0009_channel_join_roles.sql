-- Revize #6: kanal başına "kimler girebilir" (ses: bağlanma, metin: yazma)
-- allowed_roles = kimler GÖREBİLİR (boş → herkes), join_roles = görenlerden kimler GİREBİLİR (boş → gören herkes)
alter table public.channels add column join_roles uuid[];

create or replace function public.can_join_channel(cid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_view_channel(cid) and exists (
    select 1 from public.channels c
    where c.id = cid and (
      c.kind = 'dm' or c.join_roles is null or cardinality(c.join_roles) = 0 or public.is_admin()
      or exists (select 1 from public.member_roles mr where mr.user_id = auth.uid() and mr.role_id = any (c.join_roles))
    )
  );
$$;
revoke execute on function public.can_join_channel(uuid) from public, anon;
grant execute on function public.can_join_channel(uuid) to authenticated;

drop policy "mesajlar: kanalı görenler yazar" on public.messages;
create policy "mesajlar: girebilenler yazar" on public.messages
  for insert to authenticated with check (
    public.is_member() and author_id = auth.uid() and public.can_join_channel(channel_id)
    and exists (select 1 from public.channels c where c.id = channel_id and c.kind in ('text', 'dm'))
  );
