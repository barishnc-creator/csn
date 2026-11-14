-- Güvenlik denetimi: yardımcı fonksiyonlar girişsiz (anon) çağrılamasın
revoke execute on function public.is_member() from public, anon;
revoke execute on function public.my_role() from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_mod() from public, anon;
grant execute on function public.is_member() to authenticated;
grant execute on function public.my_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_mod() to authenticated;
-- Supabase'in otomatik RLS fonksiyonu (proje oluştururken açıldı)
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
