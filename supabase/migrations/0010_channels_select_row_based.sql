-- Kanal okuma kuralı satırın kendi alanlarına bakar; böylece INSERT ... RETURNING'de
-- yeni eklenen kanal da okunabilir ("new row violates row-level security policy" hatası)
drop policy if exists "kanallar: erişimi olan okur" on public.channels;
create policy "kanallar: erişimi olan okur" on public.channels
  for select to authenticated using (
    (kind = 'dm' and exists (
      select 1 from public.channel_members cm where cm.channel_id = id and cm.user_id = auth.uid()))
    or (kind <> 'dm' and public.is_member() and (
      allowed_roles is null or cardinality(allowed_roles) = 0 or public.is_admin()
      or exists (select 1 from public.member_roles mr where mr.user_id = auth.uid() and mr.role_id = any (allowed_roles))))
  );
