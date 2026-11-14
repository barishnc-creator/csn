import { useEffect, useRef, useState } from 'react'
import { Room } from 'livekit-client'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import { uploadFile } from '../lib/files'
import type { Channel, ChannelKind, Invite, Role } from '../lib/types'
import { useVoice } from '../voice/VoiceContext'
import Avatar from './Avatar'
import Icon from './Icon'

export type SettingsTab = 'profile' | 'voice' | 'invites' | 'channels' | 'members'

export default function SettingsModal({ initialTab, onClose }: { initialTab: SettingsTab; onClose: () => void }) {
  const { myRole } = useApp()
  const [tab, setTab] = useState<SettingsTab>(initialTab)
  const isMod = myRole === 'admin' || myRole === 'mod'
  const isAdmin = myRole === 'admin'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const tabs: { id: SettingsTab; label: string; show: boolean; group: string }[] = [
    { id: 'profile', label: 'Profilim', show: true, group: 'Kullanıcı ayarları' },
    { id: 'voice', label: 'Ses ve görüntü', show: true, group: 'Kullanıcı ayarları' },
    { id: 'invites', label: 'Davetler', show: isMod, group: 'Sunucu' },
    { id: 'channels', label: 'Kanallar', show: isAdmin, group: 'Sunucu' },
    { id: 'members', label: 'Üyeler ve roller', show: isAdmin, group: 'Sunucu' },
  ]
  const groups = [...new Set(tabs.filter((t) => t.show).map((t) => t.group))]

  return (
    <div className="modal-backdrop">
      <div className="settings">
        <nav className="settings-nav">
          {groups.map((g) => (
            <div key={g}>
              <div className="category">{g}</div>
              {tabs.filter((t) => t.show && t.group === g).map((t) => (
                <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <section className="settings-body">
          <button className="settings-close" onClick={onClose} title="Kapat (Esc)"><Icon name="x" size={22} /></button>
          {tab === 'profile' && <ProfileTab />}
          {tab === 'voice' && <VoiceTab />}
          {tab === 'invites' && isMod && <InvitesTab />}
          {tab === 'channels' && isAdmin && <ChannelsTab />}
          {tab === 'members' && isAdmin && <MembersTab />}
        </section>
      </div>
    </div>
  )
}

// ───────── Profil ─────────

function ProfileTab() {
  const { me, userId, refreshProfiles } = useApp()
  const [name, setName] = useState(me?.display_name ?? '')
  const [status, setStatus] = useState(me?.custom_status ?? '')
  const [msg, setMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function save() {
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: name.trim(), custom_status: status.trim() || null })
      .eq('id', userId)
    setMsg(error ? error.message : 'Kaydedildi')
    if (!error) refreshProfiles()
  }

  async function changeAvatar(file: File) {
    if (!file.type.startsWith('image/')) return setMsg('Lütfen bir resim seç')
    if (file.size > 5 * 1024 * 1024) return setMsg('Resim en fazla 5 MB olabilir')
    try {
      const path = await uploadFile(userId, file)
      const { error } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', userId)
      if (error) throw error
      refreshProfiles()
      setMsg('Profil fotoğrafı güncellendi')
    } catch (e) {
      setMsg((e as Error).message)
    }
  }

  return (
    <div className="settings-page">
      <h2>Profilim</h2>
      <div className="profile-card">
        <button className="avatar-edit" onClick={() => fileRef.current?.click()} title="Fotoğrafı değiştir">
          <Avatar profile={me} userId={userId} size={80} />
          <span>Değiştir</span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && changeAvatar(e.target.files[0])} />
        <div className="profile-fields">
          <label>
            Görünen ad
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={32} />
          </label>
          <label>
            Özel durum
            <input value={status} onChange={(e) => setStatus(e.target.value)} maxLength={80} placeholder="ör. Maçtayım ⚽" />
          </label>
          <div className="row">
            <button className="btn primary" onClick={save} disabled={!name.trim()}>Kaydet</button>
            {msg && <span className="muted small">{msg}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ───────── Ses ve görüntü ─────────

function VoiceTab() {
  const voice = useVoice()
  const s = voice.settings
  const [devices, setDevices] = useState<{ mic: MediaDeviceInfo[]; speaker: MediaDeviceInfo[]; cam: MediaDeviceInfo[] }>({ mic: [], speaker: [], cam: [] })
  const [capturing, setCapturing] = useState(false)
  const [level, setLevel] = useState(0)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    const load = async () => {
      const [mic, speaker, cam] = await Promise.all([
        Room.getLocalDevices('audioinput', true),
        Room.getLocalDevices('audiooutput', false),
        Room.getLocalDevices('videoinput', false),
      ])
      setDevices({ mic, speaker, cam })
    }
    load().catch(() => {})
  }, [])

  // Mikrofon testi: seviye göstergesi
  useEffect(() => {
    if (!testing) return
    let stream: MediaStream | null = null
    let raf = 0
    let ctx: AudioContext | null = null
    navigator.mediaDevices
      .getUserMedia({ audio: { deviceId: s.micId === 'default' ? undefined : { exact: s.micId }, noiseSuppression: s.noiseSuppression, echoCancellation: s.echoCancellation } })
      .then((st) => {
        stream = st
        ctx = new AudioContext()
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 512
        ctx.createMediaStreamSource(st).connect(analyser)
        const buf = new Uint8Array(analyser.fftSize)
        const tick = () => {
          analyser.getByteTimeDomainData(buf)
          let sum = 0
          for (const v of buf) sum += ((v - 128) / 128) ** 2
          setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4))
          raf = requestAnimationFrame(tick)
        }
        tick()
      })
      .catch(() => setTesting(false))
    return () => {
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
      ctx?.close()
      setLevel(0)
    }
  }, [testing, s.micId, s.noiseSuppression, s.echoCancellation])

  // Bas-konuş tuşu yakala
  useEffect(() => {
    if (!capturing) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      if (e.code !== 'Escape') voice.updateSettings({ pttKey: e.code })
      setCapturing(false)
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [capturing, voice])

  return (
    <div className="settings-page">
      <h2>Ses ve görüntü</h2>
      <div className="grid-2">
        <label>
          Mikrofon
          <select value={s.micId} onChange={(e) => voice.updateSettings({ micId: e.target.value })}>
            <option value="default">Varsayılan</option>
            {devices.mic.filter((d) => d.deviceId !== 'default').map((d) => (
              <option key={d.deviceId} value={d.deviceId}>{d.label || 'Mikrofon'}</option>
            ))}
          </select>
        </label>
        <label>
          Hoparlör / kulaklık
          <select value={s.speakerId} onChange={(e) => voice.updateSettings({ speakerId: e.target.value })}>
            <option value="default">Varsayılan</option>
            {devices.speaker.filter((d) => d.deviceId !== 'default').map((d) => (
              <option key={d.deviceId} value={d.deviceId}>{d.label || 'Hoparlör'}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="mic-test">
        <button className="btn" onClick={() => setTesting((t) => !t)}>{testing ? 'Testi durdur' : 'Mikrofonu test et'}</button>
        <div className="meter"><div style={{ width: `${level * 100}%` }} /></div>
      </div>

      <h3>Giriş modu</h3>
      <div className="radio-group">
        <label className={`radio${s.inputMode === 'vad' ? ' active' : ''}`}>
          <input type="radio" checked={s.inputMode === 'vad'} onChange={() => voice.updateSettings({ inputMode: 'vad' })} />
          Ses etkinliği (konuşunca açılır)
        </label>
        <label className={`radio${s.inputMode === 'ptt' ? ' active' : ''}`}>
          <input type="radio" checked={s.inputMode === 'ptt'} onChange={() => voice.updateSettings({ inputMode: 'ptt' })} />
          Bas-konuş
        </label>
      </div>
      {s.inputMode === 'ptt' && (
        <div className="row">
          <span>Tuş:</span>
          <button className={`btn${capturing ? ' primary' : ''}`} onClick={() => setCapturing(true)}>
            {capturing ? 'Bir tuşa bas… (Esc iptal)' : s.pttKey.replace(/^Key/, '').replace(/^Digit/, '')}
          </button>
          <span className="muted small">Not: Tarayıcıda bas-konuş yalnız CSN penceresi öndeyken çalışır.</span>
        </div>
      )}

      <h3>Ses işleme</h3>
      <label className="toggle">
        <input type="checkbox" checked={s.noiseSuppression} onChange={(e) => voice.updateSettings({ noiseSuppression: e.target.checked })} />
        Gürültü engelleme
      </label>
      <label className="toggle">
        <input type="checkbox" checked={s.echoCancellation} onChange={(e) => voice.updateSettings({ echoCancellation: e.target.checked })} />
        Yankı engelleme
      </label>

      <h3>Kamera</h3>
      <select value={s.cameraId} onChange={(e) => voice.updateSettings({ cameraId: e.target.value })}>
        <option value="">Varsayılan</option>
        {devices.cam.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>{d.label || 'Kamera'}</option>
        ))}
      </select>
    </div>
  )
}

// ───────── Davetler ─────────

function InvitesTab() {
  const { profiles } = useApp()
  const [invites, setInvites] = useState<Invite[]>([])
  const [maxUses, setMaxUses] = useState('')
  const [days, setDays] = useState('7')
  const [copied, setCopied] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    const { data } = await supabase.from('invites').select('*').order('created_at', { ascending: false })
    setInvites((data ?? []) as Invite[])
  }
  useEffect(() => {
    load()
  }, [])

  async function create() {
    setError(null)
    const expires = days === '0' ? null : new Date(Date.now() + Number(days) * 864e5).toISOString()
    const { error } = await supabase.from('invites').insert({ max_uses: maxUses ? Number(maxUses) : null, expires_at: expires })
    if (error) setError(error.message)
    load()
  }

  async function remove(code: string) {
    await supabase.from('invites').delete().eq('code', code)
    load()
  }

  function copy(code: string) {
    navigator.clipboard?.writeText(code)
    setCopied(code)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div className="settings-page">
      <h2>Davetler</h2>
      <p className="muted">Arkadaşına bir davet kodu ver. Kayıt olurken bu kodu girer ve sunucuya katılır.</p>
      <div className="row">
        <label>
          Geçerlilik
          <select value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="1">1 gün</option>
            <option value="7">7 gün</option>
            <option value="30">30 gün</option>
            <option value="0">Süresiz</option>
          </select>
        </label>
        <label>
          Kullanım sınırı
          <select value={maxUses} onChange={(e) => setMaxUses(e.target.value)}>
            <option value="1">1 kişi</option>
            <option value="5">5 kişi</option>
            <option value="25">25 kişi</option>
            <option value="">Sınırsız</option>
          </select>
        </label>
        <button className="btn primary" onClick={create}>Kod oluştur</button>
      </div>
      {error && <div className="form-error">{error}</div>}
      <table className="table">
        <thead>
          <tr><th>Kod</th><th>Oluşturan</th><th>Kullanım</th><th>Bitiş</th><th /></tr>
        </thead>
        <tbody>
          {invites.map((i) => {
            const expired = (i.expires_at && new Date(i.expires_at) < new Date()) || (i.max_uses !== null && i.uses >= i.max_uses)
            return (
              <tr key={i.code} className={expired ? 'dim' : ''}>
                <td><code className="invite-code" onClick={() => copy(i.code)} title="Kopyala">{i.code}</code>{copied === i.code && <span className="small muted"> kopyalandı</span>}</td>
                <td>{profiles[i.created_by]?.display_name ?? '—'}</td>
                <td>{i.uses}{i.max_uses ? ` / ${i.max_uses}` : ''}</td>
                <td>{i.expires_at ? new Date(i.expires_at).toLocaleDateString('tr-TR') : 'Süresiz'}</td>
                <td><button className="icon-btn danger" onClick={() => remove(i.code)} title="Sil"><Icon name="trash" size={16} /></button></td>
              </tr>
            )
          })}
          {invites.length === 0 && <tr><td colSpan={5} className="muted">Henüz davet kodu yok.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

// ───────── Kanallar ─────────

function ChannelsTab() {
  const { channels } = useApp()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<ChannelKind>('text')
  const [error, setError] = useState<string | null>(null)

  async function add() {
    setError(null)
    const clean = kind === 'text' ? name.trim().toLocaleLowerCase('tr').replace(/\s+/g, '-') : name.trim()
    if (!clean) return
    const position = Math.max(-1, ...channels.filter((c) => c.kind === kind).map((c) => c.position)) + 1
    const { error } = await supabase.from('channels').insert({ name: clean, kind, position })
    if (error) setError(error.message)
    else setName('')
  }

  async function update(c: Channel, patch: Partial<Channel>) {
    const { error } = await supabase.from('channels').update(patch).eq('id', c.id)
    if (error) setError(error.message)
  }

  async function remove(c: Channel) {
    if (!confirm(`"${c.name}" kanalı ve tüm mesajları silinsin mi? Bu geri alınamaz.`)) return
    const { error } = await supabase.from('channels').delete().eq('id', c.id)
    if (error) setError(error.message)
  }

  async function move(c: Channel, dir: -1 | 1) {
    const list = channels.filter((x) => x.kind === c.kind)
    const i = list.findIndex((x) => x.id === c.id)
    const other = list[i + dir]
    if (!other) return
    await Promise.all([update(c, { position: other.position }), update(other, { position: c.position })])
    if (c.position === other.position) await update(c, { position: c.position + dir })
  }

  return (
    <div className="settings-page">
      <h2>Kanallar</h2>
      <div className="row">
        <select value={kind} onChange={(e) => setKind(e.target.value as ChannelKind)}>
          <option value="text"># Metin</option>
          <option value="voice">🔊 Ses</option>
        </select>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="yeni-kanal" maxLength={40} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn primary" onClick={add}>Ekle</button>
      </div>
      {error && <div className="form-error">{error}</div>}
      {(['text', 'voice'] as const).map((k) => (
        <div key={k}>
          <h3>{k === 'text' ? 'Metin kanalları' : 'Ses kanalları'}</h3>
          {channels.filter((c) => c.kind === k).map((c) => (
            <ChannelRow key={c.id} c={c} onSave={(p) => update(c, p)} onDelete={() => remove(c)} onMove={(d) => move(c, d)} />
          ))}
        </div>
      ))}
    </div>
  )
}

function ChannelRow({ c, onSave, onDelete, onMove }: { c: Channel; onSave: (p: Partial<Channel>) => void; onDelete: () => void; onMove: (d: -1 | 1) => void }) {
  const [name, setName] = useState(c.name)
  const [topic, setTopic] = useState(c.topic ?? '')
  const dirty = name !== c.name || topic !== (c.topic ?? '')
  return (
    <div className="channel-row">
      <Icon name={c.kind === 'text' ? 'hash' : 'speaker'} size={18} />
      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
      {c.kind === 'text' && <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Konu (isteğe bağlı)" maxLength={200} />}
      {dirty && <button className="btn primary small" onClick={() => onSave({ name: name.trim(), topic: topic.trim() || null })}>Kaydet</button>}
      <button className="icon-btn" onClick={() => onMove(-1)} title="Yukarı">↑</button>
      <button className="icon-btn" onClick={() => onMove(1)} title="Aşağı">↓</button>
      <button className="icon-btn danger" onClick={onDelete} title="Sil"><Icon name="trash" size={16} /></button>
    </div>
  )
}

// ───────── Üyeler ─────────

function MembersTab() {
  const { members, profiles, userId } = useApp()
  const [error, setError] = useState<string | null>(null)

  async function setRole(id: string, role: Role) {
    setError(null)
    const { error } = await supabase.from('members').update({ role }).eq('user_id', id)
    if (error) setError(error.message)
  }
  async function kick(id: string) {
    if (!confirm(`${profiles[id]?.display_name ?? 'Bu üye'} sunucudan atılsın mı?`)) return
    const { error } = await supabase.from('members').delete().eq('user_id', id)
    if (error) setError(error.message)
  }

  const sorted = [...members].sort((a, b) => (profiles[a.user_id]?.display_name ?? '').localeCompare(profiles[b.user_id]?.display_name ?? '', 'tr'))

  return (
    <div className="settings-page">
      <h2>Üyeler ve roller</h2>
      <p className="muted">Yönetici: her şeyi yönetir. Moderatör: davet oluşturur, mesaj siler. Üye: sohbet eder.</p>
      {error && <div className="form-error">{error}</div>}
      <table className="table">
        <thead><tr><th>Üye</th><th>Katılma</th><th>Rol</th><th /></tr></thead>
        <tbody>
          {sorted.map((m) => (
            <tr key={m.user_id}>
              <td className="row"><Avatar profile={profiles[m.user_id]} userId={m.user_id} size={28} /> {profiles[m.user_id]?.display_name ?? 'Üye'}{m.user_id === userId && ' (sen)'}</td>
              <td>{new Date(m.joined_at).toLocaleDateString('tr-TR')}</td>
              <td>
                <select value={m.role} onChange={(e) => setRole(m.user_id, e.target.value as Role)}>
                  <option value="admin">Yönetici</option>
                  <option value="mod">Moderatör</option>
                  <option value="member">Üye</option>
                </select>
              </td>
              <td>{m.user_id !== userId && <button className="btn danger small" onClick={() => kick(m.user_id)}>At</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
