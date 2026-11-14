-- Revize #3: 4 haneli otomatik isim etiketi (#0001, #0002 …) + kapak fotoğrafı
create sequence public.profile_tag_seq start 1;

alter table public.profiles
  add column tag int unique,
  add column banner_path text;

-- Mevcut kullanıcılara kayıt sırasına göre etiket ver
with ordered as (select id, row_number() over (order by created_at) as n from public.profiles)
update public.profiles p set tag = o.n from ordered o where o.id = p.id;
select setval('public.profile_tag_seq', coalesce((select max(tag) from public.profiles), 0) + 1, false);

alter table public.profiles alter column tag set default nextval('public.profile_tag_seq');
alter table public.profiles alter column tag set not null;

-- Etiket kullanıcı tarafından değiştirilemez
create or replace function public.guard_profile_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.tag := old.tag;
    new.id := old.id;
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_profile_update() from public, anon, authenticated;
create trigger profiles_guard_update before update on public.profiles
  for each row execute function public.guard_profile_update();
