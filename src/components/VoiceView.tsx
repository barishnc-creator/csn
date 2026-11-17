import { useEffect, useRef, useState } from 'react'
import type { Track } from 'livekit-client'
import { useApp } from '../lib/store'
import type { Channel } from '../lib/types'
import { useVoice, type VoiceParticipant } from '../voice/VoiceContext'
import Avatar from './Avatar'
import Icon from './Icon'
import MusicPanel, { MusicButton } from './MusicPanel'
import SoundpadButton from './Soundpad'
import VoiceExtrasHost from './VoiceExtrasHost'

interface Tile {
  key: string
  participant: VoiceParticipant
  kind: 'screen' | 'camera' | 'avatar'
  track?: Track
}

export default function VoiceView({ channel, onToggleMembers }: { channel: Channel; onToggleMembers: () => void }) {
  const voice = useVoice()
  const { presence, profiles } = useApp()
  const inThis = voice.channelId === channel.id

  if (!inThis) {
    const inside = Object.values(presence).filter((p) => p.voice_channel_id === channel.id)
    return (
      <div className="voice-view">
        <VoiceHeader channel={channel} onToggleMembers={onToggleMembers} />
        <div className="voice-lobby">
          <div className="voice-lobby-icon"><Icon name="speaker" size={40} /></div>
          <h2>{channel.name}</h2>
          <p className="muted">{inside.length ? `${inside.length} kişi içeride` : 'Şu an kimse yok'}</p>
          <div className="lobby-avatars">
            {inside.map((p) => (
              <Avatar key={p.user_id} profile={profiles[p.user_id]} userId={p.user_id} size={48} />
            ))}
          </div>
          <button className="btn primary" onClick={() => voice.join(channel.id)} disabled={voice.connecting}>
            {voice.connecting ? 'Bağlanıyor…' : 'Sese katıl'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="voice-view">
      <VoiceHeader channel={channel} onToggleMembers={onToggleMembers} />
      <CallStage />
    </div>
  )
}

/** Ses/görüntü sahnesi + kontroller (ses kanalında ve DM aramasında ortak) */
export function CallStage({ compact }: { compact?: boolean }) {
  const voice = useVoice()
  const [focus, setFocus] = useState<string | null>(null)
  const [theater, setTheater] = useState(false)
  const tiles: Tile[] = []
  for (const p of voice.participants) {
    if (p.screen) tiles.push({ key: `${p.id}-screen`, participant: p, kind: 'screen', track: p.screen })
    tiles.push(
      p.camera
        ? { key: `${p.id}-camera`, participant: p, kind: 'camera', track: p.camera }
        : { key: `${p.id}-avatar`, participant: p, kind: 'avatar' },
    )
  }
  const focused = tiles.find((t) => t.key === focus) ?? null
  const rest = focused ? tiles.filter((t) => t !== focused) : tiles
  const isTheater = theater && !!focused

  // Yayın bitince ya da kutu kaybolunca tam pencereden çık; Esc ile de çıkılır
  useEffect(() => {
    if (!isTheater) return
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setTheater(false)
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [isTheater])

  function openTheater(key: string) {
    setFocus(key)
    setTheater(true)
  }

  return (
    <div className={`call-stage${compact ? ' compact' : ''}${focused ? ' focused' : ''}${isTheater ? ' theater' : ''}`}>
      {isTheater && (
        <div className="theater-bar">
          <span className="live-tag">CANLI</span>
          <strong>{focused?.participant.name}</strong>
          <span className="muted small">Çıkmak için Esc</span>
          <button className="btn ghost small" onClick={() => setTheater(false)}><Icon name="back" size={16} /> Pencereden çık</button>
        </div>
      )}
      <VoiceExtrasHost />
      <div className={`voice-stage${focused ? ' has-focus' : ''}`}>
        <MusicPanel />
        {focused && (
          <div className="focus-area">
            <TileView tile={focused} big onClick={() => { setFocus(null); setTheater(false) }} onTheater={() => setTheater((t) => !t)} theater={isTheater} />
          </div>
        )}
        <div className={`tile-grid n${Math.min(rest.length, 9)}`}>
          {rest.map((t) => (
            <TileView key={t.key} tile={t} onClick={() => setFocus(t.key)} onTheater={() => openTheater(t.key)} />
          ))}
        </div>
      </div>
      <div className="voice-controls">
        <button className={`round-btn${voice.muted ? ' danger' : ''}`} onClick={voice.toggleMute} title="Mikrofon">
          <Icon name={voice.muted ? 'micOff' : 'mic'} size={22} />
        </button>
        <button className={`round-btn${voice.cameraOn ? ' on' : ''}`} onClick={voice.toggleCamera} title="Kamera">
          <Icon name={voice.cameraOn ? 'camera' : 'cameraOff'} size={22} />
        </button>
        <button className={`round-btn${voice.screenOn ? ' on' : ''}`} onClick={voice.toggleScreen} title="Ekran paylaş">
          <Icon name="screen" size={22} />
        </button>
        <button className={`round-btn${voice.deafened ? ' danger' : ''}`} onClick={voice.toggleDeafen} title="Sağırlaştır">
          <Icon name={voice.deafened ? 'headphonesOff' : 'headphones'} size={22} />
        </button>
        <MusicButton />
        <SoundpadButton variant="round" />
        <button className="round-btn danger solid" onClick={voice.leave} title="Ayrıl">
          <Icon name="phoneOff" size={22} />
        </button>
      </div>
      {voice.settings.inputMode === 'ptt' && (
        <div className="ptt-hint">
          Bas-konuş açık: konuşmak için <kbd>{voice.settings.pttKey.replace(/^Key/, '')}</kbd> tuşunu basılı tut
        </div>
      )}
    </div>
  )
}

function VoiceHeader({ channel, onToggleMembers }: { channel: Channel; onToggleMembers: () => void }) {
  return (
    <header className="main-header">
      <Icon name="speaker" size={22} className="header-icon" />
      <span className="header-title">{channel.name}</span>
      <div className="header-actions">
        <button className="icon-btn" onClick={onToggleMembers} title="Üye listesi"><Icon name="users" /></button>
      </div>
    </header>
  )
}

function TileView({ tile, big, onClick, onTheater, theater }: { tile: Tile; big?: boolean; onClick: () => void; onTheater?: () => void; theater?: boolean }) {
  const { profiles } = useApp()
  const ref = useRef<HTMLVideoElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const p = tile.participant

  useEffect(() => {
    const el = ref.current
    if (!el || !tile.track) return
    tile.track.attach(el)
    return () => {
      tile.track?.detach(el)
    }
  }, [tile.track])

  function fullscreen(e: React.MouseEvent) {
    e.stopPropagation()
    box.current?.requestFullscreen?.()
  }

  return (
    <div
      ref={box}
      className={`tile ${tile.kind}${tile.kind === 'screen' && !p.isLocal ? ' remote' : ''}${p.speaking && tile.kind !== 'screen' ? ' speaking' : ''}${big ? ' big' : ''}`}
      onClick={onClick}
    >
      {tile.track ? (
        <video ref={ref} autoPlay playsInline muted className={tile.kind === 'camera' && p.isLocal ? 'mirror' : ''} />
      ) : (
        <Avatar profile={profiles[p.id]} userId={p.id} size={big ? 120 : 80} speaking={p.speaking} />
      )}
      <div className="tile-label">
        {tile.kind === 'screen' && <span className="live-tag">CANLI</span>}
        {p.micMuted && tile.kind !== 'screen' && <Icon name="micOff" size={14} />}
        <span>{p.name}{p.isLocal ? ' (sen)' : ''}</span>
      </div>
      {tile.track && (
        <div className="tile-tools" onClick={(e) => e.stopPropagation()}>
          {onTheater && (
            <button onClick={onTheater} title={theater ? 'Pencereden çık' : 'Pencereyi doldur'}>
              <Icon name={theater ? 'back' : 'maximize'} size={16} />
            </button>
          )}
          <button onClick={fullscreen} title="Tam ekran (görev çubuğu dahil)"><Icon name="screen" size={16} /></button>
        </div>
      )}
    </div>
  )
}
