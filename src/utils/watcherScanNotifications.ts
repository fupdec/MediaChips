import { setNotification } from '@/services/notificationService'
import { useNotificationsStore } from '@/stores/notifications'

export type WatcherTranslate = (
  key: string,
  named?: Record<string, unknown>,
) => string

export interface WatcherScanStartPayload {
  folderCount: number
  folderNames: string[]
}

export interface WatcherScanFolderSummary {
  name?: string
  path: string
  newCount: number
  lostCount: number
}

export interface WatcherScanSummaryPayload {
  folderCount: number
  newCount: number
  lostCount: number
  folders: WatcherScanFolderSummary[]
  failed?: boolean
  error?: string
}

function folderLabel(folder: WatcherScanFolderSummary): string {
  if (folder.name?.trim()) {
    return folder.name.trim()
  }

  const normalized = folder.path.replace(/\\/g, '/').replace(/\/+$/, '')
  const parts = normalized.split('/')
  return parts[parts.length - 1] || folder.path
}

function buildScanStartText(t: WatcherTranslate, payload: WatcherScanStartPayload): string {
  if (payload.folderNames.length === 1) {
    return t('watcher.scan.start_single', {name: payload.folderNames[0]})
  }

  if (payload.folderNames.length > 1 && payload.folderNames.length <= 3) {
    return t('watcher.scan.start_named', {names: payload.folderNames.join(', ')})
  }

  return t('watcher.scan.start_count', {count: payload.folderCount})
}

function buildScanCompleteText(t: WatcherTranslate, payload: WatcherScanSummaryPayload): string {
  if (payload.failed) {
    return payload.error
      ? t('watcher.scan.complete_failed', {error: payload.error})
      : t('watcher.scan.complete_failed_generic')
  }

  if (payload.newCount === 0 && payload.lostCount === 0) {
    return t('watcher.scan.complete_synchronized')
  }

  const lines = payload.folders
    .filter((folder) => folder.newCount > 0 || folder.lostCount > 0)
    .map((folder) => t('watcher.scan.folder_line', {
      name: folderLabel(folder),
      newCount: folder.newCount,
      lostCount: folder.lostCount,
    }))

  if (lines.length > 0) {
    return lines.join('\n')
  }

  return t('watcher.scan.complete_summary', {
    folders: payload.folderCount,
    newCount: payload.newCount,
    lostCount: payload.lostCount,
  })
}

export function showWatcherScanStartNotification(
  t: WatcherTranslate,
  payload: WatcherScanStartPayload,
): number {
  return setNotification({
    type: 'info',
    title: t('watcher.scan.start_title'),
    text: buildScanStartText(t, payload),
    icon: 'folder-sync-outline',
    timeout: 0,
  })
}

export function showWatcherScanCompleteNotification(
  t: WatcherTranslate,
  payload: WatcherScanSummaryPayload,
  startNotificationId: number | null,
): void {
  if (startNotificationId != null) {
    useNotificationsStore().closeNotification(startNotificationId)
  }

  const hasChanges = payload.newCount > 0 || payload.lostCount > 0

  setNotification({
    type: payload.failed ? 'error' : hasChanges ? 'success' : 'info',
    title: t('watcher.scan.complete_title'),
    text: buildScanCompleteText(t, payload),
    icon: payload.failed ? 'alert-circle-outline' : 'folder-check-outline',
    timeout: hasChanges || payload.failed ? 8000 : 5000,
  })
}
