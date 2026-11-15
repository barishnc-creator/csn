-- Soundpad: yöneticilerin yüklediği kısa sesler; ses kanalındaki herkes çalabilir.
-- Dosyalar gizli `files` kovasında durur (yol: <yükleyen id>/<rastgele>/<ad>).
-- Çalma sinyali veritabanına yazılmaz; Supabase Realtime yayın kanalıyla (soundpad-<kanal id>) gider.
create table public.sounds (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 32),
  emoji text not null default '🔊' check (char_length(emoji) between 1 and 8),
  path text not null check (char_length(path) between 3 and 300),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index sounds_created_at_idx on public.sounds (created_at);

alter table public.sounds enable row level security;
create policy "sesler: üyeler görür" on public.sounds
  for select to authenticated using (public.is_member());
create policy "sesler: yönetici ekler" on public.sounds
  for insert to authenticated with check (
    public.is_admin()
    and created_by = auth.uid()
    and split_part(path, '/', 1) = auth.uid()::text);
create policy "sesler: yönetici düzenler" on public.sounds
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "sesler: yönetici siler" on public.sounds
  for delete to authenticated using (public.is_admin());

grant select, insert, update, delete on public.sounds to authenticated;
revoke all on public.sounds from anon;

alter table public.sounds replica identity full;
alter publication supabase_realtime add table public.sounds;
