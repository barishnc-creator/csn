import { useEffect, useRef, useState } from 'react'
import { Room } from 'livekit-client'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import { uploadFile } from '../lib/files'
import type { Channel, ChannelKind, CustomRole, Invite, Permission, Role } from '../lib/types'
import { useVoice } from '../voice/VoiceContext'
import Avatar from './Avatar'
import Icon, { type IconName } from './Icon'
import RevisionsTab from './RevisionsTab'
import { ProfileCard } from './UserProfileModal'

export type SettingsTab = 'profile' | 'voice' | 'invites' | 'channels' | 'roles' | 'members' | 'revisions'

const tabMeta: Record<SettingsTab, { label: string; icon: IconName; group: string }> = {
  profile: { label: 'Profilim', icon: 'users', group: 'Kullanıcı ayarları' },
  voice: { label: 'Ses ve görüntü', icon: 'mic', group: 'Kullanıcı ayarları' },
  invites: { label: 'Davetler', icon: 'plusCircle', group: 'Sunucu' },
  channels: { label: 'Kanallar', icon: 'hash', group: 'Sunucu' },
  roles: { label: 'Roller', icon: 'shield', group: 'Sunucu' },
  members: { label: 'Üyeler', icon: 'users', group: 'Sunucu' },
  revisions: { label: 'Revizeler', icon: 'file', group: 'Sunucu' },
}

export default function SettingsModal({ initialTab, onClose }: { initialTab: SettingsTab; onClose: () => void }) {
  const { myRole, can } = useApp()
  const [history, setHistory] = useState<SettingsTab[]>([initialTab])
  const tab = history[history.length - 1]
  const isAdmin = myRole === 'admin'

  const show: Record<SettingsTab, boolean> = {
    profile: true,
    voice: true,
    invites: can('create_invites'),
    channels: can('manage_channels'),
    roles: isAdmin,
    members: isAdmin || can('kick_members'),
    revisions: isAdmin,
  }

  function go(t: SettingsTab) {
    if (t !== tab) setHistory((h) => [...h, t])
  }
  function back() {
    if (history.length > 1) setHistory((h) => h.slice(0, -1))
    else onClose()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const ids = (Object.keys(tabMeta) as SettingsTab[]).filter((t) => show[t])
  const groups = [...new Set(ids.map((t) => tabMeta[t].group))]

  return (
    <div className="modal-backdrop dim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="settings">
        <nav className="settings-nav">
          {groups.map((g) => (
            <div key={g} className="settings-nav-group">
              <div className="category">{g}</div>
              {ids.filter((t) => tabMeta[t].group === g).map((t) => (
                <button key={t} className={tab === t ? 'active' : ''} onClick={() => go(t)}>
                  <Icon name={tabMeta[t].icon} size={16} /> {tabMeta[t].label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <section className="settings-main">
          <header className="settings-topbar">
            <button className="btn ghost small" onClick={back} title={history.length > 1 ? 'Önceki bölüm' : 'Uygulamaya dön'}>
              <Icon name="back" size={16} /> Geri
            </button>
            <h2>{tabMeta[tab].label}</h2>
            <button className="close-btn" onClick={onClose} title="Kapat (Esc)">
              <Icon name="x" size={18} />
              <span>ESC</span>
            </button>
          </header>
          <div className="settings-body">
            {tab === 'profile' && <ProfileTab />}
            {tab === 'voice' && <VoiceTab />}
            {tab === 'invites' && show.invites && <InvitesTab />}
            {tab === 'channels' && show.channels && <ChannelsTab />}
            {tab === 'roles' && show.roles && <RolesTab />}
            {tab === 'members' && show.members && <MembersTab />}
            {tab === 'revisions' && show.revisions && <RevisionsTab />}
          </div>
        </section>
      </div>
    </div>
  )
}

// ───────── Profil ─────────

const BANNERS = ['#6c5ce7', '#0984e3', '#00b894', '#e17055', '#d63031', '#e84393', '#fdcb6e', '#2d3436', '#00cec9', '#a29bfe']

function ProfileTab() {
  const { me, userId, refreshProfiles, myStatus } = useApp()
  const [name, setName] = useState(me?.display_name ?? '')
  const [status, setStatus] = useState(me?.custom_status ?? '')
  const [bio, setBio] = useState(me?.bio ?? '')
  const [pronouns, setPronouns] = useState(me?.pronouns ?? '')
  const [banner, setBanner] = useState(me?.banner_color ?? '')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const dirty =
    name !== (me?.display_name ?? '') ||
    status !== (me?.custom_status ?? '') ||
    bio !== (me?.bio ?? '') ||
    pronouns !== (me?.pronouns ?? '') ||
    banner !== (me?.banner_color ?? '')

  async function save() {
    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: name.trim(),
        custom_status: status.trim() || null,
        bio: bio.trim() || null,
        pronouns: pronouns.trim() || null,
        banner_color: banner || null,
      })
      .eq('id', userId)
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'Kaydedildi' })
    if (!error) refreshProfiles()
  }

  function reset() {
    setName(me?.display_name ?? '')
    setStatus(me?.custom_status ?? '')
    setBio(me?.bio ?? '')
    setPronouns(me?.pronouns ?? '')
    setBanner(me?.banner_color ?? '')
  }

  async function changeAvatar(file: File) {
    if (!file.type.startsWith('image/')) return setMsg({ ok: false, text: 'Lütfen bir resim seç' })
    if (file.size > 5 * 1024 * 1024) return setMsg({ ok: false, text: 'Resim en fazla 5 MB olabilir' })
    try {
      const path = await uploadFile(userId, file)
      const { error } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', userId)
      if (error) throw error
      refreshProfiles()
      setMsg({ ok: true, text: 'Profil fotoğrafı güncellendi' })
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    }
  }

  const preview = me
    ? { ...me, display_name: name || me.display_name, custom_status: status || null, bio: bio || null, pronouns: pronouns || null, banner_color: banner || null }
    : null

  return (
    <div className="settings-page profile-editor">
      <div className="profile-form">
        <div className="field-card">
          <div className="avatar-row">
            <Avatar profile={me} userId={userId} size={64} />
            <div>
              <button className="btn" onClick={() => fileRef.current?.click()}><Icon name="camera" size={16} /> Fotoğraf yükle</button>
              <div className="muted small">PNG/JPG, en fazla 5 MB</div>
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && changeAvatar(e.target.files[0])} />
          </div>
        </div>
        <label>
          Görünen ad
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={32} />
        </label>
        <label>
          Zamirler <span className="hint">isteğe bağlı</span>
          <input value={pronouns} onChange={(e) => setPronouns(e.target.value)} maxLength={40} placeholder="ör. o" />
        </label>
        <label>
          Özel durum
          <input value={status} onChange={(e) => setStatus(e.target.value)} maxLength={80} placeholder="ör. Maçtayım ⚽" />
        </label>
        <label>
          Hakkımda <span className="hint">{bio.length}/300</span>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={300} rows={4} placeholder="Kendinden biraz bahset…" />
        </label>
        <div>
          <div className="field-label">Kapak rengi</div>
          <div className="swatches">
            <button className={`swatch auto${!banner ? ' active' : ''}`} onClick={() => setBanner('')} title="Otomatik">A</button>
            {BANNERS.map((c) => (
              <button key={c} className={`swatch${banner === c ? ' active' : ''}`} style={{ background: c }} onClick={() => setBanner(c)} title={c} />
            ))}
            <label className="swatch custom" title="Özel renk">
              <input type="color" value={banner || '#6c5ce7'} onChange={(e) => setBanner(e.target.value)} />
              <Icon name="plus" size={14} />
            </label>
          </div>
        </div>
      </div>
      <div className="profile-preview">
        <div className="field-label">Önizleme</div>
        <ProfileCard profile={preview} userId={userId} status={myStatus} />
      </div>
      {(dirty || msg) && (
        <div className={`save-bar${dirty ? ' show' : ''}`}>
          <span>{dirty ? 'Kaydedilmemiş değişikliklerin var.' : msg?.text}</span>
          {dirty && (
            <>
              <button className="btn ghost small" onClick={reset}>Sıfırla</button>
              <button className="btn success small" onClick={save} disabled={!name.trim()}>Değişiklikleri kaydet</button>
            </>
          )}
        </div>
      )}
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
      <label className="toggle">
        <input type="checkbox" checked={s.aiNoise} onChange={(e) => voice.updateSettings({ aiNoise: e.target.checked })} />
        Gelişmiş gürültü engelleme (yapay zekâ, RNNoise)
      </label>
      <p className="muted small">Klavye, fan ve oda gürültüsünü bastırır. Biraz daha fazla işlemci kullanır.</p>

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
  const { channels, roles } = useApp()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<ChannelKind>('text')
  const [error, setError] = useState<string | null>(null)
  const list = channels.filter((c) => c.kind !== 'dm')

  async function add() {
    setError(null)
    const clean = kind === 'text' ? name.trim().toLocaleLowerCase('tr').replace(/\s+/g, '-') : name.trim()
    if (!clean) return
    const position = Math.max(-1, ...list.filter((c) => c.kind === kind).map((c) => c.position)) + 1
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
    const same = list.filter((x) => x.kind === c.kind)
    const i = same.findIndex((x) => x.id === c.id)
    const other = same[i + dir]
    if (!other) return
    const a = c.position === other.position ? c.position + dir : other.position
    await Promise.all([update(c, { position: a }), update(other, { position: c.position })])
  }

  return (
    <div className="settings-page">
      <div className="field-card row">
        <div className="segmented">
          <button className={kind === 'text' ? 'active' : ''} onClick={() => setKind('text')}><Icon name="hash" size={16} /> Metin</button>
          <button className={kind === 'voice' ? 'active' : ''} onClick={() => setKind('voice')}><Icon name="speaker" size={16} /> Ses</button>
        </div>
        <input className="grow" value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'text' ? 'yeni-kanal' : 'Yeni ses kanalı'} maxLength={40} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn primary" onClick={add} disabled={!name.trim()}><Icon name="plus" size={16} /> Kanal ekle</button>
      </div>
      {error && <div className="form-error">{error}</div>}
      {(['text', 'voice'] as const).map((k) => (
        <section key={k}>
          <h3>{k === 'text' ? 'Metin kanalları' : 'Ses kanalları'}</h3>
          <div className="list-card">
            {list.filter((c) => c.kind === k).map((c) => (
              <ChannelRow key={c.id} c={c} roles={roles} onSave={(p) => update(c, p)} onDelete={() => remove(c)} onMove={(d) => move(c, d)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function ChannelRow({ c, roles, onSave, onDelete, onMove }: { c: Channel; roles: CustomRole[]; onSave: (p: Partial<Channel>) => void; onDelete: () => void; onMove: (d: -1 | 1) => void }) {
  const [name, setName] = useState(c.name)
  const [topic, setTopic] = useState(c.topic ?? '')
  const [open, setOpen] = useState(false)
  const dirty = name !== c.name || topic !== (c.topic ?? '')
  const allowed = c.allowed_roles ?? []

  function toggleRole(id: string) {
    const next = allowed.includes(id) ? allowed.filter((x) => x !== id) : [...allowed, id]
    onSave({ allowed_roles: next.length ? next : null })
  }

  return (
    <div className="channel-row-v2">
      <div className="channel-row-main">
        <Icon name={c.kind === 'text' ? 'hash' : 'speaker'} size={18} />
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        {c.kind === 'text' && <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Konu (isteğe bağlı)" maxLength={200} />}
        {dirty && <button className="btn success small" onClick={() => onSave({ name: name.trim(), topic: topic.trim() || null })}>Kaydet</button>}
        <button className={`chip-btn${allowed.length ? ' on' : ''}`} onClick={() => setOpen((o) => !o)} title="Kimler görebilir">
          <Icon name={allowed.length ? 'lock' : 'users'} size={14} /> {allowed.length ? `${allowed.length} rol` : 'Herkes'}
        </button>
        <button className="icon-btn" onClick={() => onMove(-1)} title="Yukarı taşı">↑</button>
        <button className="icon-btn" onClick={() => onMove(1)} title="Aşağı taşı">↓</button>
        <button className="icon-btn danger" onClick={onDelete} title="Sil"><Icon name="trash" size={16} /></button>
      </div>
      {open && (
        <div className="channel-access">
          <div className="muted small">
            Hiç rol seçmezsen kanalı herkes görür. Rol seçersen yalnız o rollerdeki üyeler (ve yöneticiler) görür.
          </div>
          {roles.length === 0 && <div className="muted small">Önce <strong>Roller</strong> bölümünden rol oluştur.</div>}
          <div className="role-chips">
            {roles.map((r) => (
              <button key={r.id} className={`role-chip toggle${allowed.includes(r.id) ? ' on' : ''}`} style={{ ['--role' as string]: r.color }} onClick={() => toggleRole(r.id)}>
                <i /> {r.name} {allowed.includes(r.id) && <Icon name="check" size={12} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ───────── Roller ─────────

const PERMS: { id: Permission; label: string; desc: string }[] = [
  { id: 'manage_channels', label: 'Kanalları yönet', desc: 'Kanal ekleyebilir, düzenleyebilir, silebilir ve kimlerin göreceğini ayarlayabilir.' },
  { id: 'manage_messages', label: 'Mesajları yönet', desc: 'Başkalarının mesajlarını silebilir, mesaj sabitleyebilir.' },
  { id: 'create_invites', label: 'Davet oluştur', desc: 'Yeni üyeler için davet kodu üretebilir.' },
  { id: 'kick_members', label: 'Üye at', desc: '"Üye" rolündeki kişileri sunucudan çıkarabilir.' },
  { id: 'mention_everyone', label: '@herkes kullan', desc: '@herkes yazarak tüm sunucuya bildirim gönderebilir.' },
]
const ROLE_COLORS = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c', '#3498db', '#6c5ce7', '#9b59b6', '#e84393', '#95a5a6']

function RolesTab() {
  const { roles, memberRoles } = useApp()
  const [selected, setSelected] = useState<string | null>(roles[0]?.id ?? null)
  const [error, setError] = useState<string | null>(null)
  const role = roles.find((r) => r.id === selected) ?? null

  async function create() {
    setError(null)
    const position = Math.max(-1, ...roles.map((r) => r.position)) + 1
    const { data, error } = await supabase
      .from('roles')
      .insert({ name: 'Yeni rol', color: ROLE_COLORS[roles.length % ROLE_COLORS.length], position })
      .select('id')
      .single()
    if (error) setError(error.message)
    else if (data) setSelected(data.id)
  }

  async function move(r: CustomRole, dir: -1 | 1) {
    const i = roles.findIndex((x) => x.id === r.id)
    const other = roles[i + dir]
    if (!other) return
    const a = r.position === other.position ? r.position + dir : other.position
    await Promise.all([
      supabase.from('roles').update({ position: a }).eq('id', r.id),
      supabase.from('roles').update({ position: r.position }).eq('id', other.id),
    ])
  }

  return (
    <div className="settings-page">
      <p className="muted">
        Rollerle arkadaşlarını grupla, isimlerini renklendir ve onlara görev ver. Bir üyenin birden fazla rolü olabilir.
        Rolleri <strong>Üyeler</strong> bölümünden verirsin. Yöneticiler her zaman her şeyi yapabilir.
      </p>
      {error && <div className="form-error">{error}</div>}
      <div className="roles-layout">
        <div className="roles-list">
          <button className="btn primary block" onClick={create}><Icon name="plus" size={16} /> Rol oluştur</button>
          {roles.length === 0 && <p className="muted small">Henüz rol yok.</p>}
          {roles.map((r) => (
            <div key={r.id} className={`role-item${r.id === selected ? ' active' : ''}`} onClick={() => setSelected(r.id)}>
              <span className="role-dot" style={{ background: r.color }} />
              <span className="role-item-name">{r.name}</span>
              <span className="muted small">{memberRoles.filter((m) => m.role_id === r.id).length}</span>
              <span className="role-move">
                <button onClick={(e) => { e.stopPropagation(); move(r, -1) }} title="Yukarı">↑</button>
                <button onClick={(e) => { e.stopPropagation(); move(r, 1) }} title="Aşağı">↓</button>
              </span>
            </div>
          ))}
        </div>
        <div className="role-editor">
          {role ? <RoleEditor key={role.id} role={role} onDeleted={() => setSelected(null)} onError={setError} /> : <p className="muted">Düzenlemek için soldan bir rol seç ya da yeni rol oluştur.</p>}
        </div>
      </div>
    </div>
  )
}

function RoleEditor({ role, onDeleted, onError }: { role: CustomRole; onDeleted: () => void; onError: (e: string) => void }) {
  const [name, setName] = useState(role.name)
  const [color, setColor] = useState(role.color)
  const [perms, setPerms] = useState<Permission[]>(role.permissions)
  const [hoist, setHoist] = useState(role.hoist)
  const dirty = name !== role.name || color !== role.color || hoist !== role.hoist || perms.slice().sort().join() !== role.permissions.slice().sort().join()

  async function save() {
    const { error } = await supabase.from('roles').update({ name: name.trim() || 'Rol', color, permissions: perms, hoist }).eq('id', role.id)
    if (error) onError(error.message)
  }
  async function remove() {
    if (!confirm(`"${role.name}" rolü silinsin mi? Bu role sahip üyelerden de kaldırılır.`)) return
    const { error } = await supabase.from('roles').delete().eq('id', role.id)
    if (error) onError(error.message)
    else onDeleted()
  }

  return (
    <div className="role-editor-inner">
      <div className="role-preview">
        <span className="role-chip" style={{ ['--role' as string]: color }}><i /> {name || 'Rol'}</span>
        <span className="muted small">Sohbette isim bu renkte görünür</span>
      </div>
      <label>
        Rol adı
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={32} />
      </label>
      <div>
        <div className="field-label">Renk</div>
        <div className="swatches">
          {ROLE_COLORS.map((c) => (
            <button key={c} className={`swatch${color === c ? ' active' : ''}`} style={{ background: c }} onClick={() => setColor(c)} title={c} />
          ))}
          <label className="swatch custom" title="Özel renk">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
            <Icon name="plus" size={14} />
          </label>
        </div>
      </div>
      <label className="switch-row">
        <span>
          <strong>Üye listesinde ayrı göster</strong>
          <span className="muted small">Bu roldeki çevrimiçi üyeler kendi başlıkları altında listelenir.</span>
        </span>
        <input type="checkbox" className="switch" checked={hoist} onChange={(e) => setHoist(e.target.checked)} />
      </label>
      <div>
        <div className="field-label">Görevler ve yetkiler</div>
        <div className="perm-list">
          {PERMS.map((p) => (
            <label key={p.id} className="switch-row">
              <span>
                <strong>{p.label}</strong>
                <span className="muted small">{p.desc}</span>
              </span>
              <input
                type="checkbox"
                className="switch"
                checked={perms.includes(p.id)}
                onChange={(e) => setPerms((prev) => (e.target.checked ? [...prev, p.id] : prev.filter((x) => x !== p.id)))}
              />
            </label>
          ))}
        </div>
      </div>
      <div className="row">
        <button className="btn success" onClick={save} disabled={!dirty}>Kaydet</button>
        <button className="btn ghost danger-text" onClick={remove}><Icon name="trash" size={16} /> Rolü sil</button>
      </div>
    </div>
  )
}

// ───────── Üyeler ─────────

function MembersTab() {
  const { members, profiles, userId, roles, rolesOf, myRole, can, openProfile } = useApp()
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState<string | null>(null)
  const isAdmin = myRole === 'admin'

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
  async function giveRole(uid: string, rid: string) {
    setAdding(null)
    const { error } = await supabase.from('member_roles').insert({ user_id: uid, role_id: rid })
    if (error) setError(error.message)
  }
  async function takeRole(uid: string, rid: string) {
    const { error } = await supabase.from('member_roles').delete().match({ user_id: uid, role_id: rid })
    if (error) setError(error.message)
  }

  const name = (id: string) => profiles[id]?.display_name ?? ''
  const sorted = [...members]
    .filter((m) => name(m.user_id).toLocaleLowerCase('tr').includes(query.toLocaleLowerCase('tr')))
    .sort((a, b) => name(a.user_id).localeCompare(name(b.user_id), 'tr'))

  return (
    <div className="settings-page">
      <p className="muted">
        <strong>Temel rol</strong>: Yönetici her şeyi yönetir, Moderatör davet oluşturur ve mesaj yönetir, Üye sohbet eder.
        <strong> Özel roller</strong> bunlara ek görevler ve renk verir.
      </p>
      {error && <div className="form-error">{error}</div>}
      <input className="search-input" placeholder={`${members.length} üye arasında ara…`} value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="list-card">
        {sorted.map((m) => {
          const mine = rolesOf(m.user_id)
          const available = roles.filter((r) => !mine.some((x) => x.id === r.id))
          const canKick = m.user_id !== userId && !m.is_owner && (isAdmin || (can('kick_members') && m.role === 'member'))
          return (
            <div key={m.user_id} className="member-row">
              <button className="member-row-id" onClick={() => openProfile(m.user_id)}>
                <Avatar profile={profiles[m.user_id]} userId={m.user_id} size={36} />
                <div>
                  <div className="member-row-name">
                    {name(m.user_id) || 'Üye'}
                    {m.user_id === userId && <span className="muted"> (sen)</span>}
                    {m.is_owner && <span className="owner-tag"><Icon name="crown" size={10} /> SAHİP</span>}
                  </div>
                  <div className="muted small">Katılma: {new Date(m.joined_at).toLocaleDateString('tr-TR')}</div>
                </div>
              </button>
              <div className="member-row-roles">
                {mine.map((r) => (
                  <span key={r.id} className="role-chip" style={{ ['--role' as string]: r.color }}>
                    <i /> {r.name}
                    {isAdmin && <button className="chip-x" onClick={() => takeRole(m.user_id, r.id)} title="Rolü al">×</button>}
                  </span>
                ))}
                {isAdmin && available.length > 0 && (
                  <span className="add-role-wrap">
                    <button className="role-chip add" onClick={() => setAdding(adding === m.user_id ? null : m.user_id)} title="Rol ver">
                      <Icon name="plus" size={12} />
                    </button>
                    {adding === m.user_id && (
                      <div className="mini-menu" onMouseLeave={() => setAdding(null)}>
                        {available.map((r) => (
                          <button key={r.id} onClick={() => giveRole(m.user_id, r.id)}>
                            <span className="role-dot" style={{ background: r.color }} /> {r.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </span>
                )}
              </div>
              <div className="member-row-actions">
                {isAdmin ? (
                  <select value={m.role} disabled={m.is_owner} onChange={(e) => setRole(m.user_id, e.target.value as Role)}>
                    <option value="admin">Yönetici</option>
                    <option value="mod">Moderatör</option>
                    <option value="member">Üye</option>
                  </select>
                ) : (
                  <span className="muted small">{m.role === 'admin' ? 'Yönetici' : m.role === 'mod' ? 'Moderatör' : 'Üye'}</span>
                )}
                {canKick && <button className="btn danger small" onClick={() => kick(m.user_id)}>At</button>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
