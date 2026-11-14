-- Sunucu sahibinin "Yenile" düğmesi: sürüm sayısı artınca açık olan herkesin uygulaması yenilenir
create table public.server_state (
  id int primary key default 1 check (id = 1),
  reload_version int not null default 0,
  reload_note text check (char_length(reload_note) <= 200),
  reloaded_at timestamptz,
  reloaded_by uuid references public.profiles (id) on delete set null
);
insert into public.server_state (id) values (1);

alter table public.server_state enable row level security;
create policy "sunucu durumu: üyeler okur" on public.server_state for select to authenticated using (public.is_member());
grant select on public.server_state to authenticated;
revoke all on public.server_state from anon;

create or replace function public.broadcast_reload(note text default null)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v int;
begin
  if not public.is_owner() then
    raise exception 'Yenilemeyi yalnız sunucu sahibi başlatabilir';
  end if;
  update public.server_state
     set reload_version = reload_version + 1,
         reload_note = left(nullif(trim(note), ''), 200),
         reloaded_at = now(),
         reloaded_by = auth.uid()
   where id = 1
  returning reload_version into v;
  return v;
end;
$$;
revoke execute on function public.broadcast_reload(text) from public, anon;
grant execute on function public.broadcast_reload(text) to authenticated;

alter publication supabase_realtime add table public.server_state;
