-- Sunucu sahibi + revize (değişiklik isteği) sistemi
--
-- Sahip: sunucuyu ilk kuran yönetici. Rolü düşürülemez, sunucudan atılamaz.
-- Revize: yöneticiler CSN için değişiklik isteği yazar; yalnız sahip onaylar/reddeder.
-- Geliştirici (Claude) yalnız durumu 'approved' olan revizeleri uygular.

-- ───────────── Sahip ─────────────

alter table public.members add column is_owner boolean not null default false;
create unique index members_single_owner on public.members (is_owner) where is_owner;

-- Mevcut sunucuda sahip = ilk katılan yönetici
update public.members set is_owner = true
where user_id = (select user_id from public.members where role = 'admin' order by joined_at limit 1);

-- İlk yönetici olan kişi otomatik sahip olsun
create or replace function public.claim_first_admin()
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    return false;
  end if;
  lock table public.members in exclusive mode;
  if exists (select 1 from public.members) then
    return false;
  end if;
  insert into public.members (user_id, role, is_owner) values (auth.uid(), 'admin', true);
  return true;
end;
$$;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select is_owner from public.members where user_id = auth.uid()), false);
$$;
revoke execute on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated;

-- Sahip korunur: rolü değişmez, atılamaz; sahiplik API'den değiştirilemez
-- SECURITY INVOKER: current_user çağıranın rolünü göstersin
create or replace function public.guard_owner()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.is_owner then
      raise exception 'Sunucu sahibi sunucudan çıkarılamaz';
    end if;
    return old;
  end if;
  if new.is_owner is distinct from old.is_owner and current_user in ('authenticated', 'anon') then
    raise exception 'Sahiplik buradan değiştirilemez';
  end if;
  if old.is_owner and new.role <> 'admin' then
    raise exception 'Sunucu sahibinin rolü değiştirilemez';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_owner() from public, anon, authenticated;

create trigger members_guard_owner
  before update or delete on public.members
  for each row execute function public.guard_owner();

-- ───────────── Revizeler ─────────────

create type public.revision_status as enum ('pending', 'approved', 'rejected', 'in_progress', 'done');

create table public.revisions (
  id bigint generated always as identity primary key,
  title text not null check (char_length(title) between 3 and 120),
  description text not null default '' check (char_length(description) <= 4000),
  status public.revision_status not null default 'pending',
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  owner_note text check (char_length(owner_note) <= 1000),
  dev_note text check (char_length(dev_note) <= 2000),
  updated_at timestamptz not null default now()
);
create index revisions_status_idx on public.revisions (status, created_at desc);

-- Kim neyi değiştirebilir (RLS satırı seçer, bu tetikleyici sütunları denetler)
create or replace function public.guard_revision_update()
returns trigger language plpgsql set search_path = '' as $$
declare
  owner boolean := public.is_owner();
begin
  -- Sunucu tarafı (service role / geliştirici) serbest
  if current_user not in ('authenticated', 'anon') then
    new.updated_at := now();
    return new;
  end if;

  new.id := old.id;
  new.created_by := old.created_by;
  new.created_at := old.created_at;

  if owner then
    -- Sahip karar verir; geliştirici notunu değiştiremez
    new.dev_note := old.dev_note;
    if new.status is distinct from old.status then
      if new.status in ('approved', 'rejected') then
        new.decided_by := auth.uid();
        new.decided_at := now();
      elsif new.status = 'pending' then
        new.decided_by := null;
        new.decided_at := null;
      end if;
    else
      new.decided_by := old.decided_by;
      new.decided_at := old.decided_at;
    end if;
    -- Sahip başkasının metnini değiştirmez (kendi revizesi hariç)
    if old.created_by <> auth.uid() then
      new.title := old.title;
      new.description := old.description;
    end if;
  else
    -- Yazar: yalnız onay bekleyen revizesinin metnini düzenler
    if old.created_by <> auth.uid() or old.status <> 'pending' then
      raise exception 'Bu revizeyi yalnız sunucu sahibi değiştirebilir';
    end if;
    new.status := old.status;
    new.decided_by := old.decided_by;
    new.decided_at := old.decided_at;
    new.owner_note := old.owner_note;
    new.dev_note := old.dev_note;
  end if;

  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.guard_revision_update() from public, anon, authenticated;

create trigger revisions_guard_update
  before update on public.revisions
  for each row execute function public.guard_revision_update();

alter table public.revisions enable row level security;

create policy "revizeler: yöneticiler okur" on public.revisions
  for select to authenticated using (public.is_admin());
create policy "revizeler: yöneticiler yazar" on public.revisions
  for insert to authenticated with check (
    public.is_admin() and created_by = auth.uid() and status = 'pending'
    and decided_by is null and owner_note is null and dev_note is null
  );
create policy "revizeler: yazar veya sahip günceller" on public.revisions
  for update to authenticated
  using (public.is_admin() and (created_by = auth.uid() or public.is_owner()))
  with check (public.is_admin());
create policy "revizeler: bekleyeni yazar, her şeyi sahip siler" on public.revisions
  for delete to authenticated
  using (public.is_owner() or (created_by = auth.uid() and status = 'pending'));

grant select, insert, update, delete on public.revisions to authenticated;
revoke all on public.revisions from anon;

alter publication supabase_realtime add table public.revisions;
