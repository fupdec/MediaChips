import type { GetItemsFromDbEvent } from '../api/responses'
import type { AppMenuCheckedState } from './appMenuState'

export const IPC_SEND_CHANNELS = [
  'open-player',
  'getItemsFromDb',
  'updateVideoFrames',
  'removeEntitiesFromState',
  'stop-playing-video',
  'setFullScreen',
  'player-ready',
  'main-app-ready',
  'setNotification',
  'maximize',
  'unmaximize',
  'enter-full-screen',
  'leave-full-screen',
  'blur',
  'focus',
  'config',
  'closeApp',
] as const

export const IPC_INVOKE_CHANNELS = [
  'openPath',
  'openExternal',
  'showOpenDialog',
  'getDateForDB',
  'get-config',
  'get-machine-id',
  'dialog:openFile',
  'dialog:saveFile',
  'deleteLocalFile',
  'createThumb',
  'setNotification',
  'showOsNotification',
  'setDockBadge',
  'setProgressBar',
  'maximize',
  'unmaximize',
  'minimize',
  'relaunch',
  'restart-backend',
  'closePlayer',
  'destroyPlayer',
  'toggleDevTools',
  'toggleMainFullscreen',
  'isMainFullscreen',
  'updater:check',
  'updater:download',
  'updater:install',
  'updater:get-state',
  'updater:is-supported',
  'setZoomFactor',
  'getZoomFactor',
  'checkFileExists',
  'set-minimize-to-tray',
  'set-shell-locale',
  'set-app-menu-state',
  'focusMainWindow',
  'isMainWindowFocused',
] as const

export const IPC_ON_CHANNELS = [
  'play-video',
  'getItemsFromDb',
  'updateVideoFrames',
  'removeEntitiesFromState',
  'stop-playing-video',
  'config',
  'maximize',
  'unmaximize',
  'enter-full-screen',
  'leave-full-screen',
  'blur',
  'focus',
  'aboutApp',
  'showDocumentation',
  'showFeedback',
  'menuAction',
  'lockApp',
  'navigationBack',
  'navigationForward',
  'updater:status',
  'zoom-changed',
] as const

export type IpcSendChannel = typeof IPC_SEND_CHANNELS[number]
export type IpcInvokeChannel = typeof IPC_INVOKE_CHANNELS[number]
export type IpcOnChannel = typeof IPC_ON_CHANNELS[number]

export interface OpenDialogResult {
  canceled?: boolean
  error?: boolean
  message?: string
  filePaths?: string[]
}

export interface SaveFileDialogOptions {
  defaultPath?: string
  content?: string
  /** When false, only pick a path — do not write a file. Default true. */
  write?: boolean
  filters?: Array<{ name: string; extensions: string[] }>
}

export interface SaveFileDialogResult {
  canceled: boolean
  filePath?: string
}

export interface OpenPathPayload {
  path: string
  wait?: boolean
  isDir?: boolean
}

export interface OpenPathResult {
  error?: string
  success?: boolean
}

export interface OpenExternalResult {
  error?: string
  success?: boolean
}

export interface OsNotificationPayload {
  title: string
  body?: string
  silent?: boolean
  /** Absolute file path to reveal in Finder/Explorer when the toast is clicked. */
  revealPath?: string
}

export interface OsNotificationResult {
  error?: string
  success?: boolean
  supported?: boolean
}

export interface SetDockBadgePayload {
  count: number
}

export interface SetProgressBarPayload {
  /** 0–1 for progress, null/-1 to clear */
  value: number | null
}

export type CheckFileExistsPayload = string | {
  path: string
  skipDir?: boolean
}

export interface CreateThumbIpcPayload {
  time: number
  videoPath: string
  imgPath: string
  width: number
}

export interface PlayVideoPayload {
  video?: Record<string, unknown>
  videos?: Array<Record<string, unknown>>
  time?: number
  store?: unknown
}

export interface OpenPlayerPayload {
  store?: unknown
  video?: Record<string, unknown>
  videos?: Array<Record<string, unknown>>
  time?: number
}

export interface RemoveEntitiesPayload {
  ids?: Array<number | string>
  type?: string
}

export interface UpdaterState {
  state: string
  manualInstall?: boolean
  releasesUrl?: string
  reason?: string
  nextVersion?: string
  currentVersion?: string
  releaseNotes?: string
  downloadUrl?: string
  message?: string
  percent?: number
  transferred?: number
  total?: number
}

export interface ElectronUpdaterAPI {
  isSupported: () => Promise<boolean>
  onStatus: (listener: (payload: UpdaterState) => void) => () => void
  getState: () => Promise<UpdaterState>
  check: () => Promise<UpdaterState>
  download: () => Promise<UpdaterState>
  install: () => Promise<void>
}

export interface IpcInvokePayloads {
  openPath: OpenPathPayload | string
  openExternal: string
  showOpenDialog: string[] | string | Record<string, boolean | unknown>
  getDateForDB: void
  'get-config': void
  'get-machine-id': void
  'dialog:openFile': unknown
  'dialog:saveFile': SaveFileDialogOptions
  deleteLocalFile: string
  createThumb: CreateThumbIpcPayload
  setNotification: unknown
  showOsNotification: OsNotificationPayload
  setDockBadge: SetDockBadgePayload | number
  setProgressBar: SetProgressBarPayload | number | null
  maximize: unknown
  unmaximize: unknown
  minimize: unknown
  relaunch: void
  'restart-backend': void
  closePlayer: void
  destroyPlayer: void
  toggleDevTools: void
  toggleMainFullscreen: void
  isMainFullscreen: void
  'updater:check': void
  'updater:download': void
  'updater:install': void
  'updater:get-state': void
  'updater:is-supported': void
  setZoomFactor: number
  getZoomFactor: void
  checkFileExists: CheckFileExistsPayload
  'set-minimize-to-tray': boolean
  'set-shell-locale': string
  'set-app-menu-state': AppMenuCheckedState
  focusMainWindow: void
  isMainWindowFocused: void
}

export interface IpcInvokeResults {
  openPath: OpenPathResult
  openExternal: OpenExternalResult
  showOpenDialog: OpenDialogResult
  getDateForDB: string
  'get-config': Record<string, unknown>
  'get-machine-id': string
  'dialog:openFile': unknown
  'dialog:saveFile': SaveFileDialogResult
  deleteLocalFile: unknown
  createThumb: unknown
  setNotification: unknown
  showOsNotification: OsNotificationResult
  setDockBadge: boolean
  setProgressBar: boolean
  maximize: unknown
  unmaximize: unknown
  minimize: unknown
  relaunch: void
  'restart-backend': {ok: boolean; error?: string}
  closePlayer: void
  destroyPlayer: void
  toggleDevTools: void
  toggleMainFullscreen: boolean
  isMainFullscreen: boolean
  'updater:check': UpdaterState
  'updater:download': UpdaterState
  'updater:install': void
  'updater:get-state': UpdaterState
  'updater:is-supported': boolean
  setZoomFactor: number
  getZoomFactor: number
  checkFileExists: boolean
  'set-minimize-to-tray': boolean
  'set-shell-locale': string
  'set-app-menu-state': boolean
  focusMainWindow: boolean
  isMainWindowFocused: boolean
}

export interface IpcSendPayloads {
  'open-player': OpenPlayerPayload
  getItemsFromDb: GetItemsFromDbEvent
  updateVideoFrames: number | string
  removeEntitiesFromState: RemoveEntitiesPayload
  'stop-playing-video': void
  setFullScreen: boolean
  'player-ready': void
  'main-app-ready': void
  setNotification: unknown
  maximize: unknown
  unmaximize: unknown
  'enter-full-screen': void
  'leave-full-screen': void
  blur: void
  focus: void
  config: unknown
  closeApp: {force?: boolean} | void
}

export type IpcOnPayload<C extends IpcOnChannel> =
  C extends 'play-video' ? PlayVideoPayload :
  C extends 'getItemsFromDb' ? GetItemsFromDbEvent :
  C extends 'updateVideoFrames' ? number | string :
  C extends 'removeEntitiesFromState' ? RemoveEntitiesPayload :
  C extends 'zoom-changed' ? number :
  C extends 'updater:status' ? UpdaterState :
  C extends 'menuAction' ? string :
  unknown

export type IpcListener = (...args: unknown[]) => void

export interface ElectronBridgeAPI {
  send<C extends IpcSendChannel>(channel: C, data?: IpcSendPayloads[C]): void
  invoke<C extends IpcInvokeChannel>(
    channel: C,
    data?: IpcInvokePayloads[C],
  ): Promise<IpcInvokeResults[C]>
  on<C extends IpcOnChannel>(
    channel: C,
    callback: (...args: unknown[]) => void,
  ): () => void
  once<C extends IpcOnChannel>(
    channel: C,
    callback: (...args: unknown[]) => void,
  ): void
  removeListener(channel: IpcOnChannel, callback: IpcListener): void
  getPathForFile(file: File): string
  /** Paths from the last OS file drop, captured in preload before contextBridge cloning. */
  takeDroppedFilePaths(): string[]
  updater: ElectronUpdaterAPI
}

export interface ElectronOperableAPI {
  openPath(path: OpenPathPayload | string, wait?: boolean): Promise<OpenPathResult>
  checkFileExists(path: CheckFileExistsPayload, skipDir?: boolean): Promise<boolean>
  deleteLocalFile(path: string): Promise<unknown>
  createThumb(time: number, videoPath: string, imgPath: string, width: number): Promise<unknown>
  setNotification(notification: unknown): Promise<unknown>
  showOpenDialog(properties: string[] | string | Record<string, unknown> | null | undefined): Promise<OpenDialogResult>
  getDateForDB(): Promise<string>
}

export interface ElectronReadableAPI {
  getDateForDB(): Promise<string>
}

export interface ElectronOsAPI {
  platform: string
  homedir: string
  tmpdir: string
  arch: string
  type: string
  version: string
}

export interface ElectronAppInfo {
  version: string
  node: string
  chrome: string
  /** Dev/preview: force Windows custom chrome (SystemBar) on non-Windows. */
  forceWinUi?: boolean
}

export interface ElectronLegacyOsAPI {
  type: () => string
  platform: () => string
  homedir: () => string
}

export type ElectronLegacyOs = string | ElectronLegacyOsAPI
