-- Revize #9: rollere "revize verebilir" yetkisi (submit_revisions)
alter table public.roles drop constraint roles_permissions_check;
alter table public.roles add constraint roles_permissions_check check (
  permissions <@ array['manage_channels','kick_members','create_invites','manage_messages','mention_everyone','submit_revisions']::text[]
);

-- Revizeleri görme/yazma: yöneticiler (has_perm her yetkiyi verir) + bu yetkiye sahip roller
drop policy "revizeler: yöneticiler okur" on public.revisions;
drop policy "revizeler: yöneticiler yazar" on public.revisions;
drop policy "revizeler: yazar veya sahip günceller" on public.revisions;

create policy "revizeler: yetkililer okur" on public.revisions
  for select to authenticated using (public.has_perm('submit_revisions'));
create policy "revizeler: yetkililer yazar" on public.revisions
  for insert to authenticated with check (
    public.has_perm('submit_revisions') and created_by = auth.uid() and status = 'pending'
    and decided_by is null and owner_note is null and dev_note is null
  );
-- Onay yine yalnız sahibin (tetikleyici guard_revision_update); yazar yalnız bekleyen metnini düzenler
create policy "revizeler: yazar veya sahip günceller" on public.revisions
  for update to authenticated
  using (public.has_perm('submit_revisions') and (created_by = auth.uid() or public.is_owner()))
  with check (public.has_perm('submit_revisions'));
