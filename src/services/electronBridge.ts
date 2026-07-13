import type {
  ElectronBridgeAPI,
  ElectronOperableAPI,
  OpenDialogResult,
} from '@shared/electron/ipc'

export function isElectron(): boolean {
  return typeof window !== 'undefined' && Boolean(window.electronAPI)
}

export function getElectronAPI(): ElectronBridgeAPI | undefined {
  if (typeof window === 'undefined') return undefined
  return window.electronAPI
}

export function getElectronOperable(): ElectronOperableAPI | undefined {
  if (typeof window === 'undefined') return undefined
  return (window.$electronOperable ?? window.operableAPI) as ElectronOperableAPI | undefined
}

export async function checkFileExistsElectron(filePath: string): Promise<boolean | null> {
  const operable = getElectronOperable()
  if (!operable?.checkFileExists) return null

  const exists = await operable.checkFileExists(filePath)
  return Boolean(exists)
}

export async function syncMinimizeToTray(enabled: boolean): Promise<void> {
  const api = getElectronAPI()
  if (!api?.invoke) return

  try {
    await api.invoke('set-minimize-to-tray', enabled)
  } catch (error) {
    console.error('Failed to sync minimize-to-tray setting:', error)
  }
}

export type OpenDialogOptions = {
  properties?: string[]
  filters?: Array<{name: string; extensions: string[]}>
}

export async function showElectronOpenDialog(
  properties: string[] | string | Record<string, boolean> | OpenDialogOptions | null,
): Promise<OpenDialogResult | null> {
  const api = getElectronAPI()
  if (!api?.invoke) return null

  if (properties && typeof properties === 'object' && !Array.isArray(properties) && 'properties' in properties) {
    return api.invoke('showOpenDialog', properties)
  }

  let dialogProperties: string[] = []
  if (Array.isArray(properties)) {
    dialogProperties = properties
  } else if (typeof properties === 'string') {
    dialogProperties = [properties]
  } else if (typeof properties === 'object' && properties !== null) {
    dialogProperties = Object.keys(properties).filter((key) => (properties as Record<string, boolean>)[key] === true)
  }

  return api.invoke('showOpenDialog', dialogProperties)
}

export type {
  CheckFileExistsPayload,
  ElectronBridgeAPI,
  ElectronOperableAPI,
  OpenDialogResult,
  OpenPathPayload,
  OpenPathResult,
  PlayVideoPayload,
  SaveFileDialogOptions,
  SaveFileDialogResult,
  UpdaterState,
} from '@shared/electron/ipc'
