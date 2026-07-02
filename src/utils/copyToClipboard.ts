import {setNotification} from '@/services/notificationService'

export interface CopyToClipboardOptions {
  successText?: string
  silent?: boolean
}

export async function copyToClipboard(
  text: string,
  options: CopyToClipboardOptions = {},
): Promise<boolean> {
  const value = String(text ?? '').trim()
  if (!value) return false

  try {
    await navigator.clipboard.writeText(value)

    if (!options.silent && options.successText) {
      setNotification({
        type: 'success',
        text: options.successText,
      })
    }

    return true
  } catch {
    return false
  }
}
