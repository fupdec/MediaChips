export type IpcListener = (event: import('electron').IpcRendererEvent, ...args: unknown[]) => void

export type IpcCallback = (...args: unknown[]) => void

export type ListenerSubscription = {
  channel: string
  subscription: IpcListener | ((event: import('electron').IpcRendererEvent | null, data: unknown) => void)
  isPlayVideo?: boolean
  isMenuAction?: boolean
}
