import { Track, type AudioProcessorOptions, type TrackProcessor } from 'livekit-client'
import { loadRnnoise, RnnoiseWorkletNode } from '@sapphi-red/web-noise-suppressor'
import rnnoiseWorkletPath from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url'
import rnnoiseWasmPath from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url'
import rnnoiseSimdWasmPath from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url'

// RNNoise yalnız 48 kHz ile çalışır.
const SAMPLE_RATE = 48000

// WASM ikili dosyası bir kez indirilir ve saklanır.
let wasmPromise: Promise<ArrayBuffer> | null = null
function loadWasm() {
  if (!wasmPromise) {
    wasmPromise = loadRnnoise({ url: rnnoiseWasmPath, simdUrl: rnnoiseSimdWasmPath }).catch((e) => {
      wasmPromise = null // bir sonraki denemede yeniden indir
      throw e
    })
  }
  return wasmPromise
}

// Worklet modülü her AudioContext için bir kez yüklenir.
const workletLoaded = new WeakMap<BaseAudioContext, Promise<void>>()
function loadWorklet(ctx: AudioContext) {
  let p = workletLoaded.get(ctx)
  if (!p) {
    p = ctx.audioWorklet.addModule(rnnoiseWorkletPath).catch((e) => {
      workletLoaded.delete(ctx)
      throw e
    })
    workletLoaded.set(ctx, p)
  }
  return p
}

/** Mikrofon sesini LiveKit'e gönderilmeden önce RNNoise'tan geçirir. */
export class RnnoiseProcessor implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  name = 'csn-rnnoise'
  processedTrack?: MediaStreamTrack

  private ownCtx: AudioContext | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private node: RnnoiseWorkletNode | null = null
  private dest: MediaStreamAudioDestinationNode | null = null

  async init(opts: AudioProcessorOptions) {
    const ctx = this.pickContext(opts.audioContext)
    const [wasmBinary] = await Promise.all([loadWasm(), loadWorklet(ctx)])
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {})

    const source = ctx.createMediaStreamSource(new MediaStream([opts.track]))
    const node = new RnnoiseWorkletNode(ctx, { maxChannels: 1, wasmBinary })
    const dest = ctx.createMediaStreamDestination()
    dest.channelCount = 1
    source.connect(node)
    node.connect(dest)

    const track = dest.stream.getAudioTracks()[0]
    if (!track) {
      this.source = source
      this.node = node
      this.dest = dest
      this.teardown()
      throw new Error('RNNoise çıkış izi oluşturulamadı')
    }
    this.source = source
    this.node = node
    this.dest = dest
    this.processedTrack = track
  }

  async restart(opts: AudioProcessorOptions) {
    this.teardown()
    await this.init(opts)
  }

  async destroy() {
    this.teardown()
    if (this.ownCtx) {
      const c = this.ownCtx
      this.ownCtx = null
      await c.close().catch(() => {})
    }
  }

  private pickContext(provided?: AudioContext) {
    if (provided && provided.sampleRate === SAMPLE_RATE && provided.state !== 'closed') return provided
    if (!this.ownCtx || this.ownCtx.state === 'closed') {
      this.ownCtx = new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: 'interactive' })
    }
    return this.ownCtx
  }

  private teardown() {
    try {
      this.source?.disconnect()
      this.node?.disconnect()
      this.node?.destroy()
      this.dest?.disconnect()
    } catch {
      // yoksay
    }
    this.processedTrack?.stop()
    this.processedTrack = undefined
    this.source = null
    this.node = null
    this.dest = null
  }
}
