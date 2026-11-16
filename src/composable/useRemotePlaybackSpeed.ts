import {onBeforeUnmount, ref, watch, type Ref} from 'vue'
import {apiClient} from '@/services/apiClient'
import {getHlsDownloadSpeed, getRemotePlaybackTransfer} from '@/services/webVideoPlayback'

export function useRemotePlaybackSpeed(video: Ref<HTMLVideoElement | null>, enabled: Ref<boolean>) {
  const bytesPerSecond = ref<number | null>(null)
  const stop = watch([video, enabled], ([element, active], _old, onCleanup) => {
    bytesPerSecond.value = null
    if (!element || !active) return
    let disposed = false
    let pending = false
    let previous: {id: string; bytes: number; time: number} | null = null
    const controller = new AbortController()
    const sample = async () => {
      if (pending) return
      const id = getRemotePlaybackTransfer(element)
      if (!id) { bytesPerSecond.value = getHlsDownloadSpeed(element); previous = null; return }
      pending = true
      try {
        const {data} = await apiClient.get<{bytes: number}>(`/api/remote-playback-speed/${id}`, {signal: controller.signal, timeout: 5000})
        if (disposed || id !== getRemotePlaybackTransfer(element)) return
        const time = performance.now()
        bytesPerSecond.value = previous?.id === id && data.bytes >= previous.bytes
          ? (data.bytes - previous.bytes) * 1000 / Math.max(1, time - previous.time) : null
        previous = {id, bytes: data.bytes, time}
      } catch { if (!disposed) { bytesPerSecond.value = null; previous = null } }
      finally { pending = false }
    }
    const timer = window.setInterval(sample, 1000)
    void sample()
    onCleanup(() => { disposed = true; controller.abort(); window.clearInterval(timer) })
  }, {immediate: true})
  onBeforeUnmount(stop)
  return bytesPerSecond
}
