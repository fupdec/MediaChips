import {defineStore} from 'pinia'
import {ref, computed, shallowRef} from 'vue'

export type FsQueueEntry = {
  id: number
  label: string
  kind: 'delete' | 'copy' | 'move' | 'other'
  entryCount: number
}

let _nextId = 1

export const useFsOperationsQueue = defineStore('fsOperationsQueue', () => {
  const active = ref(false)
  const activeEntry = shallowRef<FsQueueEntry | null>(null)
  const pending = ref<FsQueueEntry[]>([])

  const isBusy = computed(() => active.value)
  const pendingCount = computed(() => pending.value.length)
  const totalPending = computed(() => (active.value ? 1 : 0) + pending.value.length)

  async function enqueue<T>(
    entry: Omit<FsQueueEntry, 'id'>,
    fn: () => Promise<T>,
  ): Promise<T> {
    const id = _nextId++
    const full: FsQueueEntry = {id, ...entry}
    pending.value = [...pending.value, full]

    // Wait until we're at the front and not busy
    await waitForTurn(id)

    active.value = true
    pending.value = pending.value.filter((e) => e.id !== id)
    activeEntry.value = full

    try {
      return await fn()
    } finally {
      active.value = false
      activeEntry.value = null
      // If more items queued while this was running, wake the next
      if (pending.value.length > 0) {
        _wakeNext(pending.value[0].id)
      }
    }
  }

  // Internal: resolve map for waiting enqueue calls
  const _waiters = new Map<number, () => void>()

  function waitForTurn(id: number): Promise<void> {
    if (pending.value[0]?.id === id && !active.value) {
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      _waiters.set(id, resolve)
    })
  }

  function _wakeNext(id: number) {
    const resolve = _waiters.get(id)
    if (resolve) {
      _waiters.delete(id)
      resolve()
    }
  }

  return {
    active,
    activeEntry,
    pending,
    isBusy,
    pendingCount,
    totalPending,
    enqueue,
  }
})