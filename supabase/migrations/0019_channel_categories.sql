-- Revize #25: kanal kategorileri. Ses (ve metin) kanalları yöneticilerin açtığı kategorilere ayrılır.
create table public.channel_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 32),
  kind public.channel_kind not null check (kind in ('text', 'voice')),
  position int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.channel_categories enable row level security;
create policy "kategoriler: üyeler görür" on public.channel_categories
  for select to authenticated using (public.is_member());
create policy "kategoriler: yetkili ekler" on public.channel_categories
  for insert to authenticated with check (public.has_perm('manage_channels'));
create policy "kategoriler: yetkili düzenler" on public.channel_categories
  for update to authenticated using (public.has_perm('manage_channels')) with check (public.has_perm('manage_channels'));
create policy "kategoriler: yetkili siler" on public.channel_categories
  for delete to authenticated using (public.has_perm('manage_channels'));
grant select, insert, update, delete on public.channel_categories to authenticated;
revoke all on public.channel_categories from anon;

-- Kategori silinince kanallar kategorisiz kalır (silinmez)
alter table public.channels add column category_id uuid references public.channel_categories (id) on delete set null;

alter table public.channel_categories replica identity full;
alter publication supabase_realtime add table public.channel_categories;
