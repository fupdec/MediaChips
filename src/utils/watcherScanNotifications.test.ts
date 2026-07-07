import { describe, expect, it, vi } from 'vitest'

const { setNotification, closeNotification } = vi.hoisted(() => ({
  setNotification: vi.fn(() => 42),
  closeNotification: vi.fn(),
}))

vi.mock('@/services/notificationService', () => ({
  setNotification,
}))

vi.mock('@/stores/notifications', () => ({
  useNotificationsStore: () => ({
    closeNotification,
  }),
}))

import {
  showWatcherScanCompleteNotification,
  showWatcherScanStartNotification,
} from './watcherScanNotifications'

describe('watcherScanNotifications', () => {
  const t = ((key: string, params?: Record<string, unknown>) => {
    if (params) {
      return `${key}:${JSON.stringify(params)}`
    }
    return key
  }) as never

  it('shows a persistent start notification', () => {
    const id = showWatcherScanStartNotification(t, {
      folderCount: 1,
      folderNames: ['torrents'],
    })

    expect(id).toBe(42)
    expect(setNotification).toHaveBeenCalledWith(expect.objectContaining({
      type: 'info',
      title: 'watcher.scan.start_title',
      icon: 'folder-sync-outline',
      timeout: 0,
    }))
  })

  it('closes the start notification and shows scan results', () => {
    showWatcherScanCompleteNotification(t, {
      folderCount: 1,
      newCount: 2,
      lostCount: 1,
      folders: [{
        name: 'torrents',
        path: '/Volumes/pron/#torrents/',
        newCount: 2,
        lostCount: 1,
      }],
    }, 42)

    expect(closeNotification).toHaveBeenCalledWith(42)
    expect(setNotification).toHaveBeenCalledWith(expect.objectContaining({
      type: 'success',
      title: 'watcher.scan.complete_title',
      icon: 'folder-check-outline',
    }))
  })
})
