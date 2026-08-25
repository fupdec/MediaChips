import {describe, expect, it} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'
import {nextNotificationId, useNotificationsStore} from './notifications'

describe('notifications store', () => {
  it('generates unique ids for same-ms bursts', () => {
    const ids = new Set(Array.from({length: 20}, () => nextNotificationId()))
    expect(ids.size).toBe(20)
  })

  it('setNotification returns id and keeps toast visible in pool', () => {
    setActivePinia(createPinia())
    const store = useNotificationsStore()

    const id = store.setNotification({
      type: 'info',
      title: 'Test',
      text: 'Hello',
      timeout: 30,
    })

    expect(store.getNotifications.some(n => n.id === id)).toBe(true)
    // Auto-dismiss is owned by Notification.vue (rAF + hover pause), not the store.
    expect(store.notifications.some(n => n.id === id && !n.hidden)).toBe(true)
  })

  it('adds a related database file path to notification text', () => {
    setActivePinia(createPinia())
    const store = useNotificationsStore()

    const id = store.setNotification({
      type: 'error',
      title: 'Operation failed',
      text: 'Could not process the file',
      filePath: '/videos/example.mp4',
    })

    const notification = store.notifications.find(n => n.id === id)
    expect(notification?.title).toBe('Operation failed')
    expect(notification?.text).toBe('Could not process the file\n/videos/example.mp4')
  })

  it('hideNotification archives toast without removing it', () => {
    setActivePinia(createPinia())
    const store = useNotificationsStore()

    const id = store.setNotification({
      type: 'info',
      title: 'Test',
      text: 'Hello',
      timeout: 30,
    })
    store.hideNotification(id)

    expect(store.getNotifications.some(n => n.id === id)).toBe(false)
    expect(store.notifications.some(n => n.id === id && n.hidden)).toBe(true)
  })

  it('closeAllNotifications clears pool and menu', () => {
    setActivePinia(createPinia())
    const store = useNotificationsStore()

    store.setNotification({type: 'info', title: 'A', text: '1', timeout: 0})
    store.setNotification({type: 'success', title: 'B', text: '2', timeout: 0})
    store.closeAllNotifications()

    expect(store.notifications).toHaveLength(0)
    expect(store.show).toBe(false)
  })
})
