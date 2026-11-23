import {onBeforeUnmount, onMounted, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {useTasksStore} from '@/stores/tasks'
import {backgroundTasksApi} from '@/services/typedApi/backgroundTasks'
import {getReadableFileSize} from '@/services/formatUtils'
import {
  BACKGROUND_TASK_MIN_VISIBLE_MS,
  type BackgroundTaskKind,
  type BackgroundTaskSnapshot,
} from '@shared/backgroundTasks'

const IDLE_POLL_MS = 8_000
/** Faster while something runs so the counter moves. */
const ACTIVE_POLL_MS = 2_000

const TASK_ICONS: Record<BackgroundTaskKind, string> = {
  remoteFingerprint: 'fingerprint',
  cloudMetadata: 'cloud-search-outline',
  nasAssets: 'nas',
  sourceCatalog: 'folder-sync-outline',
  offlineCopy: 'cloud-download-outline',
  copyDiscovery: 'content-copy',
}

/** 1–99 so the Tasks panel always draws the bar for known totals; undefined when the total is unknown. */
export function backgroundTaskProgress(task: Pick<BackgroundTaskSnapshot, 'processed' | 'total'>): number | undefined {
  if (task.total == null || task.total <= 0) return undefined
  const percent = Math.round((task.processed / task.total) * 100)
  return Math.min(99, Math.max(1, percent))
}

/** Server-owned background work (periodic workers, queued jobs) mirrored into the Tasks panel while it really runs. */
export function useBackgroundTasksSync() {
  const {t} = useI18n()
  const app = useAppStore()
  const tasksStore = useTasksStore()
  let polling: AbortController | undefined
  let mounted = false
  let timer: ReturnType<typeof setTimeout> | undefined
  /** Server task id -> id of the entry in the tasks store. */
  const mirrored = new Map<string, string>()

  const amount = (task: BackgroundTaskSnapshot, value: number) =>
    task.unit === 'bytes' ? getReadableFileSize(value) : String(value)

  const subtitle = (task: BackgroundTaskSnapshot) => task.total != null && task.total > 0
    ? t('background_tasks.subtitle_total', {processed: amount(task, task.processed), total: amount(task, task.total)})
    : t('background_tasks.subtitle_count', {processed: amount(task, task.processed)})

  function clear() {
    for (const taskId of mirrored.values()) tasksStore.removeTask(taskId)
    mirrored.clear()
  }

  function apply(tasks: BackgroundTaskSnapshot[]) {
    // Short on-demand work (opening a card) stays invisible; only real runs reach the panel.
    const shown = tasks.filter(task => task.runningMs >= BACKGROUND_TASK_MIN_VISIBLE_MS)
    const shownIds = new Set(shown.map(task => task.id))
    for (const task of shown) {
      const patch = {
        title: t(`background_tasks.${task.kind}`),
        subtitle: subtitle(task),
        icon: TASK_ICONS[task.kind] ?? 'cog',
        progress: backgroundTaskProgress(task),
      }
      const existing = mirrored.get(task.id)
      if (existing && tasksStore.list.some(item => item.id === existing)) {
        tasksStore.updateTask(existing, patch)
      } else {
        mirrored.set(task.id, tasksStore.setTask(patch))
      }
    }
    for (const [serverId, taskId] of [...mirrored]) {
      if (shownIds.has(serverId)) continue
      tasksStore.removeTask(taskId)
      mirrored.delete(serverId)
    }
  }

  async function poll(session: AbortController) {
    if (session.signal.aborted || polling !== session) return
    let active = false
    try {
      if (!document.hidden) {
        const {data} = await backgroundTasksApi.list(session.signal)
        if (session.signal.aborted || polling !== session) return
        apply(data.tasks)
        active = data.tasks.length > 0
      }
    } catch {
      // The backend can be briefly unavailable while switching libraries.
    } finally {
      if (!session.signal.aborted && polling === session) {
        timer = setTimeout(() => { void poll(session) }, active ? ACTIVE_POLL_MS : IDLE_POLL_MS)
      }
    }
  }

  function restart() {
    polling?.abort()
    polling = undefined
    clearTimeout(timer)
    timer = undefined
    clear()
    if (!mounted) return
    const session = new AbortController()
    polling = session
    void poll(session)
  }

  // A new session also distinguishes a quick A -> B -> A library switch.
  watch(() => app.dbPath, restart, {flush: 'sync'})
  onMounted(() => { mounted = true; restart() })
  onBeforeUnmount(() => { mounted = false; restart() })
}
