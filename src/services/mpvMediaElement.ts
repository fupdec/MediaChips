/**
 * An HTMLVideoElement look-alike backed by native mpv (see electron/mpvNative.ts).
 *
 * The player code only needs a small slice of the media element API (about twenty members and a
 * dozen events), so instead of forking the player we expose that slice here. Setting `src` loads
 * the URL in mpv, which plays any format straight from the app's own HTTP stream.
 */

export type MpvBridge = {
  command: (command: string[]) => Promise<number>
  setProperty: (name: string, value: string | number | boolean) => Promise<number>
  onEvent: (callback: (event: Record<string, unknown>) => void) => () => void
}

type TimeRanges = {length: number; start: (index: number) => number; end: (index: number) => number}

/** mpv reports time-pos every frame; the player only needs a few updates per second. */
const TIME_UPDATE_INTERVAL_MS = 100
const PROGRESS_INTERVAL_MS = 500

/** Playing, but the position has not moved for this long: report it as a stall (loading animation). */
const STALL_AFTER_MS = 1200
const STALL_CHECK_MS = 400

/** mpv rejects `seek` (rc < 0) while a file is still opening; retry for up to ~20 s. */
const SEEK_RETRY_MS = 250
const SEEK_RETRY_LIMIT = 80

const HAVE_NOTHING = 0
const HAVE_METADATA = 1
const HAVE_ENOUGH_DATA = 4

function emptyRanges(): TimeRanges {
  return {length: 0, start: () => 0, end: () => 0}
}

export class MpvMediaElement extends EventTarget {
  readonly dataset: Record<string, string> = {}
  readonly style: Record<string, string> = {}
  readonly isMpv = true

  private bridge: MpvBridge
  private unsubscribe: () => void
  private sourceUrl = ''
  private timePos = 0
  private durationValue = NaN
  private pausedValue = true
  private volumeValue = 1
  private mutedValue = false
  private rateValue = 1
  private seekingValue = false
  private ended_ = false
  private widthValue = 0
  private heightValue = 0
  private cacheTime = 0
  /** Position playback actually reached (not a seek target): where the readable cache starts. */
  private playedPos = 0
  /** mpv is waiting for the network (paused-for-cache): there is no data for the current position. */
  private starved = false
  private ready = HAVE_NOTHING
  private errorValue: {code: number; message: string} | null = null
  private pendingSeek: number | null = null
  private startPosition = 0
  private wantedSeek: number | null = null
  /** The last seek command was refused by mpv and is being retried: its completion events are not ours. */
  private seekRejected = false
  private seekRetryTimer: ReturnType<typeof setTimeout> | null = null
  private lastTimeUpdate = 0
  private lastProgress = 0
  /** Last time the playback position moved (or playback was started); drives the stall watchdog. */
  private lastAdvance = Date.now()
  private stalled = false
  private stallTimer: ReturnType<typeof setInterval> | null = null

  constructor(bridge: MpvBridge) {
    super()
    this.bridge = bridge
    this.unsubscribe = bridge.onEvent(event => this.handleEvent(event))
    this.stallTimer = setInterval(() => this.checkStall(), STALL_CHECK_MS)
  }

  /** The element is "waiting" whenever it should be playing but the position stands still. */
  private checkStall() {
    if (this.stalled || this.pausedValue || this.ended_ || this.errorValue || !this.sourceUrl) return
    if (this.ready >= HAVE_METADATA && (this.seekingValue || this.starved)) return // already reported
    if (Date.now() - this.lastAdvance < STALL_AFTER_MS) return
    this.stalled = true
    this.fire('waiting')
  }

  private markAdvanced() {
    this.lastAdvance = Date.now()
    if (!this.stalled) return
    this.stalled = false
    if (!this.pausedValue && !this.starved) this.fire('playing')
  }

  get src(): string { return this.sourceUrl }
  set src(value: string) {
    this.sourceUrl = value || ''
    this.ready = HAVE_NOTHING
    const start = this.startPosition
    this.startPosition = 0
    this.pendingSeek = null
    this.cancelSeek()
    this.timePos = start
    this.playedPos = start
    this.starved = false
    this.durationValue = NaN
    this.ended_ = false
    this.errorValue = null
    this.stalled = false
    this.lastAdvance = Date.now()
    if (this.sourceUrl) {
      // Opening at the saved position directly avoids playing (and saving) the first seconds
      // while a slow remote source finishes a separate seek.
      const command = start > 0
        ? ['loadfile', this.sourceUrl, 'replace', '-1', `start=${start}`]
        : ['loadfile', this.sourceUrl]
      this.seekingValue = start > 0
      void this.bridge.command(command)
      // The file is still opening: show the loading state right away instead of a frozen player.
      this.fire('waiting')
    } else {
      this.seekingValue = false
      void this.bridge.command(['stop'])
    }
  }

  /** Position for the next `src`: mpv opens the file there instead of seeking after the load. */
  startAt(seconds: number): void {
    this.startPosition = Number.isFinite(seconds) && seconds > 0 ? seconds : 0
  }
  get currentSrc(): string { return this.sourceUrl }

  get currentTime(): number { return this.timePos }
  set currentTime(value: number) {
    const target = Math.max(0, Number(value) || 0)
    this.timePos = target
    if (this.ready < HAVE_METADATA) {
      this.pendingSeek = target
      return
    }
    this.seekingValue = true
    this.dispatchEvent(new Event('seeking'))
    this.wantedSeek = target
    void this.sendSeek(0)
  }

  get duration(): number { return this.durationValue }
  get paused(): boolean { return this.pausedValue }
  get seeking(): boolean { return this.seekingValue }
  get ended(): boolean { return this.ended_ }
  get readyState(): number { return (this.starved || this.stalled) && this.ready >= HAVE_ENOUGH_DATA ? 2 : this.ready }
  get videoWidth(): number { return this.widthValue }
  get videoHeight(): number { return this.heightValue }
  get error(): {code: number; message: string} | null { return this.errorValue }
  get buffered(): TimeRanges {
    // The demuxer cache holds the data from the played position to `cacheTime`: a seek outside of
    // it has to fetch from the source, which the player shows as a loading state.
    const start = this.playedPos
    return this.cacheTime > start
      ? {length: 1, start: () => start, end: () => this.cacheTime}
      : emptyRanges()
  }
  get played(): TimeRanges { return emptyRanges() }

  get volume(): number { return this.volumeValue }
  set volume(value: number) {
    this.volumeValue = Math.min(1, Math.max(0, Number(value) || 0))
    void this.bridge.setProperty('volume', Math.round(this.volumeValue * 100))
    this.dispatchEvent(new Event('volumechange'))
  }

  get muted(): boolean { return this.mutedValue }
  set muted(value: boolean) {
    this.mutedValue = Boolean(value)
    void this.bridge.setProperty('mute', this.mutedValue ? 'yes' : 'no')
    this.dispatchEvent(new Event('volumechange'))
  }

  get playbackRate(): number { return this.rateValue }
  set playbackRate(value: number) {
    this.rateValue = Math.min(16, Math.max(0.1, Number(value) || 1))
    void this.bridge.setProperty('speed', this.rateValue)
    this.dispatchEvent(new Event('ratechange'))
  }

  /** mpv owns the audio pipeline; WebAudio, PiP and capture are not available. */
  get autoplay(): boolean { return false }
  set autoplay(_value: boolean) { /* playback is started explicitly through play() */ }
  get preload(): string { return 'auto' }
  set preload(_value: string) { /* mpv always buffers on its own */ }
  get playsInline(): boolean { return true }
  set playsInline(_value: boolean) { /* no-op */ }
  get crossOrigin(): string | null { return null }
  set crossOrigin(_value: string | null) { /* mpv is not subject to CORS */ }

  canPlayType(): CanPlayTypeResult { return 'maybe' }

  getAttribute(_name: string): string | null { return null }
  setAttribute(_name: string, _value: string): void { /* attributes do not apply to mpv */ }
  removeAttribute(name: string): void {
    if (name === 'src') this.src = ''
  }

  private cancelSeek() {
    this.wantedSeek = null
    this.seekRejected = false
    if (this.seekRetryTimer) clearTimeout(this.seekRetryTimer)
    this.seekRetryTimer = null
  }

  /** Send the wanted seek; if mpv refuses it (still opening the file), try again shortly. */
  private async sendSeek(attempt: number): Promise<void> {
    const target = this.wantedSeek
    if (target == null) return
    const rc = await this.bridge.command(['seek', String(target), 'absolute+exact'])
    if (this.wantedSeek !== target) return // a newer seek replaced this one
    if (rc >= 0) {
      this.wantedSeek = null
      this.seekRejected = false
      return
    }
    this.seekRejected = true
    if (attempt >= SEEK_RETRY_LIMIT) {
      this.cancelSeek()
      this.seekingValue = false
      this.fire('seeked')
      return
    }
    this.seekRetryTimer = setTimeout(() => { void this.sendSeek(attempt + 1) }, SEEK_RETRY_MS)
  }

  load(): void {
    if (this.sourceUrl) this.src = this.sourceUrl
  }

  async play(): Promise<void> {
    await this.bridge.setProperty('pause', 'no')
  }

  pause(): void {
    void this.bridge.setProperty('pause', 'yes')
  }

  /** Stop playback and detach from the bridge; the element is unusable afterwards. */
  dispose(): void {
    this.cancelSeek()
    if (this.stallTimer) clearInterval(this.stallTimer)
    this.stallTimer = null
    this.unsubscribe()
    void this.bridge.command(['stop'])
  }

  private fire(name: string) {
    this.dispatchEvent(new Event(name))
  }

  private markReady() {
    if (this.ready >= HAVE_ENOUGH_DATA) return
    const first = this.ready < HAVE_METADATA
    this.ready = HAVE_ENOUGH_DATA
    if (first) {
      this.fire('loadedmetadata')
      this.fire('loadeddata')
    }
    this.fire('canplay')
    this.fire('canplaythrough')
    if (this.pendingSeek != null) {
      const target = this.pendingSeek
      this.pendingSeek = null
      this.currentTime = target
    }
  }

  private handleEvent(event: Record<string, unknown>) {
    const name = String(event.name ?? '')
    switch (event.event) {
      case 'file-loaded':
        this.ended_ = false
        this.markReady()
        break
      case 'playback-restart':
        if (this.seekingValue && !this.seekRejected) {
          this.seekingValue = false
          this.fire('seeked')
        }
        this.lastAdvance = Date.now()
        if (!this.pausedValue) this.fire('playing')
        break
      case 'end-file': {
        const reason = Number(event.reason)
        // 0 = eof, 4 = error (see mpv_end_file_reason); anything else is a stop or redirect.
        if (reason === 4 || event.error) {
          this.errorValue = {code: 4, message: String(event.error || 'Playback failed')}
          this.fire('error')
        }
        break
      }
      case 'property-change':
        this.handleProperty(name, event.data)
        break
      default:
        break
    }
  }

  private handleProperty(name: string, data: unknown) {
    switch (name) {
      case 'time-pos':
        if (typeof data === 'number') {
          // Until the seek lands, time-pos events still carry the old position and would pull the
          // progress bar back to it for a moment; currentTime already holds the target.
          if (this.seekingValue) break
          if (Math.abs(data - this.timePos) > 0.001) this.markAdvanced()
          this.timePos = data
          this.playedPos = data
          const now = Date.now()
          if (now - this.lastTimeUpdate >= TIME_UPDATE_INTERVAL_MS) {
            this.lastTimeUpdate = now
            this.fire('timeupdate')
          }
        }
        break
      case 'duration':
        if (typeof data === 'number') {
          this.durationValue = data
          this.fire('durationchange')
        }
        break
      case 'pause': {
        const paused = Boolean(data)
        if (paused !== this.pausedValue) {
          this.pausedValue = paused
          this.fire(paused ? 'pause' : 'play')
          if (!paused) {
            this.lastAdvance = Date.now()
            // Before the file is open there is nothing playing yet: stay in the loading state.
            if (this.ready >= HAVE_METADATA && !this.starved) this.fire('playing')
          }
        }
        break
      }
      case 'eof-reached':
        if (data === true && !this.ended_) {
          this.ended_ = true
          this.pausedValue = true
          this.fire('ended')
        }
        break
      case 'paused-for-cache':
        this.starved = data === true
        if (data !== true) this.lastAdvance = Date.now()
        this.fire(data === true ? 'waiting' : 'playing')
        break
      case 'seeking':
        if (data === true && !this.seekingValue) {
          this.seekingValue = true
          this.fire('seeking')
        } else if (data === false && this.seekingValue && !this.seekRejected) {
          // mpv's own "seek finished" signal; playback-restart can also arrive for the initial start.
          this.seekingValue = false
          this.fire('seeked')
        }
        break
      case 'demuxer-cache-time':
        if (typeof data === 'number') {
          this.cacheTime = data
          const now = Date.now()
          if (now - this.lastProgress >= PROGRESS_INTERVAL_MS) {
            this.lastProgress = now
            this.fire('progress')
          }
        }
        break
      case 'width':
        if (typeof data === 'number') this.widthValue = data
        break
      case 'height':
        if (typeof data === 'number') this.heightValue = data
        break
      case 'volume':
        if (typeof data === 'number') this.volumeValue = Math.min(1, Math.max(0, data / 100))
        break
      case 'mute':
        this.mutedValue = Boolean(data)
        break
      case 'speed':
        if (typeof data === 'number') this.rateValue = data
        break
      default:
        break
    }
  }
}

export function createMpvMediaElement(bridge: MpvBridge): HTMLVideoElement {
  return new MpvMediaElement(bridge) as unknown as HTMLVideoElement
}

export function isMpvMediaElement(value: unknown): value is MpvMediaElement {
  return value instanceof MpvMediaElement
}
