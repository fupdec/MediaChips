import {describe, expect, it} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'
import {nextNotificationId, useNotificationsStore} from './notifications'

describe('notifications store', () => {
  it('generates unique ids for same-ms bursts', () => {
    const ids = new Set(Array.from({length: 20}, () => nextNotificationId()))
    expect(ids.size).toBe(20)
  })

  it('auto-closes visible toasts after timeout', async () => {
    setActivePinia(createPinia())
    const store = useNotificationsStore()

    const id = store.setNotification({
      type: 'info',
      title: 'Test',
      text: 'Hello',
      timeout: 30,
    })

    expect(store.getNotifications.some(n => n.id === id)).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(store.notifications.some(n => n.id === id)).toBe(false)
  })

  it('keeps manually hidden notifications after timeout', async () => {
    setActivePinia(createPinia())
    const store = useNotificationsStore()

    const id = store.setNotification({
      type: 'info',
      title: 'Test',
      text: 'Hello',
      timeout: 30,
    })
    store.hideNotification(id)

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(store.notifications.some(n => n.id === id && n.hidden)).toBe(true)
  })
})
