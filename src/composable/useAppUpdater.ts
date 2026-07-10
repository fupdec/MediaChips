import type { UpdaterState } from '@shared/electron/ipc'
import { ref, readonly } from 'vue'
import { useAppStore } from '@/stores/app'
import { isUpdateVersionSkipped, skipUpdateVersion } from '@/services/updatePreferences'

type UpdaterStatus = UpdaterState & {
  manualCheck?: boolean
}

const status = ref<UpdaterStatus>({ state: 'idle' })
const lastCheckManual = ref(false)
const isSupported = ref(false)

let initialized = false
let startupCheckScheduled = false

function hasUpdaterApi(): boolean {
  return Boolean(window.electronAPI?.updater)
}

function shouldSuppressAvailableUpdate(payload: UpdaterStatus): boolean {
  if (!payload.nextVersion) {
    return false
  }

  return isUpdateVersionSkipped(payload.nextVersion)
}

function applyUpdaterStatus(payload: UpdaterStatus): void {
  if (
    !payload.manualCheck
    && ['available', 'available-manual'].includes(payload.state)
    && shouldSuppressAvailableUpdate(payload)
  ) {
    status.value = {
      ...payload,
      state: 'idle',
      manualCheck: payload.manualCheck,
    }
    return
  }

  status.value = payload
}

export function useAppUpdater() {
  const appStore = useAppStore()

  async function ensureInitialized() {
    if (!appStore.isElectron || !hasUpdaterApi() || initialized) return
    initialized = true

    const updater = window.electronAPI!.updater!
    isSupported.value = await updater.isSupported()

    updater.onStatus((payload: UpdaterStatus) => {
      applyUpdaterStatus({
        ...payload,
        manualCheck: lastCheckManual.value,
      })
    })

    const initial = await updater.getState()
    if (initial) {
      applyUpdaterStatus({
        ...initial,
        manualCheck: lastCheckManual.value,
      })
    }
  }

  async function init({ checkAtStartup = false }: { checkAtStartup?: boolean } = {}) {
    await ensureInitialized()

    if (checkAtStartup && isSupported.value && !startupCheckScheduled) {
      startupCheckScheduled = true
      setTimeout(() => {
        check({ manual: false })
      }, 8000)
    }
  }

  async function check({ manual = false }: { manual?: boolean } = {}) {
    await ensureInitialized()
    lastCheckManual.value = manual

    if (!hasUpdaterApi()) {
      return null
    }

    if (!isSupported.value) {
      applyUpdaterStatus({
        ...status.value,
        state: 'disabled',
        manualCheck: manual,
      })
      return status.value
    }

    const result = await window.electronAPI!.updater!.check()
    applyUpdaterStatus({
      ...result,
      manualCheck: manual,
    })
    return status.value
  }

  async function download() {
    await ensureInitialized()
    if (!hasUpdaterApi()) return null
    const result = await window.electronAPI!.updater!.download()
    applyUpdaterStatus(result)
    return result
  }

  async function install() {
    await ensureInitialized()
    if (!hasUpdaterApi()) return null
    return window.electronAPI!.updater!.install()
  }

  function dismiss() {
    if (['available', 'available-manual', 'downloaded', 'downloaded-manual', 'error', 'up-to-date'].includes(status.value.state)) {
      status.value = { ...status.value, state: 'idle' }
    }
  }

  async function skipOfferedVersion() {
    const version = status.value.nextVersion
    if (!version) {
      return
    }

    await skipUpdateVersion(version)
    dismiss()
  }

  function destroy() {
    // Singleton composable: keep IPC listener alive for menu/About checks.
  }

  return {
    status: readonly(status),
    lastCheckManual: readonly(lastCheckManual),
    isSupported: readonly(isSupported),
    ensureInitialized,
    init,
    check,
    download,
    install,
    dismiss,
    skipOfferedVersion,
    destroy,
  }
}
