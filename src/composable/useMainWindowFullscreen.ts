import {getCurrentScope, onScopeDispose, readonly, ref} from 'vue'
import {subscribeElectronIpc} from '@/utils/electronIpc'

// Один общий источник состояния fullscreen главного окна.
// Раньше каждая карточка в сетке вешала свои слушатели на ipcRenderer
// (enter/leave-full-screen) и упиралась в лимит MaxListeners.
const isFullscreen = ref(false)

let consumers = 0
let unsubscribeEnter: (() => void) | undefined
let unsubscribeLeave: (() => void) | undefined

async function syncFullscreen() {
  if (!window.electronAPI?.invoke) return
  try {
    isFullscreen.value = (await window.electronAPI.invoke('isMainFullscreen')) === true
  } catch {
    // keep last known state
  }
}

function acquire() {
  if (consumers++ > 0) return
  void syncFullscreen()
  unsubscribeEnter = subscribeElectronIpc('enter-full-screen', () => { isFullscreen.value = true })
  unsubscribeLeave = subscribeElectronIpc('leave-full-screen', () => { isFullscreen.value = false })
}

function release() {
  if (consumers === 0 || --consumers > 0) return
  unsubscribeEnter?.()
  unsubscribeLeave?.()
  unsubscribeEnter = undefined
  unsubscribeLeave = undefined
}

/** Реактивное состояние fullscreen главного окна; IPC-подписка общая для всех потребителей. */
export function useMainWindowFullscreen() {
  acquire()
  if (getCurrentScope()) onScopeDispose(release)
  else release()
  return {isFullscreen: readonly(isFullscreen)}
}
