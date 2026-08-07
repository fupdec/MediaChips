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
  /** Invoked when the user clicks the notification body. */
  click?: (() => void) | null
  /** Absolute path revealed when the OS toast is clicked (Electron). */
  revealPath?: string
  [key: string]: unknown
}

export function setNotification(data: NotificationInput): number {
  const notifications = useNotificationsStore()
  return notifications.setNotification(data)
}
