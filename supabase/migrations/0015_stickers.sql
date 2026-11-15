-- Revize #15: sunucu stickerları. Yöneticiler (sunucu sahibi dahil) yükler / siler, tüm üyeler gönderir.
-- Dosyalar gizli `files` kovasında durur (yol: <yükleyen id>/stickers/<rastgele>.<uzantı>).
-- Mesajda sticker şu biçimde gider: [sticker:<uuid>]
create table public.stickers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 32),
  path text not null check (char_length(path) between 3 and 300),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index stickers_created_at_idx on public.stickers (created_at);

alter table public.stickers enable row level security;
create policy "stickerlar: üyeler görür" on public.stickers
  for select to authenticated using (public.is_member());
create policy "stickerlar: yönetici ekler" on public.stickers
  for insert to authenticated with check (
    public.is_admin()
    and created_by = auth.uid()
    and split_part(path, '/', 1) = auth.uid()::text);
create policy "stickerlar: yönetici düzenler" on public.stickers
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "stickerlar: yönetici siler" on public.stickers
  for delete to authenticated using (public.is_admin());

grant select, insert, update, delete on public.stickers to authenticated;
revoke all on public.stickers from anon;

alter table public.stickers replica identity full;
alter publication supabase_realtime add table public.stickers;
