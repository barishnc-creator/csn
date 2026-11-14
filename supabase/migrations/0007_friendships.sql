-- Revize #2: arkadaşlık istekleri (gönder → kabul / reddet)
create type public.friend_status as enum ('pending', 'accepted');

create table public.friendships (
  id bigint generated always as identity primary key,
  requester uuid not null default auth.uid() references public.members (user_id) on delete cascade,
  addressee uuid not null references public.members (user_id) on delete cascade,
  status public.friend_status not null default 'pending',
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  check (requester <> addressee)
);
-- İki kişi arasında tek kayıt (yönü fark etmez)
create unique index friendships_pair on public.friendships (least(requester, addressee), greatest(requester, addressee));
create index friendships_addressee_idx on public.friendships (addressee);

-- Yalnız alıcı kabul edebilir; başka alan değişmez
create or replace function public.guard_friendship_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if old.status <> 'pending' or new.status <> 'accepted' or old.addressee <> auth.uid() then
    raise exception 'Bu isteği yalnız alıcı kabul edebilir';
  end if;
  new.id := old.id;
  new.requester := old.requester;
  new.addressee := old.addressee;
  new.created_at := old.created_at;
  new.accepted_at := now();
  return new;
end;
$$;
revoke execute on function public.guard_friendship_update() from public, anon, authenticated;

create trigger friendships_guard_update
  before update on public.friendships
  for each row execute function public.guard_friendship_update();

alter table public.friendships enable row level security;
create policy "arkadaşlık: taraflar görür" on public.friendships
  for select to authenticated using (auth.uid() in (requester, addressee));
create policy "arkadaşlık: üye istek gönderir" on public.friendships
  for insert to authenticated with check (
    requester = auth.uid() and status = 'pending' and accepted_at is null
    and public.is_member() and exists (select 1 from public.members where user_id = addressee));
create policy "arkadaşlık: alıcı kabul eder" on public.friendships
  for update to authenticated using (addressee = auth.uid()) with check (addressee = auth.uid());
-- Reddetme, iptal ve arkadaşlıktan çıkarma = silme
create policy "arkadaşlık: taraflar siler" on public.friendships
  for delete to authenticated using (auth.uid() in (requester, addressee));

grant select, insert, update, delete on public.friendships to authenticated;
revoke all on public.friendships from anon;

alter table public.friendships replica identity full;
alter publication supabase_realtime add table public.friendships;
