// LiveKit erişim anahtarı üretir.
// Yalnız CSN üyesi olan, giriş yapmış kullanıcılar; ses kanalları ve DM aramaları için.
//
// Gerekli gizli değerler (Supabase → Edge Functions → Secrets):
//   LIVEKIT_URL         wss://<proje>.livekit.cloud
//   LIVEKIT_API_KEY
//   LIVEKIT_API_SECRET
// İsteğe bağlı, kendi sunucumuz (selfhost/livekit/kurulum.sh):
//   LIVEKIT_SELF_URL    wss://<ip>.sslip.io
//   LIVEKIT_SELF_KEY
//   LIVEKIT_SELF_SECRET
// Seçim server_state.voice_mode ile (0022): auto = önce Cloud; istemci Cloud'a bağlanamazsa
// { cloudFailed: true } ile yeniden ister, herkes 3 saatliğine yedeğe geçer (oda bölünmesin diye
// yedekte o odada kimse varsa yeni gelen de oraya gider). cloud / self = elle sabit.
// SUPABASE_URL ve sunucu anahtarı Supabase tarafından otomatik verilir.
// verify_jwt kapalı dağıtılır: oturum aşağıda auth.getUser ile doğrulanır.

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

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt) return json({ error: 'Giriş gerekli' }, 401)

  // Yeni projelerde gizli anahtar SUPABASE_SECRET_KEYS içinde de gelebilir
  let serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!serviceKey) {
    try {
      const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}')
      serviceKey = keys.default ?? Object.values(keys)[0]
    } catch {
      // yoksay
    }
  }
  if (!serviceKey) return json({ error: 'Sunucu anahtarı bulunamadı' }, 500)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey as string, {
    auth: { persistSession: false },
  })

  const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
  if (userErr || !userData.user) return json({ error: 'Oturum geçersiz' }, 401)
  const user = userData.user

  let channelId: string | undefined
  let cloudFailed = false
  try {
    const body = await req.json()
    channelId = body?.channelId
    cloudFailed = body?.cloudFailed === true
  } catch {
    // boş gövde
  }
  if (!channelId || typeof channelId !== 'string') return json({ error: 'channelId gerekli' }, 400)

  const [{ data: member }, { data: channel }, { data: profile }] = await Promise.all([
    admin.from('members').select('role').eq('user_id', user.id).maybeSingle(),
    admin.from('channels').select('*').eq('id', channelId).maybeSingle(),
    admin.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
  ])
  if (!member) return json({ error: 'CSN üyesi değilsin' }, 403)
  if (!channel || (channel.kind !== 'voice' && channel.kind !== 'dm')) return json({ error: 'Ses kanalı bulunamadı' }, 404)
  if (channel.kind === 'dm') {
    // Doğrudan mesaj araması: yalnız o konuşmanın katılımcıları
    const { data: cm } = await admin
      .from('channel_members').select('user_id').eq('channel_id', channel.id).eq('user_id', user.id).maybeSingle()
    if (!cm) return json({ error: 'Bu görüşmeye katılamazsın' }, 403)
  } else if (member.role !== 'admin' && channel.allowed_roles?.length) {
    // Gizli ses kanalı: yalnız izinli rollerdeki üyeler
    const { data: mr } = await admin
      .from('member_roles').select('role_id').eq('user_id', user.id).in('role_id', channel.allowed_roles)
    if (!mr?.length) return json({ error: 'Bu kanala girme iznin yok' }, 403)
  }
  if (channel.kind === 'voice' && member.role !== 'admin' && channel.join_roles?.length) {
    // Revize #6: kanalı görse bile yalnız izinli roller bağlanabilir
    const { data: jr } = await admin
      .from('member_roles').select('role_id').eq('user_id', user.id).in('role_id', channel.join_roles)
    if (!jr?.length) return json({ error: 'Bu ses kanalına bağlanma iznin yok' }, 403)
  }

  // Ses Cloudflare'e alınmışsa (voice_mode = 'cf') eski sürümü açık kalan istemci LiveKit'e girip odayı bölmesin
  const { data: vm } = await admin.from('server_state').select('voice_mode').eq('id', 1).maybeSingle()
  if (vm?.voice_mode === 'cf') return json({ error: 'Ses sunucusu değişti. Sayfayı yenileyip yeniden dene.' }, 409)

  const server = await pickServer(admin, channel.id, cloudFailed)
  if (!server) return json({ error: 'Ses sunucusu henüz ayarlanmamış (LiveKit anahtarları eksik).' }, 503)
  const { url: livekitUrl, key: apiKey, secret: apiSecret } = server

  const now = Math.floor(Date.now() / 1000)

  // Revize #26: oda kişi sınırı (yöneticiler sınırsız; yetkili biri tarafından taşınan kişi de sınıra takılmaz)
  if (channel.kind === 'voice' && channel.user_limit && member.role !== 'admin') {
    const since = new Date(Date.now() - 60_000).toISOString()
    const { data: moved } = await admin
      .from('voice_moves').select('id').eq('target', user.id).eq('channel_id', channel.id).gte('created_at', since).limit(1)
    if (!moved?.length) {
      const inside = await countParticipants(livekitUrl, apiKey, apiSecret, channel.id, user.id)
      if (inside !== null && inside >= channel.user_limit) {
        return json({ error: `Bu oda dolu (${inside}/${channel.user_limit}).` }, 403)
      }
    }
  }

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

  return json({ token, url: livekitUrl, server: server.kind })
})

type LkServer = { kind: 'cloud' | 'self'; url: string; key: string; secret: string }
let selfCache: { ok: boolean; at: number } | null = null
const FALLBACK_MS = 3 * 60 * 60 * 1000

function envServer(kind: 'cloud' | 'self'): LkServer | null {
  const p = kind === 'self' ? ['LIVEKIT_SELF_URL', 'LIVEKIT_SELF_KEY', 'LIVEKIT_SELF_SECRET'] : ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET']
  const [url, key, secret] = p.map((n) => Deno.env.get(n) ?? '')
  return url && key && secret ? { kind, url, key, secret } : null
}

/** Yedek sunucu ayakta mı? Sonuç 30 sn saklanır. */
async function selfHealthy(s: LkServer) {
  if (!selfCache || Date.now() - selfCache.at > 30_000) {
    let ok = false
    try {
      const res = await fetch(s.url.replace(/^ws/, 'http').replace(/\/$/, '') + '/', { signal: AbortSignal.timeout(2500) })
      ok = res.ok
    } catch {
      ok = false
    }
    selfCache = { ok, at: Date.now() }
  }
  return selfCache.ok
}

// deno-lint-ignore no-explicit-any
async function pickServer(admin: any, room: string, cloudFailed: boolean): Promise<LkServer | null> {
  const cloud = envServer('cloud')
  const selfS = envServer('self')
  const self = selfS && (await selfHealthy(selfS)) ? selfS : null
  if (!self) return cloud
  if (!cloud) return self

  const { data: st } = await admin.from('server_state').select('voice_mode, voice_fallback_until').eq('id', 1).maybeSingle()
  const mode: string = st?.voice_mode ?? 'auto'
  if (mode === 'cloud') return cloud
  if (mode === 'self') return self

  // auto
  if (cloudFailed) {
    await admin.from('server_state').update({ voice_fallback_until: new Date(Date.now() + FALLBACK_MS).toISOString() }).eq('id', 1)
    return self
  }
  const until = st?.voice_fallback_until ? Date.parse(st.voice_fallback_until) : 0
  if (until > Date.now()) return self
  // Yedek süresi bitti ama odada hâlâ yedekte konuşanlar varsa onlardan ayırma
  const inSelf = await countParticipants(self.url, self.key, self.secret, room, '')
  return inSelf && inSelf > 0 ? self : cloud
}

/** Odadaki kişi sayısı (kendisi hariç). LiveKit'e ulaşılamazsa null: sınır uygulanmaz. */
async function countParticipants(wsUrl: string, apiKey: string, apiSecret: string, room: string, self: string) {
  try {
    const now = Math.floor(Date.now() / 1000)
    const adminToken = await new SignJWT({ video: { room, roomAdmin: true } })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer(apiKey)
      .setNotBefore(now - 10)
      .setExpirationTime(now + 60)
      .sign(new TextEncoder().encode(apiSecret))
    const httpUrl = wsUrl.replace(/^ws/, 'http').replace(/\/$/, '')
    const res = await fetch(`${httpUrl}/twirp/livekit.RoomService/ListParticipants`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ room }),
    })
    if (res.status === 404) return 0 // oda henüz yok
    if (!res.ok) return null
    const body = (await res.json()) as { participants?: { identity: string }[] }
    return (body.participants ?? []).filter((p) => p.identity !== self).length
  } catch {
    return null
  }
}
