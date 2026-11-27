import {afterEach, describe, expect, it, vi} from 'vitest'
import {MpvMediaElement, type MpvBridge} from './mpvMediaElement'

function createBridge() {
  let listener: ((event: Record<string, unknown>) => void) | null = null
  const bridge: MpvBridge = {
    command: vi.fn(async () => 0),
    setProperty: vi.fn(async () => 0),
    onEvent: vi.fn(callback => {
      listener = callback
      return () => { listener = null }
    }),
  }
  return {bridge, emit: (event: Record<string, unknown>) => listener?.(event), isListening: () => listener != null}
}

function record(element: MpvMediaElement, names: string[]) {
  const seen: string[] = []
  for (const name of names) element.addEventListener(name, () => seen.push(name))
  return seen
}

describe('MpvMediaElement', () => {
  afterEach(() => { vi.useRealTimers() })

  it('loads the url in mpv when src is set', () => {
    const {bridge} = createBridge()
    const element = new MpvMediaElement(bridge)
    element.src = 'http://127.0.0.1:1/api/video/1'
    expect(bridge.command).toHaveBeenCalledWith(['loadfile', 'http://127.0.0.1:1/api/video/1'])
    expect(element.readyState).toBe(0)
  })

  it('becomes ready on file-loaded and reports loadedmetadata once', () => {
    const {bridge, emit} = createBridge()
    const element = new MpvMediaElement(bridge)
    const seen = record(element, ['loadedmetadata', 'loadeddata', 'canplay'])
    emit({event: 'file-loaded'})
    emit({event: 'file-loaded'})
    expect(element.readyState).toBe(4)
    expect(seen).toEqual(['loadedmetadata', 'loadeddata', 'canplay'])
  })

  it('mirrors time, duration, pause and size from property changes', () => {
    const {bridge, emit} = createBridge()
    const element = new MpvMediaElement(bridge)
    const seen = record(element, ['timeupdate', 'durationchange', 'pause', 'play', 'playing'])
    emit({event: 'property-change', name: 'duration', data: 645})
    emit({event: 'property-change', name: 'time-pos', data: 12.5})
    emit({event: 'property-change', name: 'pause', data: false})
    emit({event: 'property-change', name: 'pause', data: true})
    emit({event: 'property-change', name: 'width', data: 1080})
    emit({event: 'property-change', name: 'height', data: 1920})
    expect(element.duration).toBe(645)
    expect(element.currentTime).toBe(12.5)
    expect(element.paused).toBe(true)
    expect([element.videoWidth, element.videoHeight]).toEqual([1080, 1920])
    expect(seen).toEqual(['durationchange', 'timeupdate', 'play', 'pause'])
  })

  it('seeks with an exact absolute seek and finishes on playback-restart', () => {
    const {bridge, emit} = createBridge()
    const element = new MpvMediaElement(bridge)
    emit({event: 'file-loaded'})
    const seen = record(element, ['seeking', 'seeked'])
    element.currentTime = 30
    expect(bridge.command).toHaveBeenCalledWith(['seek', '30', 'absolute+exact'])
    expect(element.seeking).toBe(true)
    emit({event: 'playback-restart'})
    expect(element.seeking).toBe(false)
    expect(seen).toEqual(['seeking', 'seeked'])
  })

  it('applies a seek requested before the file is ready once it loads', () => {
    const {bridge, emit} = createBridge()
    const element = new MpvMediaElement(bridge)
    element.currentTime = 42
    expect(bridge.command).not.toHaveBeenCalledWith(['seek', '42', 'absolute+exact'])
    emit({event: 'file-loaded'})
    expect(bridge.command).toHaveBeenCalledWith(['seek', '42', 'absolute+exact'])
  })

  it('maps volume, mute and speed to mpv properties', () => {
    const {bridge} = createBridge()
    const element = new MpvMediaElement(bridge)
    element.volume = 0.5
    element.muted = true
    element.playbackRate = 1.5
    expect(bridge.setProperty).toHaveBeenCalledWith('volume', 50)
    expect(bridge.setProperty).toHaveBeenCalledWith('mute', 'yes')
    expect(bridge.setProperty).toHaveBeenCalledWith('speed', 1.5)
  })

  it('plays and pauses through the pause property', async () => {
    const {bridge} = createBridge()
    const element = new MpvMediaElement(bridge)
    await element.play()
    element.pause()
    expect(bridge.setProperty).toHaveBeenNthCalledWith(1, 'pause', 'no')
    expect(bridge.setProperty).toHaveBeenNthCalledWith(2, 'pause', 'yes')
  })

  it('fires ended once at end of file and error on a failed load', () => {
    const {bridge, emit} = createBridge()
    const element = new MpvMediaElement(bridge)
    const seen = record(element, ['ended', 'error'])
    emit({event: 'property-change', name: 'eof-reached', data: true})
    emit({event: 'property-change', name: 'eof-reached', data: true})
    emit({event: 'end-file', reason: 4, error: 'loading failed'})
    expect(seen).toEqual(['ended', 'error'])
    expect(element.error?.message).toBe('loading failed')
  })

  it('exposes a buffered range from the demuxer cache', () => {
    const {bridge, emit} = createBridge()
    const element = new MpvMediaElement(bridge)
    expect(element.buffered.length).toBe(0)
    emit({event: 'property-change', name: 'demuxer-cache-time', data: 20})
    expect(element.buffered.length).toBe(1)
    expect(element.buffered.end(0)).toBe(20)
  })

  it('stops listening and stops mpv on dispose', () => {
    const {bridge, isListening} = createBridge()
    const element = new MpvMediaElement(bridge)
    element.dispose()
    expect(isListening()).toBe(false)
    expect(bridge.command).toHaveBeenCalledWith(['stop'])
  })

  it('keeps the current time exact but limits timeupdate and progress events', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    const {bridge, emit} = createBridge()
    const element = new MpvMediaElement(bridge)
    const seen = record(element, ['timeupdate', 'progress'])
    for (let i = 0; i < 10; i++) {
      emit({event: 'property-change', name: 'time-pos', data: i / 30})
      emit({event: 'property-change', name: 'demuxer-cache-time', data: 10 + i})
      vi.advanceTimersByTime(33)
    }
    expect(element.currentTime).toBeCloseTo(9 / 30)
    expect(element.buffered.end(0)).toBe(19)
    expect(seen.filter(name => name === 'timeupdate').length).toBeLessThanOrEqual(4)
    expect(seen.filter(name => name === 'progress').length).toBe(1)
  })

  it('opens the file at the saved position instead of seeking after the load', () => {
    const {bridge, emit} = createBridge()
    const element = new MpvMediaElement(bridge)
    element.startAt(494)
    element.src = 'http://127.0.0.1:1/api/nas/media/1/stream'
    expect(bridge.command).toHaveBeenCalledWith(['loadfile', 'http://127.0.0.1:1/api/nas/media/1/stream', 'replace', '-1', 'start=494'])
    expect(element.currentTime).toBe(494)
    expect(element.seeking).toBe(true)
    emit({event: 'file-loaded'})
    expect(bridge.command).not.toHaveBeenCalledWith(['seek', '494', 'absolute+exact'])
    emit({event: 'playback-restart'})
    expect(element.seeking).toBe(false)
  })

  it('uses the start position only once', () => {
    const {bridge} = createBridge()
    const element = new MpvMediaElement(bridge)
    element.startAt(30)
    element.src = 'http://a/1'
    element.src = 'http://a/2'
    expect(bridge.command).toHaveBeenLastCalledWith(['loadfile', 'http://a/2'])
    expect(element.currentTime).toBe(0)
  })

  it('finishes a seek when mpv reports seeking=false, even before playback-restart', () => {
    const {bridge, emit} = createBridge()
    const element = new MpvMediaElement(bridge)
    emit({event: 'file-loaded'})
    const seen = record(element, ['seeking', 'seeked'])
    element.currentTime = 100
    expect(element.seeking).toBe(true)
    emit({event: 'property-change', name: 'seeking', data: false})
    expect(element.seeking).toBe(false)
    expect(seen).toEqual(['seeking', 'seeked'])
  })

  it('retries a seek that mpv rejects while the file is still opening', async () => {
    vi.useFakeTimers()
    const {bridge, emit} = createBridge()
    const command = bridge.command as ReturnType<typeof vi.fn>
    command.mockResolvedValueOnce(-12).mockResolvedValueOnce(-12).mockResolvedValue(0)
    const element = new MpvMediaElement(bridge)
    emit({event: 'file-loaded'})
    element.currentTime = 200
    await vi.advanceTimersByTimeAsync(0)
    expect(command).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(250)
    await vi.advanceTimersByTimeAsync(250)
    const seeks = command.mock.calls.filter(call => call[0][0] === 'seek')
    expect(seeks).toHaveLength(3)
    expect(seeks.every(call => call[0][1] === '200')).toBe(true)
  })

  it('does not finish a pending seek on the playback-restart of the initial load', async () => {
    vi.useFakeTimers()
    const {bridge, emit} = createBridge()
    const command = bridge.command as ReturnType<typeof vi.fn>
    command.mockResolvedValueOnce(-12).mockResolvedValue(0)
    const element = new MpvMediaElement(bridge)
    emit({event: 'file-loaded'})
    const seen = record(element, ['seeked'])
    element.currentTime = 300
    await vi.advanceTimersByTimeAsync(0)
    emit({event: 'playback-restart'})
    expect(element.seeking).toBe(true)
    expect(seen).toEqual([])
    await vi.advanceTimersByTimeAsync(250)
    emit({event: 'playback-restart'})
    expect(element.seeking).toBe(false)
    expect(seen).toEqual(['seeked'])
  })

  it('lets the latest seek replace an older one that is still being retried', async () => {
    vi.useFakeTimers()
    const {bridge, emit} = createBridge()
    const command = bridge.command as ReturnType<typeof vi.fn>
    command.mockResolvedValueOnce(-12).mockResolvedValue(0)
    const element = new MpvMediaElement(bridge)
    emit({event: 'file-loaded'})
    element.currentTime = 100
    await vi.advanceTimersByTimeAsync(0)
    element.currentTime = 400
    await vi.advanceTimersByTimeAsync(600)
    const targets = command.mock.calls.filter(call => call[0][0] === 'seek').map(call => call[0][1])
    expect(targets.at(-1)).toBe('400')
    expect(targets.filter(target => target === '100')).toHaveLength(1)
  })
})
