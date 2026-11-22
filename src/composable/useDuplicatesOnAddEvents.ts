import {computed, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {useDialogsStore} from '@/stores/dialogs'
import {useNotificationsStore} from '@/stores/notifications'
import {useItemsListSync} from '@/composable/itemsListSync'
import {duplicatesOnAddApi} from '@/services/typedApi/duplicatesOnAdd'
import type {DuplicatesOnAddEvent, DuplicatesOnAddStatus} from '@shared/duplicatesOnAdd'

const POLL_MS = 10_000
/** Faster while a run is in progress so the progress bar moves. */
const ACTIVE_POLL_MS = 2_000
/** Events older than this at app start were already relevant to an earlier session. */
const FIRST_POLL_WINDOW_MS = 2 * 60_000

/** Tracks the background duplicate check of newly added cards; reports one summary when it ends. */
export function useDuplicatesOnAddEvents() {
  const {t, te} = useI18n()
  const app = useAppStore()
  const dialogsStore = useDialogsStore()
  const notificationsStore = useNotificationsStore()
  const listSync = useItemsListSync()
  const polling = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let after: number | null = null
  const status = ref<DuplicatesOnAddStatus | null>(null)
  const busy = ref(false)
  const failed = ref(false)
  /** Shown in the notifications panel only while there is something to check. */
  const visible = computed(() => Boolean(status.value && status.value.pending > 0
    && (status.value.state === 'running' || status.value.state === 'paused')))
  const progress = computed(() => {
    const value = status.value
    if (!value) return null
    const total = value.checked + value.pending
    return total > 0 ? (value.checked / total) * 100 : null
  })

  const reasonText = (reason?: string) => reason
    ? (te(`copies.errors.${reason}`) ? t(`copies.errors.${reason}`) : reason)
    : ''

  /** Outcome of the current run: reported once, when the run ends, never per card. */
  let found: DuplicatesOnAddEvent[] = []
  let mergedCount = 0
  let sawRun = false
  let stopping = false

  const openReview = (mediaIds: number[]) => dialogsStore.openDuplicateReview({
    duplicatesBy: 'similarity',
    targetMediaIds: mediaIds,
  })

  /** Merged cards leave the list quietly; one list update per poll however many merged. */
  const syncMerged = (events: DuplicatesOnAddEvent[]) => {
    const survivors = new Set(events.map(event => Number(event.survivorId)).filter(id => id > 0))
    const removed = events.flatMap(event => event.itemIds.filter(id => !survivors.has(id)))
    if (removed.length) listSync.removeEntitiesFromState({ids: removed, type: 'media'})
    if (survivors.size) listSync.getItemsFromDb({ids: [...survivors], type: 'media'})
  }

  const collect = (events: DuplicatesOnAddEvent[]) => {
    const merged = events.filter(event => event.kind === 'merged')
    if (merged.length) syncMerged(merged)
    mergedCount += merged.length
    found.push(...events.filter(event => event.kind !== 'merged'))
    if (events.length) sawRun = true
  }

  /** The single answer to a finished (or stopped) run; silent when there was nothing to report. */
  const finish = () => {
    const stopped = stopping
    const foundIds = [...new Set(found.map(event => event.mediaId))]
    const reason = reasonText(found.find(event => event.reason)?.reason)
    const merged = mergedCount
    found = []; mergedCount = 0; sawRun = false; stopping = false
    if (!foundIds.length && !merged) return
    notificationsStore.setNotification({
      type: foundIds.length ? 'warning' : 'success',
      icon: foundIds.length ? 'content-duplicate' : 'set-merge',
      title: t(stopped ? 'duplicatesOnAdd.stopped_title' : 'duplicatesOnAdd.done_title'),
      text: [
        merged && t('duplicatesOnAdd.done_merged', {count: merged}),
        foundIds.length && t('duplicatesOnAdd.done_found', {count: foundIds.length}),
        reason && t('duplicatesOnAdd.auto_failed', {reason}),
      ].filter(Boolean).join('\n'),
      // Keys are omitted, not set to undefined: undefined would override the store defaults (auto-dismiss).
      ...(foundIds.length ? {timeout: 15_000, click: () => openReview(foundIds)} : {}),
    })
  }

  async function poll() {
    const dbPath = app.dbPath
    try {
      if (!document.hidden) {
        const {data} = await duplicatesOnAddApi.events(after ?? 0, polling.signal)
        if (app.dbPath !== dbPath) return
        const firstPoll = after == null
        after = data.seq
        status.value = data.status
        const since = Date.now() - FIRST_POLL_WINDOW_MS
        collect(data.events.filter(event => !(firstPoll && Date.parse(event.at) < since)))
        const active = data.status.pending > 0 && (data.status.state === 'running' || data.status.state === 'paused')
        if (active) sawRun = true
        else if (sawRun) finish()
      }
    } catch {
      // The backend can be briefly unavailable while switching libraries.
    } finally {
      if (!polling.signal.aborted) timer = setTimeout(poll, status.value?.state === 'running' ? ACTIVE_POLL_MS : POLL_MS)
    }
  }

  async function control(action: 'pause' | 'resume' | 'stop') {
    const dbPath = app.dbPath
    if (action === 'stop') stopping = true
    busy.value = true
    failed.value = false
    try {
      const {data} = await duplicatesOnAddApi[action === 'stop' ? 'skip' : action]()
      if (app.dbPath === dbPath) status.value = data
      clearTimeout(timer)
      timer = setTimeout(poll, action === 'stop' ? 300 : ACTIVE_POLL_MS)
    } catch {
      if (action === 'stop') stopping = false
      if (app.dbPath === dbPath) failed.value = true
    } finally {
      busy.value = false
    }
  }

  // Each library keeps its own event log.
  watch(() => app.dbPath, () => {
    after = null; status.value = null; failed.value = false
    found = []; mergedCount = 0; sawRun = false; stopping = false
  })
  onMounted(poll)
  onBeforeUnmount(() => { polling.abort(); clearTimeout(timer) })

  return {status, visible, progress, busy, failed, control}
}
