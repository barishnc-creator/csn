import { supabase } from './supabase'

export async function sendFriendRequest(uid: string) {
  const { error } = await supabase.from('friendships').insert({ addressee: uid })
  if (error) throw new Error(error.code === '23505' ? 'Aranızda zaten bir istek ya da arkadaşlık var' : error.message)
}
export async function acceptFriend(id: number) {
  const { error } = await supabase.from('friendships').update({ status: 'accepted' }).eq('id', id)
  if (error) throw error
}
/** Reddet, isteği geri çek ya da arkadaşlıktan çıkar */
export async function removeFriendship(id: number) {
  const { error } = await supabase.from('friendships').delete().eq('id', id)
  if (error) throw error
}
