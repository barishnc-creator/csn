-- Sunucu teması: yöneticiler seçer, herkese anında uygulanır
alter table public.server_state
  add column theme text not null default 'midnight'
    check (theme in ('midnight', 'tokyo', 'catppuccin', 'nord', 'rosepine')),
  add column accent text check (accent ~ '^#[0-9a-fA-F]{6}$');

create or replace function public.set_server_theme(new_theme text, new_accent text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Temayı yalnız yöneticiler değiştirebilir';
  end if;
  update public.server_state set theme = new_theme, accent = nullif(new_accent, '') where id = 1;
end;
$$;
revoke execute on function public.set_server_theme(text, text) from public, anon;
grant execute on function public.set_server_theme(text, text) to authenticated;
