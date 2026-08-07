import {computed, onMounted, onUnmounted, ref, shallowRef} from 'vue'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{outcome: 'accepted' | 'dismissed'}>
}

const deferredPrompt = shallowRef<BeforeInstallPromptEvent | null>(null)
const installed = ref(false)
let listenersBound = false

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false
  const media = window.matchMedia?.('(display-mode: standalone)')
  if (media?.matches) return true
  // iOS Safari
  return Boolean((navigator as Navigator & {standalone?: boolean}).standalone)
}

function onBeforeInstallPrompt(event: Event) {
  event.preventDefault()
  deferredPrompt.value = event as BeforeInstallPromptEvent
}

function onAppInstalled() {
  installed.value = true
  deferredPrompt.value = null
}

function ensureInstallListeners() {
  if (typeof window === 'undefined' || listenersBound) return
  if (window.electronAPI) return
  listenersBound = true
  window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  window.addEventListener('appinstalled', onAppInstalled)
  installed.value = isStandaloneDisplay()
}

export function usePwaInstall() {
  ensureInstallListeners()

  onMounted(() => {
    ensureInstallListeners()
    installed.value = isStandaloneDisplay()
  })

  onUnmounted(() => {
    // Keep global listeners — prompt can be used from Home and Settings.
  })

  const canInstall = computed(() => Boolean(deferredPrompt.value) && !installed.value)
  const isInstalled = computed(() => installed.value)

  async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    const event = deferredPrompt.value
    if (!event) return 'unavailable'
    await event.prompt()
    const choice = await event.userChoice
    deferredPrompt.value = null
    if (choice.outcome === 'accepted') installed.value = true
    return choice.outcome
  }

  return {
    canInstall,
    isInstalled,
    promptInstall,
  }
}
