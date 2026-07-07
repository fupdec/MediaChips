import {ref} from 'vue'
import {subscribeElectronIpc} from '@/utils/electronIpc'

const isWindowMaximized = ref(false)
let initialized = false

function ensureInitialized(): void {
  if (initialized) return
  initialized = true
  subscribeElectronIpc('maximize', () => {
    isWindowMaximized.value = true
  })
  subscribeElectronIpc('unmaximize', () => {
    isWindowMaximized.value = false
  })
}

export function useWindowMaximizedState() {
  ensureInitialized()
  return {isWindowMaximized}
}
