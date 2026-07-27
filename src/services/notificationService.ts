import { useNotificationsStore } from '@/stores/notifications'

export interface NotificationInput {
  type?: 'info' | 'success' | 'warning' | 'error'
  title?: string
  text?: string
  timeout?: number
  icon?: string
  color?: string
  hidden?: boolean
  /** Force/skip OS notification when the app window is unfocused. */
  desktop?: boolean
  [key: string]: unknown
}

export function setNotification(data: NotificationInput): number {
  const notifications = useNotificationsStore()
  return notifications.setNotification(data)
}
