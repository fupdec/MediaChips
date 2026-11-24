import type {
  ElectronAppInfo,
  ElectronBridgeAPI,
  ElectronLegacyOs,
  ElectronOperableAPI,
  ElectronOsAPI,
  ElectronReadableAPI,
} from './ipc'

export type MediaDragStartPayload =
  | string
  | {
      path: string
      iconDataUrl?: string
      thumbPath?: string
      title?: string
      count?: number
    }
  | {
      paths: string[]
      iconDataUrl?: string
      thumbPath?: string
      title?: string
      count?: number
    }

export interface MediaDragAPI {
  onHoverChange(listener: (active: boolean) => void): () => void
  resetHover(): void
  /** Suppress drop-in overlay while a card drag-out is starting. */
  beginOutboundDrag(): void
  /** Clear outbound suppression (e.g. drag-out aborted). */
  endOutboundDrag(): void
  /** True while native card drag-out should suppress drop-in UI. */
  isOutboundDrag(): boolean
  /** Sync-read a local image file as a data URL (for drag ghosts). */
  readLocalDataUrl(filePath: string): string | null
  /** Native OS drag-out; call from dragstart. */
  startDrag(payload: MediaDragStartPayload): void
}

/** Native mpv playback bridge (macOS, opt-in). See electron/mpvNative.ts. */
export interface MpvBridgeAPI {
  availability(): Promise<{available: boolean; supported?: boolean; reason?: string}>
  init(options?: {above?: boolean}): Promise<{ok: boolean; error?: string}>
  destroy(): Promise<void>
  tracks(): Promise<Array<{id: number; type: 'video' | 'audio' | 'sub'; lang: string; title: string; codec: string; selected: boolean; default: boolean; forced: boolean; external: boolean}>>
  command(command: string[]): Promise<number>
  setProperty(name: string, value: string | number | boolean): Promise<number>
  setRect(rect: Record<string, number>): void
  onEvent(callback: (event: Record<string, unknown>) => void): () => void
}

declare global {
  interface Window {
    mpvAPI?: MpvBridgeAPI
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
