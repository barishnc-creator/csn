import { useEffect } from 'react'
import { useVoice } from '../voice/VoiceContext'
import { music } from '../voice/music'
import { soundpad } from '../voice/soundpad'

/**
 * Ses kanalındayken müzik eşitlemesini ve soundpad dinleyicisini açık tutar.
 * Görünmez; VoiceBar ve CallStage içinde durur (sayaçlı, ikisi birden olsa da tek bağlantı).
 */
export default function VoiceExtrasHost() {
  const { channelId, deafened } = useVoice()

  useEffect(() => {
    if (!channelId) return
    music.attach(channelId)
    soundpad.attach(channelId)
    return () => {
      music.detach()
      soundpad.detach()
    }
  }, [channelId])

  useEffect(() => {
    music.setDeafened(deafened)
    soundpad.setDeafened(deafened)
  }, [deafened])

  return null
}
