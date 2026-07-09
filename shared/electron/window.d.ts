import type {
  ElectronAppInfo,
  ElectronBridgeAPI,
  ElectronLegacyOs,
  ElectronOperableAPI,
  ElectronOsAPI,
  ElectronReadableAPI,
} from './ipc'

export interface MediaDragAPI {
  onHoverChange(listener: (active: boolean) => void): () => void
}

declare global {
  interface Window {
    electronAPI?: ElectronBridgeAPI
    mediaDragAPI?: MediaDragAPI
    $electronOperable?: ElectronOperableAPI
    operableAPI?: Pick<
      ElectronOperableAPI,
      'openPath' | 'checkFileExists' | 'deleteLocalFile' | 'createThumb' | 'setNotification'
    >
    readableAPI?: ElectronReadableAPI
    osAPI?: ElectronOsAPI
    appInfo?: ElectronAppInfo
    os?: ElectronLegacyOs
    showNotification?: (text: string, type: string) => void
  }
}

export {}
