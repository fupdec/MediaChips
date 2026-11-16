import {createApp, ref, nextTick} from 'vue'
import {createPinia, setActivePinia} from 'pinia'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {usePlayerStore} from '@/stores/player'
import type {MediaItem} from '@/types/stores'
import {usePlayerPositionPersistence} from './usePlayerPositionPersistence'

describe('playback checkpoints', () => {
  let app: ReturnType<typeof createApp>
  let player: ReturnType<typeof usePlayerStore>
  let ready: ReturnType<typeof ref<boolean | null>>
  let save: ReturnType<typeof vi.fn>
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    player = usePlayerStore()
    player.active = true
    player.media = {id: 7, path: 'gdrive://movie'} as MediaItem
    player.currentTime = 42
    ready = ref(true)
    save = vi.fn(async () => {})
    app = createApp({setup() {usePlayerPositionPersistence(player, ready, save); return () => null}})
    app.mount(document.createElement('div'))
  })
  afterEach(() => {app.unmount(); vi.useRealTimers()})
  it('periodically saves the absolute position and checkpoints a pause', async () => {
    await vi.advanceTimersByTimeAsync(5000)
    expect(save).toHaveBeenLastCalledWith(player.media, 42)
    player.currentTime = 47
    player.paused = true
    await nextTick()
    expect(save).toHaveBeenLastCalledWith(player.media, 47)
    await vi.advanceTimersByTimeAsync(5000)
    expect(save).toHaveBeenCalledTimes(2)
  })
  it('keeps the last good position during a connection failure', async () => {
    player.playbackError = true
    player.currentTime = 63
    await vi.advanceTimersByTimeAsync(5000)
    expect(save).toHaveBeenLastCalledWith(player.media, 63)
    player.webVideoLoading = true
    player.currentTime = 0
    await vi.advanceTimersByTimeAsync(5000)
    expect(save).toHaveBeenCalledTimes(1)
  })
  it('does not persist previews, loading states or incomplete seeks', async () => {
    player.media!.id = 0
    await vi.advanceTimersByTimeAsync(5000)
    player.media!.id = 7
    ready.value = false
    await vi.advanceTimersByTimeAsync(5000)
    ready.value = true
    player.isLiveStreamSeeking = true
    await vi.advanceTimersByTimeAsync(5000)
    expect(save).not.toHaveBeenCalled()
  })
  it('retries a failed checkpoint at the same position when the connection returns', async () => {
    save.mockResolvedValueOnce(false)
    await vi.advanceTimersByTimeAsync(5000)
    await vi.advanceTimersByTimeAsync(5000)
    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith(player.media, 42)
  })

})
