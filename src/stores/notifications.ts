import { defineStore } from 'pinia'
import type { NotificationInput } from '@/services/notificationService'
import { maybeShowOsNotification, scheduleDesktopChromeSync } from '@/services/desktopChrome'

interface NotificationTypeSettings {
  icon: string
  color: string
}

interface Notification extends NotificationInput {
  id: number
  timestamp: number
}

interface NotificationsState {
  show: boolean
  notifications: Notification[]
  options: {
    timeout: number
    icon: string
    color: string
    hidden: boolean
  }
  types: Record<'info' | 'success' | 'warning' | 'error', NotificationTypeSettings>
}

export const useNotificationsStore = defineStore('notifications', {
  state: (): NotificationsState => ({
    show: false,
    notifications: [],
    options: {
      timeout: 5000,
      icon: 'information-outline',
      color: 'primary',
      hidden: false,
    },
    types: {
      info: { icon: 'information-outline', color: 'info' },
      success: { icon: 'check-circle-outline', color: 'success' },
      warning: { icon: 'alert-outline', color: 'warning' },
      error: { icon: 'alert-circle-outline', color: 'error' },
    },
  }),
  getters: {
    getNotifications: (state) => state.notifications.filter(i => !i.hidden),
    getNotificationsHidden: (state) => state.notifications.filter(i => i.hidden),
  },
  actions: {
    setNotification(notification: NotificationInput): number {
      const typeSettings = notification.type ? this.types[notification.type] || {} : {}

      const newNotification: Notification = {
        id: Date.now(),
        timestamp: Date.now(),
        ...this.options,
        ...typeSettings,
        ...notification,
      }

      if (this.show) {
        newNotification.hidden = true
      }

      this.notifications.push(newNotification)

      if (newNotification.timeout && newNotification.timeout > 0) {
        setTimeout(() => {
          this.hideNotification(newNotification.id)
        }, newNotification.timeout)
      }

      void maybeShowOsNotification(newNotification)
      scheduleDesktopChromeSync()

      return newNotification.id
    },

    closeNotification(notificationId: number) {
      this.notifications = this.notifications.filter(n => n.id !== notificationId)
      scheduleDesktopChromeSync()
    },

    hideNotification(notificationId: number) {
      const found = this.notifications.find(i => i.id === notificationId)
      if (found) {
        found.hidden = true
        scheduleDesktopChromeSync()
      }
    },

    hideAllNotifications() {
      this.notifications = this.notifications.map(i => {
        i.hidden = true
        return i
      })
      scheduleDesktopChromeSync()
    },

    closeAllNotifications() {
      this.notifications = []
      this.show = false
      scheduleDesktopChromeSync()
    },

    showNextNotification() {
      const hiddenNotifications = this.notifications.filter(n => n.hidden)
      if (hiddenNotifications.length > 0) {
        const nextNotification = hiddenNotifications[0]
        nextNotification.hidden = false
        this.show = true
      }
    },
  },
})

export default useNotificationsStore
