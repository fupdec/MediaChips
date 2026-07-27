import { getElectronAPI } from '@/services/electronBridge'
import { isAppWindowFocused } from '@/utils/windowFocus'
import type { NotificationInput } from '@/services/notificationService'

let lastBadge = -1
let lastProgress: number | null | undefined = undefined
let syncTimer: ReturnType<typeof setTimeout> | null = null

function getApi() {
  return getElectronAPI()
}

export async function showOsNotification(payload: {
  title: string
  body?: string
  silent?: boolean
}): Promise<void> {
  const api = getApi()
  if (!api?.invoke) return
  try {
    await api.invoke('showOsNotification', {
      title: payload.title,
      body: payload.body || '',
      silent: Boolean(payload.silent),
    })
  } catch (error) {
    console.warn('OS notification failed:', error)
  }
}

export async function setDockBadge(count: number): Promise<void> {
  const api = getApi()
  if (!api?.invoke) return
  const normalized = Math.max(0, Math.floor(Number(count) || 0))
  if (normalized === lastBadge) return
  lastBadge = normalized
  try {
    await api.invoke('setDockBadge', { count: normalized })
  } catch (error) {
    console.warn('Dock badge failed:', error)
  }
}

export async function setTaskProgressBar(value: number | null): Promise<void> {
  const api = getApi()
  if (!api?.invoke) return

  const next = value == null || !Number.isFinite(value) || value < 0
    ? null
    : Math.min(1, Math.max(0, value))

  if (next === lastProgress) return
  lastProgress = next

  try {
    await api.invoke('setProgressBar', { value: next })
  } catch (error) {
    console.warn('Progress bar failed:', error)
  }
}

/** Whether this in-app notification should also appear as an OS toast when unfocused. */
export function shouldShowOsNotification(notification: NotificationInput): boolean {
  if (notification.desktop === false) return false
  if (notification.desktop === true) return true

  const type = notification.type || 'info'
  if (type === 'success' || type === 'warning' || type === 'error') return true

  // Sticky in-progress toasts (timeout: 0) stay in-app only — e.g. watcher scan start.
  if (type === 'info') {
    const timeout = notification.timeout
    if (timeout === 0) return false
    return true
  }

  return false
}

/** Ask Electron whether the user can currently see the main window (Spaces/occlusion-aware). */
export async function isDesktopAppUserFacing(): Promise<boolean> {
  const api = getApi()
  if (api?.invoke) {
    try {
      return Boolean(await api.invoke('isMainWindowFocused'))
    } catch {
      // Fall back to renderer focus flag.
    }
  }
  return isAppWindowFocused()
}

export async function maybeShowOsNotification(notification: NotificationInput): Promise<void> {
  if (!getApi()?.invoke) return
  // Prefer main-process visibility: macOS Spaces/fullscreen often leave document.hasFocus stale.
  if (await isDesktopAppUserFacing()) return
  if (!shouldShowOsNotification(notification)) return

  const title = String(notification.title || 'MediaChips').trim() || 'MediaChips'
  const body = String(notification.text || '').trim()
  await showOsNotification({ title, body })
}

export type DesktopChromeSnapshot = {
  badgeCount: number
  /** 0–1 while a long task runs, null to clear */
  progress: number | null
}

export async function applyDesktopChrome(snapshot: DesktopChromeSnapshot): Promise<void> {
  await Promise.all([
    setDockBadge(snapshot.badgeCount),
    setTaskProgressBar(snapshot.progress),
  ])
}

/**
 * Debounced sync used by notifications/tasks stores.
 * Lazy-imports Pinia stores to avoid circular deps at module load.
 */
export function scheduleDesktopChromeSync(): void {
  if (!getApi()?.invoke) return
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    void syncDesktopChromeNow()
  }, 50)
}

export async function syncDesktopChromeNow(): Promise<void> {
  if (!getApi()?.invoke) return

  try {
    const { useNotificationsStore } = await import('@/stores/notifications')
    const { useTasksStore } = await import('@/stores/tasks')

    const notifications = useNotificationsStore()
    const tasks = useTasksStore()

    const badgeCount = notifications.getNotificationsHidden.length + tasks.list.length

    let progress: number | null = null
    if (tasks.mediaAdding.active) {
      progress = Math.min(1, Math.max(0, (tasks.mediaAdding.progress || 0) / 100))
    } else {
      const active = tasks.list.find((task) => {
        if (task.done) return false
        return typeof task.progress === 'number' && task.progress < 100
      })
      if (active && typeof active.progress === 'number') {
        progress = Math.min(1, Math.max(0, active.progress / 100))
      }
    }

    await applyDesktopChrome({ badgeCount, progress })
  } catch (error) {
    console.warn('Desktop chrome sync failed:', error)
  }
}
