import { typedApi } from '@/services/typedApi'
import { setNotification } from '@/services/notificationService'
import { getElectronOperable } from '@/services/electronBridge'

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
      notifyOpenPathError(message)
      throw error
    }
  }

  try {
    return await typedApi.openPath({
      path: normalizedPath,
      isDir: isDirectory,
    })
  } catch (error) {
    const err = error as AxiosLikeError
    const message = err.response?.data?.message || err.message
    notifyOpenPathError(message)
    throw error
  }
}
