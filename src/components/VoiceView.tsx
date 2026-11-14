import { useEffect, useRef, useState } from 'react'
import type { Track } from 'livekit-client'
import { useApp } from '../lib/store'
import type { Channel } from '../lib/types'
import { useVoice, type VoiceParticipant } from '../voice/VoiceContext'
import Avatar from './Avatar'
import Icon from './Icon'

interface Tile {
  key: string
  participant: VoiceParticipant
  kind: 'screen' | 'camera' | 'avatar'
  track?: Track
}

export default function VoiceView({ channel, onToggleMembers }: { channel: Channel; onToggleMembers: () => void }) {
  const voice = useVoice()
  const { presence, profiles } = useApp()
  const [focus, setFocus] = useState<string | null>(null)
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

  return (
    <div className="voice-view">
      <VoiceHeader channel={channel} onToggleMembers={onToggleMembers} />
      <div className={`voice-stage${focused ? ' has-focus' : ''}`}>
        {focused && (
          <div className="focus-area">
            <TileView tile={focused} big onClick={() => setFocus(null)} />
          </div>
        )}
        <div className={`tile-grid n${Math.min(rest.length, 9)}`}>
          {rest.map((t) => (
            <TileView key={t.key} tile={t} onClick={() => setFocus(t.key)} />
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

function TileView({ tile, big, onClick }: { tile: Tile; big?: boolean; onClick: () => void }) {
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
      className={`tile ${tile.kind}${p.speaking && tile.kind !== 'screen' ? ' speaking' : ''}${big ? ' big' : ''}`}
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
        <button className="tile-fs" onClick={fullscreen} title="Tam ekran"><Icon name="maximize" size={16} /></button>
      )}
    </div>
  )
}
