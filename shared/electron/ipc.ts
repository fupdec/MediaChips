import type { GetItemsFromDbEvent } from '../api/responses'

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
  'showOpenDialog',
  'getDateForDB',
  'get-config',
  'get-machine-id',
  'dialog:openFile',
  'dialog:saveFile',
  'deleteLocalFile',
  'createThumb',
  'setNotification',
  'maximize',
  'unmaximize',
  'minimize',
  'relaunch',
  'closePlayer',
  'destroyPlayer',
  'toggleDevTools',
  'toggleMainFullscreen',
  'findInPage',
  'stopFindInPage',
  'updater:check',
  'updater:download',
  'updater:install',
  'updater:get-state',
  'updater:is-supported',
  'setZoomFactor',
  'getZoomFactor',
  'checkFileExists',
  'set-minimize-to-tray',
  'focusMainWindow',
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

export interface FindInPagePayload {
  query: string
  forward?: boolean
  findNext?: boolean
}

export interface FindInPageResult {
  activeMatchOrdinal?: number
  matches?: number
  selectionArea?: unknown
  finalUpdate?: boolean
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
  showOpenDialog: string[] | string | Record<string, boolean | unknown>
  getDateForDB: void
  'get-config': void
  'get-machine-id': void
  'dialog:openFile': unknown
  'dialog:saveFile': SaveFileDialogOptions
  deleteLocalFile: string
  createThumb: CreateThumbIpcPayload
  setNotification: unknown
  maximize: unknown
  unmaximize: unknown
  minimize: unknown
  relaunch: void
  closePlayer: void
  destroyPlayer: void
  toggleDevTools: void
  toggleMainFullscreen: void
  findInPage: FindInPagePayload
  stopFindInPage: void
  'updater:check': void
  'updater:download': void
  'updater:install': void
  'updater:get-state': void
  'updater:is-supported': void
  setZoomFactor: number
  getZoomFactor: void
  checkFileExists: CheckFileExistsPayload
  'set-minimize-to-tray': boolean
  focusMainWindow: void
}

export interface IpcInvokeResults {
  openPath: OpenPathResult
  showOpenDialog: OpenDialogResult
  getDateForDB: string
  'get-config': Record<string, unknown>
  'get-machine-id': string
  'dialog:openFile': unknown
  'dialog:saveFile': SaveFileDialogResult
  deleteLocalFile: unknown
  createThumb: unknown
  setNotification: unknown
  maximize: unknown
  unmaximize: unknown
  minimize: unknown
  relaunch: void
  closePlayer: void
  destroyPlayer: void
  toggleDevTools: void
  toggleMainFullscreen: void
  findInPage: FindInPageResult
  stopFindInPage: void
  'updater:check': UpdaterState
  'updater:download': UpdaterState
  'updater:install': void
  'updater:get-state': UpdaterState
  'updater:is-supported': boolean
  setZoomFactor: number
  getZoomFactor: number
  checkFileExists: boolean
  'set-minimize-to-tray': boolean
  focusMainWindow: boolean
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
  closeApp: void
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
}

export interface ElectronLegacyOsAPI {
  type: () => string
  platform: () => string
  homedir: () => string
}

export type ElectronLegacyOs = string | ElectronLegacyOsAPI
