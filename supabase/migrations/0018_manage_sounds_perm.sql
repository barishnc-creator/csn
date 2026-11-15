-- Revize #24: rollere "Soundpad'e ses ekleyebilir" yetkisi (manage_sounds).
-- Yöneticiler zaten her yetkiye sahip (has_perm). Yetkili üye ses ekler, kendi eklediğini siler.
alter table public.roles drop constraint roles_permissions_check;
alter table public.roles add constraint roles_permissions_check check (
  permissions <@ array['manage_channels','kick_members','create_invites','manage_messages','mention_everyone','submit_revisions','manage_sounds']::text[]
);

-- Mevcut yönetici politikalarına ek (izin veren politikalar VEYA ile birleşir)
create policy "sesler: yetkili ekler" on public.sounds
  for insert to authenticated with check (
    public.has_perm('manage_sounds')
    and created_by = auth.uid()
    and split_part(path, '/', 1) = auth.uid()::text);
create policy "sesler: yetkili kendi sesini siler" on public.sounds
  for delete to authenticated using (public.has_perm('manage_sounds') and created_by = auth.uid());
