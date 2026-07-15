import path from 'path-browserify'
import {useRouter} from 'vue-router'
import {useTheme} from 'vuetify'
import {useAppStore} from '@/stores/app'
import {useSettingsStore} from '@/stores/settings'
import {useDialogsStore} from '@/stores/dialogs'
import {useEventBus} from '@/utils/eventBus'
import {useAppZoom} from '@/composable/useAppZoom'
import {useAppUpdater} from '@/composable/useAppUpdater'
import {setOption} from '@/services/settingsService'
import {openPath} from '@/services/shellService'
import {useWindowMaximizedState} from '@/utils/windowMaximizedState'
import {openOnboarding, saveOnboardingStep} from '@/composable/useOnboarding'
import type {SystemMenuAction} from '@/types/systemMenu'

const WEBSITE_URL = 'https://mediachips.app/'

function runEditCommand(command: string) {
  document.execCommand(command, false)
}

export function useSystemMenuActions(options: { onLock?: () => void } = {}) {
  const router = useRouter()
  const theme = useTheme()
  const appStore = useAppStore()
  const settingsStore = useSettingsStore()
  const dialogsStore = useDialogsStore()
  const eventBus = useEventBus()
  const appZoom = useAppZoom()
  const {ensureInitialized, check, isSupported} = useAppUpdater()
  const {isWindowMaximized} = useWindowMaximizedState()

  async function toggleTheme() {
    if (settingsStore.system_dark_mode === '1') {
      await setOption('0', 'system_dark_mode')
    }

    const nextValue = settingsStore.darkMode === '1' ? '0' : '1'
    await setOption(nextValue, 'darkMode')
    theme.global.name.value = nextValue === '1' ? 'dark' : 'light'
  }

  async function runSystemMenuAction(action: SystemMenuAction) {
    switch (action) {
      case 'addMedia':
        eventBus.emit('addMedia')
        break
      case 'importBackup':
        await router.push({path: '/settings', query: {tab: 'database', section: 'backups'}})
        break
      case 'exportBackup':
        await router.push({path: '/settings', query: {tab: 'database', section: 'backups'}})
        break
      case 'openDataFolder':
        if (appStore.dbPath) {
          await openPath(path.dirname(appStore.dbPath), false)
        }
        break
      case 'undo':
        runEditCommand('undo')
        break
      case 'redo':
        runEditCommand('redo')
        break
      case 'cut':
        runEditCommand('cut')
        break
      case 'copy':
        runEditCommand('copy')
        break
      case 'paste':
        runEditCommand('paste')
        break
      case 'selectAll':
        runEditCommand('selectAll')
        break
      case 'find':
        dialogsStore.findInPage.show = true
        break
      case 'globalSearch':
        eventBus.emit('showGlobalSearch')
        break
      case 'toggleTheme':
        await toggleTheme()
        break
      case 'zoomIn':
        await appZoom.zoomIn()
        break
      case 'zoomOut':
        await appZoom.zoomOut()
        break
      case 'resetZoom':
        await appZoom.resetZoom()
        break
      case 'toggleFullscreen':
        if (window.electronAPI?.invoke) {
          await window.electronAPI.invoke('toggleMainFullscreen')
        }
        break
      case 'settings':
        await router.push('/settings')
        break
      case 'lock':
        options.onLock?.()
        break
      case 'restart':
        if (window.electronAPI?.invoke) {
          await window.electronAPI.invoke('relaunch')
        }
        break
      case 'exit':
        window.electronAPI?.send?.('closeApp')
        break
      case 'minimizeWindow':
        await window.electronAPI?.invoke?.('minimize')
        break
      case 'toggleMaximize':
        if (window.electronAPI?.invoke) {
          await window.electronAPI.invoke(isWindowMaximized.value ? 'unmaximize' : 'maximize')
        }
        break
      case 'closeWindow':
        window.electronAPI?.send?.('closeApp')
        break
      case 'documentation':
        eventBus.emit('showDocumentation', 'app')
        break
      case 'gettingStarted':
        await saveOnboardingStep(0)
        openOnboarding()
        break
      case 'sendFeedback':
        dialogsStore.openFeedback()
        break
      case 'keyboardShortcuts':
        eventBus.emit('showDocumentation', 'player.hotkeys')
        break
      case 'checkUpdates':
        await ensureInitialized()
        if (!isSupported.value) {
          window.open('https://github.com/fupdec/MediaChips/releases/latest', '_blank', 'noopener,noreferrer')
          break
        }
        await check({manual: true})
        break
      case 'versionHistory':
        dialogsStore.versions = true
        break
      case 'website':
        window.open(WEBSITE_URL, '_blank', 'noopener,noreferrer')
        break
      case 'toggleDevTools':
        await window.electronAPI?.invoke?.('toggleDevTools')
        break
      case 'about':
        dialogsStore.showAbout()
        break
    }
  }

  function isActionDisabled(action: SystemMenuAction) {
    if (action === 'lock') {
      return settingsStore.passwordProtection !== '1'
    }
    return false
  }

  return {
    runSystemMenuAction,
    isActionDisabled,
  }
}
