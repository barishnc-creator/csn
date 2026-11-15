import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import type { Channel } from '../lib/types'
import Icon from './Icon'

/** Kanal ayarları: ad, konu, kimler görebilir, kimler girebilir (revize #6) */
export default function ChannelSettingsModal({ channelId, onClose }: { channelId: string; onClose: () => void }) {
  const { channels, roles } = useApp()
  const ch = channels.find((c) => c.id === channelId)
  const [name, setName] = useState(ch?.name ?? '')
  const [topic, setTopic] = useState(ch?.topic ?? '')
  const [view, setView] = useState<string[]>(ch?.allowed_roles ?? [])
  const [join, setJoin] = useState<string[]>(ch?.join_roles ?? [])
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  if (!ch) return null
  const isVoice = ch.kind === 'voice'
  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  async function save(c: Channel) {
    setError(null)
    const clean = c.kind === 'text' ? name.trim().toLocaleLowerCase('tr').replace(/\s+/g, '-') : name.trim()
    // Girebilenler görebilmeli: görme kısıtlıysa giriş rolleri görme rollerinin içinde kalsın
    const joinClean = view.length ? join.filter((j) => view.includes(j)) : join
    const { error } = await supabase
      .from('channels')
      .update({
        name: clean || c.name,
        topic: c.kind === 'text' ? topic.trim() || null : null,
        allowed_roles: view.length ? view : null,
        join_roles: joinClean.length ? joinClean : null,
      })
      .eq('id', c.id)
    if (error) setError(error.message)
    else {
      setJoin(joinClean)
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1500)
    }
  }

  async function remove(c: Channel) {
    if (!confirm(`"${c.name}" kanalı ve tüm mesajları silinsin mi? Bu geri alınamaz.`)) return
    const { error } = await supabase.from('channels').delete().eq('id', c.id)
    if (error) setError(error.message)
    else onClose()
  }

  const RoleGrid = ({ list, set, limitTo }: { list: string[]; set: (v: string[]) => void; limitTo?: string[] }) => (
    <div className="role-chips">
      {roles.length === 0 && <span className="muted small">Henüz rol yok. Önce Ayarlar → Roller'den rol oluştur.</span>}
      {roles.map((r) => {
        const disabled = !!limitTo?.length && !limitTo.includes(r.id)
        return (
          <button
            key={r.id}
            className={`role-chip toggle${list.includes(r.id) ? ' on' : ''}`}
            style={{ ['--role' as string]: r.color }}
            disabled={disabled}
            title={disabled ? 'Bu rol kanalı göremiyor' : undefined}
            onClick={() => toggle(list, set, r.id)}
          >
            <i /> {r.name} {list.includes(r.id) && <Icon name="check" size={12} />}
          </button>
        )
      })}
    </div>
  )

  return (
    <div className="modal-backdrop dim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog channel-dialog">
        <div className="dialog-head">
          <h3>
            <Icon name={isVoice ? 'speaker' : 'hash'} size={18} /> Kanal ayarları
          </h3>
          <button className="close-btn" onClick={onClose} title="Kapat (Esc)">
            <Icon name="x" size={18} />
            <span>ESC</span>
          </button>
        </div>

        <label>
          Kanal adı
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </label>
        {!isVoice && (
          <label>
            Konu <span className="hint">isteğe bağlı</span>
            <input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={200} placeholder="Bu kanal ne için?" />
          </label>
        )}

        <section className="perm-block">
          <div className="perm-block-head">
            <Icon name="lock" size={16} />
            <div>
              <strong>Kimler görebilir</strong>
              <div className="muted small">
                {view.length ? 'Yalnız seçili rollerdeki üyeler ve yöneticiler kanalı görür; diğerleri listede bile görmez.' : 'Hiç rol seçilmedi: kanalı herkes görür.'}
              </div>
            </div>
          </div>
          <RoleGrid list={view} set={setView} />
        </section>

        <section className="perm-block">
          <div className="perm-block-head">
            <Icon name={isVoice ? 'mic' : 'edit'} size={16} />
            <div>
              <strong>{isVoice ? 'Kimler bağlanabilir' : 'Kimler yazabilir'}</strong>
              <div className="muted small">
                {join.length
                  ? isVoice
                    ? 'Yalnız seçili roller sese bağlanabilir; diğerleri kanalı kilitli görür.'
                    : 'Yalnız seçili roller mesaj yazabilir; diğerleri sadece okur.'
                  : isVoice
                    ? 'Hiç rol seçilmedi: kanalı gören herkes bağlanabilir.'
                    : 'Hiç rol seçilmedi: kanalı gören herkes yazabilir.'}
              </div>
            </div>
          </div>
          <RoleGrid list={join} set={setJoin} limitTo={view} />
        </section>

        {error && <div className="form-error">{error}</div>}
        <div className="dialog-actions spread">
          <button className="btn ghost danger-text" onClick={() => remove(ch)}><Icon name="trash" size={16} /> Kanalı sil</button>
          <div className="row">
            <button className="btn ghost" onClick={onClose}>Kapat</button>
            <button className="btn success" onClick={() => save(ch)}>{saved ? <><Icon name="check" size={16} /> Kaydedildi</> : 'Kaydet'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
