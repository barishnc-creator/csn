// LiveKit erişim anahtarı üretir.
// Yalnız CSN üyesi olan, giriş yapmış kullanıcılar ve yalnız ses kanalları için.
//
// Gerekli gizli değerler (Supabase → Edge Functions → Secrets):
//   LIVEKIT_URL         wss://<proje>.livekit.cloud
//   LIVEKIT_API_KEY
//   LIVEKIT_API_SECRET
// SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY Supabase tarafından otomatik verilir.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { SignJWT } from 'npm:jose@5'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Yalnız POST' }, 405)

  const livekitUrl = Deno.env.get('LIVEKIT_URL')
  const apiKey = Deno.env.get('LIVEKIT_API_KEY')
  const apiSecret = Deno.env.get('LIVEKIT_API_SECRET')
  if (!livekitUrl || !apiKey || !apiSecret) {
    return json({ error: 'Ses sunucusu henüz ayarlanmamış (LiveKit anahtarları eksik).' }, 503)
  }

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt) return json({ error: 'Giriş gerekli' }, 401)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
  if (userErr || !userData.user) return json({ error: 'Oturum geçersiz' }, 401)
  const user = userData.user

  let channelId: string | undefined
  try {
    channelId = (await req.json())?.channelId
  } catch {
    // boş gövde
  }
  if (!channelId || typeof channelId !== 'string') return json({ error: 'channelId gerekli' }, 400)

  const [{ data: member }, { data: channel }, { data: profile }] = await Promise.all([
    admin.from('members').select('role').eq('user_id', user.id).maybeSingle(),
    admin.from('channels').select('id, kind').eq('id', channelId).maybeSingle(),
    admin.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
  ])
  if (!member) return json({ error: 'CSN üyesi değilsin' }, 403)
  if (!channel || channel.kind !== 'voice') return json({ error: 'Ses kanalı bulunamadı' }, 404)

  const now = Math.floor(Date.now() / 1000)
  const token = await new SignJWT({
    name: profile?.display_name ?? 'Üye',
    metadata: JSON.stringify({ role: member.role }),
    video: {
      room: channel.id,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    },
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(apiKey)
    .setSubject(user.id)
    .setJti(`${user.id}-${now}`)
    .setNotBefore(now - 10)
    .setExpirationTime(now + 6 * 60 * 60)
    .sign(new TextEncoder().encode(apiSecret))

  return json({ token, url: livekitUrl })
})
