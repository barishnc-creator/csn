-- Revize #26: ses odası kişi sınırı + "Üyeleri taşı" rol yetkisi + taşıma istekleri.

-- (a) Kişi sınırı: null = sınırsız. Yöneticiler sınıra takılmaz (livekit-token içinde).
alter table public.channels add column if not exists user_limit int
  check (user_limit is null or (user_limit between 1 and 99));

-- (c) Yeni rol yetkisi
alter table public.roles drop constraint roles_permissions_check;
alter table public.roles add constraint roles_permissions_check check (
  permissions <@ array['manage_channels','kick_members','create_invites','manage_messages','mention_everyone','submit_revisions','manage_sounds','move_members']::text[]
);

-- (d) Taşıma istekleri: yetkili ekler, hedef kişi realtime ile görüp o odaya geçer.
create table public.voice_moves (
  id bigint generated always as identity primary key,
  target uuid not null references auth.users (id) on delete cascade,
  channel_id uuid not null references public.channels (id) on delete cascade,
  moved_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index voice_moves_target_idx on public.voice_moves (target, created_at desc);
alter table public.voice_moves enable row level security;

create policy "taşıma: yetkili ekler" on public.voice_moves
  for insert to authenticated with check (
    public.has_perm('move_members')
    and moved_by = auth.uid()
    and exists (select 1 from public.members m where m.user_id = target)
    and exists (select 1 from public.channels c where c.id = channel_id and c.kind = 'voice'));

create policy "taşıma: hedef ve taşıyan görür" on public.voice_moves
  for select to authenticated using (target = auth.uid() or moved_by = auth.uid());

alter publication supabase_realtime add table public.voice_moves;
