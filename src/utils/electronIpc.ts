import type { IpcOnChannel } from '@shared/electron/ipc'

export function subscribeElectronIpc<C extends IpcOnChannel>(
  channel: C,
  callback: (...args: unknown[]) => void,
): () => void {
  return window.electronAPI?.on?.(channel, callback) ?? (() => {})
}
