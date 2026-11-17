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

/** Shows the background duplicate check of newly added cards as notifications. */
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

  const openReview = (event: DuplicatesOnAddEvent) => dialogsStore.openDuplicateReview({
    duplicatesBy: 'similarity',
    targetMediaId: event.mediaId,
    targetName: event.name,
  })

  const show = (event: DuplicatesOnAddEvent) => {
    const count = Math.max(event.itemIds.length - 1, 1)
    if (event.kind === 'merged') {
      const survivorId = Number(event.survivorId)
      listSync.removeEntitiesFromState({ids: event.itemIds.filter(id => id !== survivorId), type: 'media'})
      if (survivorId > 0) listSync.getItemsFromDb({ids: [survivorId], type: 'media'})
      notificationsStore.setNotification({
        type: 'success',
        icon: 'set-merge',
        title: t('duplicatesOnAdd.merged_title'),
        text: `${event.name}\n${t('duplicatesOnAdd.merged_text', {count})}`,
      })
      return
    }
    const reason = reasonText(event.reason)
    notificationsStore.setNotification({
      type: 'warning',
      icon: 'content-duplicate',
      title: t('duplicatesOnAdd.found_title'),
      text: [event.name, t('duplicatesOnAdd.found_text', {count}), reason && t('duplicatesOnAdd.auto_failed', {reason})]
        .filter(Boolean).join('\n'),
      timeout: 15_000,
      click: () => openReview(event),
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
        for (const event of data.events) {
          if (firstPoll && Date.parse(event.at) < since) continue
          show(event)
        }
      }
    } catch {
      // The backend can be briefly unavailable while switching libraries.
    } finally {
      if (!polling.signal.aborted) timer = setTimeout(poll, status.value?.state === 'running' ? ACTIVE_POLL_MS : POLL_MS)
    }
  }

  async function control(action: 'pause' | 'resume' | 'skip') {
    const dbPath = app.dbPath
    busy.value = true
    failed.value = false
    try {
      const {data} = await duplicatesOnAddApi[action]()
      if (app.dbPath === dbPath) status.value = data
      clearTimeout(timer)
      timer = setTimeout(poll, ACTIVE_POLL_MS)
    } catch {
      if (app.dbPath === dbPath) failed.value = true
    } finally {
      busy.value = false
    }
  }

  // Each library keeps its own event log.
  watch(() => app.dbPath, () => { after = null; status.value = null; failed.value = false })
  onMounted(poll)
  onBeforeUnmount(() => { polling.abort(); clearTimeout(timer) })

  return {status, visible, progress, busy, failed, control}
}
