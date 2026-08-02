import { typedApi } from '@/services/typedApi'
import { setNotification } from '@/services/notificationService'
import { getElectronAPI, getElectronOperable } from '@/services/electronBridge'

interface AxiosLikeError {
  response?: { data?: { message?: string } }
  message?: string
}

function notifyOpenPathError(message: string): void {
  setNotification({
    type: 'error',
    title: 'Failed to open path',
    text: message,
  })
}

function isElectronIpcFailure(message: string): boolean {
  return (
    message.includes('reply was never sent')
    || message.includes('No handler registered')
    || message.includes('Error invoking remote method')
  )
}

async function openPathViaHttp(normalizedPath: string, isDirectory?: boolean) {
  return typedApi.openPath({
    path: normalizedPath,
    isDir: isDirectory,
  })
}

export async function openPath(entryPath: string, isDirectory?: boolean) {
  const normalizedPath = String(entryPath || '').trim()
  if (!normalizedPath) {
    const message = 'Path is required'
    notifyOpenPathError(message)
    throw new Error(message)
  }

  const operable = getElectronOperable()
  if (operable?.openPath) {
    try {
      const result = await operable.openPath({ path: normalizedPath, isDir: isDirectory })
      if (result?.error) {
        throw new Error(result.error)
      }
      return result
    } catch (error) {
      const err = error as AxiosLikeError
      const message = err.message || 'Failed to open path'
      // Prefer the HTTP task endpoint when IPC dies mid-call (common after
      // main-process restarts or when shell.openPath never replies).
      if (isElectronIpcFailure(message)) {
        try {
          return await openPathViaHttp(normalizedPath, isDirectory)
        } catch (fallbackError) {
          const fallback = fallbackError as AxiosLikeError
          const fallbackMessage =
            fallback.response?.data?.message || fallback.message || message
          notifyOpenPathError(fallbackMessage)
          throw fallbackError
        }
      }
      notifyOpenPathError(message)
      throw error
    }
  }

  try {
    return await openPathViaHttp(normalizedPath, isDirectory)
  } catch (error) {
    const err = error as AxiosLikeError
    const message = err.response?.data?.message || err.message || 'Failed to open path'
    notifyOpenPathError(message)
    throw error
  }
}

/** Open http(s)/mailto links in the system browser (Electron) or a new tab (web). */
export async function openExternal(url: string): Promise<void> {
  const normalized = String(url || '').trim()
  if (!normalized) return

  const api = getElectronAPI()
  if (api?.invoke) {
    const result = await api.invoke('openExternal', normalized)
    if (result?.error) {
      throw new Error(result.error)
    }
    return
  }

  window.open(normalized, '_blank', 'noopener,noreferrer')
}
