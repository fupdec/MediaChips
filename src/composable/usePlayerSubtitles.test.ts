import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {createApp, nextTick, reactive} from 'vue'
import type {usePlayerStore} from '@/stores/player'
import type {SubtitleTrack} from '@shared/subtitles'
import {mediaSubtitlesApi} from '@/services/typedApi/mediaSubtitles'
import {usePlayerSubtitles} from './usePlayerSubtitles'

vi.mock('@/services/typedApi/mediaSubtitles', () => ({mediaSubtitlesApi: {list: vi.fn(), read: vi.fn()}}))
const cleanups: Array<() => void> = []
const tracks: SubtitleTrack[] = [{name: 'movie.srt', label: '', format: 'srt'}]
function text(value: string) {
  return {data: {name: 'movie.srt', format: 'srt', text: `1\n00:00:01,000 --> 00:00:04,000\n${value}\n`}}
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return {promise, resolve}
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  localStorage.clear()
  vi.mocked(mediaSubtitlesApi.list).mockResolvedValue({data: {tracks}} as never)
  vi.mocked(mediaSubtitlesApi.read).mockResolvedValue(text('Current') as never)
})
afterEach(() => { cleanups.splice(0).forEach(fn => fn()); vi.useRealTimers() })
function setup() {
  const player = reactive({media: {id: 1}, isAudioMode: false, subtitleScale: 1,
    subtitleTracks: [] as SubtitleTrack[], subtitleTrackName: null as string | null,
    subtitleDelay: 0, player: null, currentTime: 2, usesLiveTranscode: false, liveStreamOffset: 0})
  let api!: ReturnType<typeof usePlayerSubtitles>
  const app = createApp({setup() {
    api = usePlayerSubtitles(player as unknown as ReturnType<typeof usePlayerStore>)
    return () => null
  }})
  app.mount(document.createElement('div'))
  cleanups.push(() => app.unmount())
  return {player, api}
}
async function flush() { await nextTick(); await vi.advanceTimersByTimeAsync(0) }

describe('player subtitle request lifecycle', () => {
  it('loads and renders the first track, then stops the clock on disposal', async () => {
    const {api} = setup()
    await flush()
    expect(api.subtitleHtml.value).toBe('Current')
    expect(vi.getTimerCount()).toBe(1)
    cleanups.pop()!()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('aborts the track listing and ignores its response after disposal', async () => {
    const pending = deferred<{data: {tracks: SubtitleTrack[]}}>()
    vi.mocked(mediaSubtitlesApi.list).mockReturnValueOnce(pending.promise as never)
    const {player} = setup()
    const signal = vi.mocked(mediaSubtitlesApi.list).mock.calls[0][1]?.signal
    cleanups.pop()!()
    expect(signal?.aborted).toBe(true)
    pending.resolve({data: {tracks}})
    await flush()
    expect(player.subtitleTracks).toEqual([])
    expect(player.subtitleTrackName).toBeNull()
    expect(mediaSubtitlesApi.read).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('aborts subtitle reads and ignores late text after disposal', async () => {
    const pending = deferred<ReturnType<typeof text>>()
    vi.mocked(mediaSubtitlesApi.read).mockReturnValueOnce(pending.promise as never)
    const {api} = setup()
    await flush()
    const signal = vi.mocked(mediaSubtitlesApi.read).mock.calls[0][2]?.signal
    cleanups.pop()!()
    expect(signal?.aborted).toBe(true)
    pending.resolve(text('Stale'))
    await flush()
    expect(api.subtitleHtml.value).toBe('')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels the old listing when switching videos', async () => {
    const pending = deferred<{data: {tracks: SubtitleTrack[]}}>()
    vi.mocked(mediaSubtitlesApi.list).mockReturnValueOnce(pending.promise as never)
    const {player, api} = setup()
    const signal = vi.mocked(mediaSubtitlesApi.list).mock.calls[0][1]?.signal
    player.media = {id: 2}
    expect(signal?.aborted).toBe(true)
    await flush()
    pending.resolve({data: {tracks: [{name: 'old.srt', label: '', format: 'srt'}]}})
    await flush()
    expect(player.subtitleTrackName).toBe('movie.srt')
    expect(api.subtitleHtml.value).toBe('Current')
    expect(mediaSubtitlesApi.read).toHaveBeenCalledTimes(1)
    expect(mediaSubtitlesApi.read).toHaveBeenCalledWith(2, 'movie.srt', expect.anything())
  })

  it('does not reuse a same-named subtitle file from the previous video', async () => {
    const pending = deferred<ReturnType<typeof text>>()
    vi.mocked(mediaSubtitlesApi.read).mockReturnValueOnce(pending.promise as never)
    const {player, api} = setup()
    await flush()
    const signal = vi.mocked(mediaSubtitlesApi.read).mock.calls[0][2]?.signal
    player.media = {id: 2}
    expect(signal?.aborted).toBe(true)
    await flush()
    pending.resolve(text('Old video'))
    await flush()
    expect(api.subtitleHtml.value).toBe('Current')
    expect(mediaSubtitlesApi.read).toHaveBeenCalledTimes(2)
  })

  it('cancels a read when another track is selected', async () => {
    const pending = deferred<ReturnType<typeof text>>()
    vi.mocked(mediaSubtitlesApi.read).mockReturnValueOnce(pending.promise as never)
    const {player, api} = setup()
    await flush()
    const signal = vi.mocked(mediaSubtitlesApi.read).mock.calls[0][2]?.signal
    player.subtitleTrackName = 'second.srt'
    expect(signal?.aborted).toBe(true)
    await flush()
    pending.resolve(text('Old track'))
    await flush()
    expect(api.subtitleHtml.value).toBe('Current')
  })

  it('clears subtitles on audio mode and reloads them when returning to video', async () => {
    const {player, api} = setup()
    await flush()
    player.isAudioMode = true
    await flush()
    expect(api.subtitleHtml.value).toBe('')
    expect(player.subtitleTracks).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
    expect(mediaSubtitlesApi.list).toHaveBeenCalledTimes(1)
    player.isAudioMode = false
    await flush()
    expect(mediaSubtitlesApi.list).toHaveBeenCalledTimes(2)
    expect(api.subtitleHtml.value).toBe('Current')
  })
})
