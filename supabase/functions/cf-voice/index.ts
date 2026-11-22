// Cloudflare Realtime SFU için vekil. Uygulama gizli anahtarı yalnız burada durur; tarayıcı
// Cloudflare API'sine doğrudan erişemez. Belgeler: developers.cloudflare.com/realtime/sfu
//
// Gerekli gizli değerler (Supabase → Edge Functions → Secrets):
//   CF_REALTIME_APP_ID      Cloudflare → Realtime → Serverless SFU → uygulamanın App ID'si
//   CF_REALTIME_APP_TOKEN   aynı uygulamanın App Secret'ı
//
// Cloudflare'de oda yok; her kişi iki oturum açar (yayın + dinleme) ve bunlar voice_sessions
// tablosunda kanalla eşlenir (0023). İstemci hiçbir zaman oturum kimliği seçemez: yayın/dinleme
// hep kendi satırındaki oturuma yapılır, abone olunacak iz hedef kişinin aynı kanaldaki satırından
// bulunur. Böylece bu işlev "serbest vekil" olmaz.
//
// İstek: POST { action, ... }
//   join      { channelId }                    → { pubSession, iceServers }
//   publish   { sdp, tracks: [{ mid, name }] } → { sdp (answer), tracks: [{ name, mid, error? }] }
//   unpublish { tracks: [{ mid, name }], sdp? } → { ok, sdp (answer) | null }
//   pull      { tracks: [{ userId, name }] }   → { sdp (offer) | null, tracks: [{ userId, name, mid?, error? }] }
//   answer    { sdp }                          → { ok }
//   close     { mids: [] }                     → { ok }
// verify_jwt kapalı dağıtılır: oturum aşağıda auth.getUser ile doğrulanır.

import { createClient } from 'npm:@supabase/supabase-js@2'

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

// İz adı: mic | cam | screen | screen-audio, isteğe bağlı kısa ek (her yayın yeni ad alır)
const TRACK_NAME = /^(mic|cam|screen|screen-audio)(-[a-z0-9]{1,8})?$/
const okName = (n: unknown): n is string => typeof n === 'string' && TRACK_NAME.test(n)
const FRESH_MS = 90_000
const ICE_SERVERS = [{ urls: 'stun:stun.cloudflare.com:3478' }]

type CfTrack = { sessionId?: string; trackName?: string; mid?: string; errorCode?: string; errorDescription?: string }
type CfResponse = {
  sessionId?: string
  errorCode?: string
  errorDescription?: string
  requiresImmediateRenegotiation?: boolean
  sessionDescription?: { type: string; sdp: string }
  tracks?: CfTrack[]
}

class CfError extends Error {
  constructor(message: string, public status: number) {
    super(message)
  }
}

async function cf(path: string, method: 'POST' | 'PUT', body?: unknown): Promise<CfResponse> {
  const appId = Deno.env.get('CF_REALTIME_APP_ID')
  const token = Deno.env.get('CF_REALTIME_APP_TOKEN')
  if (!appId || !token) throw new CfError('Cloudflare ses sunucusu henüz ayarlanmamış (CF_REALTIME_* sırları eksik).', 503)
  const res = await fetch(`https://rtc.live.cloudflare.com/v1/apps/${appId}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  })
  let data: CfResponse = {}
  try {
    data = await res.json()
  } catch {
    // gövdesiz yanıt
  }
  if (!res.ok || data.errorCode) {
    console.error('cloudflare', method, path, res.status, data.errorCode, data.errorDescription)
    const gone = res.status === 410 || data.errorCode === 'session_error'
    throw new CfError(
      gone ? 'Ses oturumu kapanmış, odaya yeniden gir.' : `Cloudflare hatası: ${data.errorDescription ?? data.errorCode ?? res.status}`,
      gone ? 410 : 502,
    )
  }
  return data
}

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Yalnız POST' }, 405)

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt) return json({ error: 'Giriş gerekli' }, 401)

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

  // deno-lint-ignore no-explicit-any
  let body: any = {}
  try {
    body = await req.json()
  } catch {
    // boş gövde
  }

  try {
    if (body?.action === 'join') return await join(admin, user.id, body.channelId)

    // Diğer tüm işlemler kişinin kendi satırındaki oturumlarla yapılır (join izinleri denetledi)
    const { data: mine } = await admin.from('voice_sessions').select('*').eq('user_id', user.id).maybeSingle()
    if (!mine) return json({ error: 'Ses odasında değilsin' }, 409)

    switch (body?.action) {
      case 'publish': {
        const tracks = cleanLocal(body.tracks)
        if (!isStr(body.sdp) || !tracks.length) return json({ error: 'sdp ve tracks gerekli' }, 400)
        const r = await cf(`/sessions/${mine.pub_session}/tracks/new`, 'POST', {
          sessionDescription: { type: 'offer', sdp: body.sdp },
          tracks: tracks.map((t) => ({ location: 'local', mid: t.mid, trackName: t.name })),
        })
        const out = tracks.map((t) => {
          const hit = r.tracks?.find((x) => x.trackName === t.name)
          const error = !hit ? 'yanıt yok' : hit.errorCode ? (hit.errorDescription ?? hit.errorCode) : undefined
          return { name: t.name, mid: t.mid, error }
        })
        const ok = out.filter((t) => !t.error).map((t) => t.name)
        if (ok.length) {
          const next = [...new Set([...(mine.tracks as string[]), ...ok])]
          await admin.from('voice_sessions').update({ tracks: next, last_seen: new Date().toISOString() }).eq('user_id', user.id).eq('pub_session', mine.pub_session)
        }
        return json({ sdp: r.sessionDescription?.sdp ?? null, tracks: out })
      }
      case 'unpublish': {
        const tracks = cleanLocal(body.tracks)
        if (!tracks.length) return json({ error: 'tracks gerekli' }, 400)
        // Önce keşiften kaldır: yeni abone gelmesin
        const names = tracks.map((t) => t.name)
        const next = (mine.tracks as string[]).filter((n) => !names.includes(n))
        await admin.from('voice_sessions').update({ tracks: next }).eq('user_id', user.id).eq('pub_session', mine.pub_session)
        // sdp verilirse pazarlıklı kapatma (istemci alıcı-vericiyi durdurup offer gönderir), yoksa zorla
        const closeBody = isStr(body.sdp)
          ? { tracks: tracks.map((t) => ({ mid: t.mid })), sessionDescription: { type: 'offer', sdp: body.sdp }, force: false }
          : { tracks: tracks.map((t) => ({ mid: t.mid })), force: true }
        const r = await cf(`/sessions/${mine.pub_session}/tracks/close`, 'PUT', closeBody)
        return json({ ok: true, sdp: r.sessionDescription?.sdp ?? null })
      }
      case 'pull': {
        const wanted: { userId: string; name: string }[] = (Array.isArray(body.tracks) ? body.tracks : [])
          .filter((t: { userId?: unknown; name?: unknown }) => isStr(t?.userId) && okName(t?.name))
          .slice(0, 32)
        if (!wanted.length) return json({ error: 'tracks gerekli' }, 400)
        // Yetki: hedef kişi benimle AYNI kanalda olmalı ve o izi gerçekten yayınlıyor olmalı
        const { data: targets } = await admin
          .from('voice_sessions').select('user_id, pub_session, tracks')
          .eq('channel_id', mine.channel_id).in('user_id', wanted.map((t) => t.userId))
        const resolved = wanted.map((t) => {
          const row = t.userId === user.id ? null : targets?.find((r: { user_id: string }) => r.user_id === t.userId)
          return row && (row.tracks as string[]).includes(t.name) ? { ...t, sessionId: row.pub_session as string } : { ...t, sessionId: null }
        })
        const pulls = resolved.filter((t) => t.sessionId)
        if (!pulls.length) return json({ sdp: null, tracks: resolved.map((t) => ({ userId: t.userId, name: t.name, error: 'yayında değil' })) })
        const r = await cf(`/sessions/${mine.sub_session}/tracks/new`, 'POST', {
          tracks: pulls.map((t) => ({ location: 'remote', sessionId: t.sessionId, trackName: t.name })),
        })
        const out = resolved.map((t) => {
          if (!t.sessionId) return { userId: t.userId, name: t.name, error: 'yayında değil' }
          const hit = r.tracks?.find((x) => x.sessionId === t.sessionId && x.trackName === t.name)
          if (!hit) return { userId: t.userId, name: t.name, error: 'yanıt yok' }
          if (hit.errorCode) return { userId: t.userId, name: t.name, error: hit.errorDescription ?? hit.errorCode }
          return { userId: t.userId, name: t.name, mid: hit.mid }
        })
        return json({ sdp: r.requiresImmediateRenegotiation ? (r.sessionDescription?.sdp ?? null) : null, tracks: out })
      }
      case 'answer': {
        if (!isStr(body.sdp)) return json({ error: 'sdp gerekli' }, 400)
        await cf(`/sessions/${mine.sub_session}/renegotiate`, 'PUT', { sessionDescription: { type: 'answer', sdp: body.sdp } })
        return json({ ok: true })
      }
      case 'close': {
        const mids: string[] = (Array.isArray(body.mids) ? body.mids : []).filter(isStr).slice(0, 64)
        if (!mids.length) return json({ error: 'mids gerekli' }, 400)
        await cf(`/sessions/${mine.sub_session}/tracks/close`, 'PUT', { tracks: mids.map((mid) => ({ mid })), force: true })
        return json({ ok: true })
      }
      default:
        return json({ error: 'Bilinmeyen işlem' }, 400)
    }
  } catch (e) {
    if (e instanceof CfError) return json({ error: e.message }, e.status)
    console.error('cf-voice', e)
    return json({ error: 'Ses sunucusuna ulaşılamadı' }, 502)
  }
})

function cleanLocal(raw: unknown): { mid: string; name: string }[] {
  return (Array.isArray(raw) ? raw : [])
    .filter((t) => isStr(t?.mid) && okName(t?.name))
    .map((t) => ({ mid: t.mid as string, name: t.name as string }))
    .slice(0, 4)
}

// Üyelik, kanal izni ve kişi sınırı: livekit-token ile aynı kurallar.
// deno-lint-ignore no-explicit-any
async function join(admin: any, userId: string, channelId: unknown) {
  if (!isStr(channelId)) return json({ error: 'channelId gerekli' }, 400)

  const [{ data: member }, { data: channel }, { data: st }] = await Promise.all([
    admin.from('members').select('role').eq('user_id', userId).maybeSingle(),
    admin.from('channels').select('*').eq('id', channelId).maybeSingle(),
    admin.from('server_state').select('voice_mode').eq('id', 1).maybeSingle(),
  ])
  if (!member) return json({ error: 'CSN üyesi değilsin' }, 403)
  if (st?.voice_mode !== 'cf') return json({ error: 'Ses sunucusu değişti. Sayfayı yenileyip yeniden dene.' }, 409)
  if (!channel || (channel.kind !== 'voice' && channel.kind !== 'dm')) return json({ error: 'Ses kanalı bulunamadı' }, 404)
  if (channel.kind === 'dm') {
    const { data: cm } = await admin
      .from('channel_members').select('user_id').eq('channel_id', channel.id).eq('user_id', userId).maybeSingle()
    if (!cm) return json({ error: 'Bu görüşmeye katılamazsın' }, 403)
  } else if (member.role !== 'admin' && channel.allowed_roles?.length) {
    const { data: mr } = await admin
      .from('member_roles').select('role_id').eq('user_id', userId).in('role_id', channel.allowed_roles)
    if (!mr?.length) return json({ error: 'Bu kanala girme iznin yok' }, 403)
  }
  if (channel.kind === 'voice' && member.role !== 'admin' && channel.join_roles?.length) {
    const { data: jr } = await admin
      .from('member_roles').select('role_id').eq('user_id', userId).in('role_id', channel.join_roles)
    if (!jr?.length) return json({ error: 'Bu ses kanalına bağlanma iznin yok' }, 403)
  }

  // Kişi sınırı (yöneticiler ve yetkili biri tarafından taşınan kişi sınıra takılmaz)
  if (channel.kind === 'voice' && channel.user_limit && member.role !== 'admin') {
    const since = new Date(Date.now() - 60_000).toISOString()
    const { data: moved } = await admin
      .from('voice_moves').select('id').eq('target', userId).eq('channel_id', channel.id).gte('created_at', since).limit(1)
    if (!moved?.length) {
      const { count } = await admin
        .from('voice_sessions').select('user_id', { count: 'exact', head: true })
        .eq('channel_id', channel.id).neq('user_id', userId).gt('last_seen', new Date(Date.now() - FRESH_MS).toISOString())
      if (count !== null && count >= channel.user_limit) return json({ error: `Bu oda dolu (${count}/${channel.user_limit}).` }, 403)
    }
  }

  const [pub, sub] = await Promise.all([cf('/sessions/new', 'POST'), cf('/sessions/new', 'POST')])
  if (!pub.sessionId || !sub.sessionId) throw new CfError('Cloudflare oturum açmadı', 502)

  const now = new Date().toISOString()
  const { error } = await admin.from('voice_sessions').upsert({
    user_id: userId,
    channel_id: channel.id,
    pub_session: pub.sessionId,
    sub_session: sub.sessionId,
    tracks: [],
    created_at: now,
    last_seen: now,
  })
  if (error) {
    console.error('voice_sessions', error)
    return json({ error: 'Ses oturumu kaydedilemedi' }, 500)
  }
  return json({ pubSession: pub.sessionId, iceServers: ICE_SERVERS })
}
