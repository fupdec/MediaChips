import {ref, onMounted, onBeforeUnmount, nextTick} from 'vue'
import type { Ref } from 'vue'
import type { Handler } from 'mitt'
import {useRoute, useRouter} from 'vue-router'
import {useI18n} from 'vue-i18n'
import {loadLocale} from '@/i18n/loadLocale'
import {typedApi} from '@/services/typedApi'
import {getAuthToken, clearAuthToken} from '@/services/authSession'
import {updateConfig} from '@/services/configService'
import {getWatchedFolders} from '@/services/watcherService'
import type { WatchedFolderEntry } from '@/services/watcherUtils'
import {useAppStore} from '@/stores/app'
import {useSettingsStore} from '@/stores/settings'
import {useItemsStore, THUMB_BROADCAST_CHANNEL} from '@/stores/items'
import {useWatcherStore} from '@/stores/watcher'
import {useRegistrationStore} from '@/stores/registration'
import {useDialogsStore} from '@/stores/dialogs'
import {useEventBus} from '@/utils/eventBus'
import {useAppUpdater} from '@/composable/useAppUpdater'
import {openOnboardingIfNeeded} from '@/composable/useOnboarding'
import {openLowDbMigrationIfNeeded} from '@/composable/useLowDbMigration'
import {useOperationsStore} from '@/stores/operations'
import {useAppTheme} from '@/composable/useAppTheme'
import {useAppZoom} from '@/composable/useAppZoom'
import {useSystemMenuActions} from '@/composable/useSystemMenuActions'
import type {SystemMenuAction} from '@/types/systemMenu'
import type { GetItemsFromDbEvent, RemoveEntitiesEvent } from '@/types/itemsPage'
import {
  setAppWindowFocused,
  syncAppWindowFocusedFromDocument,
} from '@/utils/windowFocus'
import {debounce} from '@/utils/debounce'
import {subscribeElectronIpc} from '@/utils/electronIpc'

interface UseAppBootstrapOptions {
  isPlayerWindow: Ref<boolean>
  appZoom: ReturnType<typeof useAppZoom> | null
}

type AppListField = 'mediaTypes' | 'tags' | 'meta' | 'tabs' | 'playlists'

export function useAppBootstrap({isPlayerWindow, appZoom}: UseAppBootstrapOptions) {
  const route = useRoute()
  const router = useRouter()
  const {locale} = useI18n()
  const store = useAppStore()
  const settingsStore = useSettingsStore()
  const itemsStore = useItemsStore()
  const watcherStore = useWatcherStore()
  const registrationStore = useRegistrationStore()
  const dialogsStore = useDialogsStore()
  const operationsStore = useOperationsStore()
  const eventBus = useEventBus()
  const {init: initAppUpdater} = useAppUpdater()
  const {runSystemMenuAction} = useSystemMenuActions({
    onLock: lockApp,
  })
  const {applyTheme} = useAppTheme()

  let updateWatcher = (_folders: WatchedFolderEntry[]): void => {}
  let handleAddMedia = async (_action?: () => void): Promise<void> => {}
  let cleanupMediaAdding: (() => void) | null = null

  async function ensureDeferredServices(): Promise<void> {
    const [{useWatcher}, {useMediaAdding}] = await Promise.all([
      import('@/composable/Watcher'),
      import('@/composable/AddingMedia'),
    ])
    updateWatcher = useWatcher(store.localhost).updateWatcher
    const mediaAdding = useMediaAdding()
    handleAddMedia = mediaAdding.handleAddMedia
    cleanupMediaAdding = mediaAdding.cleanupEventListeners
  }

  const isAppReady = ref(false)
  const isShellReady = ref(false)
  let shellRevealSent = false
  const upd = ref(0)

  function cleanupStalePlayerRoute(): void {
    if (route.query.player && !store.isElectron) {
      const query = {...route.query}
      delete query.player
      void router.replace({query})
    }
  }

  async function initSettings(): Promise<void> {
    try {
      const res = await typedApi.getSettings()
      const sets = res.data.reduce<Record<string, string>>((a, i) => {
        a[i.option] = i.value
        return a
      }, {})

      settingsStore.updateMultiple(sets)
      await registrationStore.migrateRegistrationFromDbIfNeeded()
      cleanupStalePlayerRoute()
      store.isServerError = false
    } catch {
      store.isServerError = true
    }
  }

  async function loadList(field: AppListField): Promise<void> {
    try {
      switch (field) {
        case 'mediaTypes': {
          const res = await typedApi.getMediaTypes()
          store.mediaTypes = res.data
          break
        }
        case 'tags': {
          const res = await typedApi.getTags()
          store.tags = res.data.map((tag) => ({
            ...tag,
            metaId: tag.metaId ?? undefined,
            name: tag.name ?? undefined,
            synonyms: tag.synonyms ?? undefined,
            color: tag.color ?? undefined,
            bookmark: tag.bookmark ?? undefined,
          }))
          break
        }
        case 'meta': {
          const res = await typedApi.getMeta()
          store.meta = res.data
          break
        }
        case 'tabs': {
          const res = await typedApi.getTabs()
          store.tabs = res.data
          break
        }
        case 'playlists': {
          const res = await typedApi.getPlaylists()
          store.playlists = res.data
          break
        }
      }
    } catch {
    }
  }

  function handleUpdateWatcher(): void {
    updateWatcher(watcherStore.folders)
  }

  async function applyLocale(): Promise<void> {
    await loadLocale(settingsStore.locale)
    locale.value = settingsStore.locale
    document.documentElement.lang = settingsStore.locale
  }

  async function tryRestoreSession(): Promise<boolean> {
    if (settingsStore.passwordProtection !== '1') {
      store.isLocked = false
      return true
    }

    if (!getAuthToken()) {
      store.isLocked = true
      return false
    }

    try {
      const res = await typedApi.getAuthStatus()
      if (res.data.authenticated) {
        store.isLocked = false
        return true
      }
      clearAuthToken()
    } catch {
      clearAuthToken()
    }

    store.isLocked = true
    return false
  }

  async function loadMainAppData(): Promise<void> {
    await initSettings()
    await getMachineId()
    await getFolders()

    await Promise.all([
      loadList('mediaTypes'),
      loadList('tags'),
      loadList('meta'),
      loadList('tabs'),
      loadList('playlists'),
    ])
  }

  async function getFolders(): Promise<void> {
    watcherStore.folders = await getWatchedFolders()
  }

  async function getMachineId(): Promise<void> {
    try {
      await registrationStore.ensureMachineId()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn('Failed to fetch machine id:', message)
    }
  }

  function runAutoRegistration(): void {
    registrationStore.tryAutoRegisterOnStartup().catch((error) => {
      console.error('Auto registration failed:', error)
    })
  }

  const saveWindowSize = debounce(() => {
    const app_window = isPlayerWindow.value ? 'player' : 'win'
    const data = {
      [app_window]: {
        height: window.outerHeight,
        width: window.outerWidth,
      },
    }
    void updateConfig(data)
  }, 500)

  const handleAboutApp = (): void => {
    dialogsStore.showAbout()
  }

  const handleShowDocumentation = (): void => {
    eventBus.emit('showDocumentation', 'app')
  }

  const handleShowFeedback = (): void => {
    dialogsStore.openFeedback()
  }

  const handleMenuAction = (action: unknown): void => {
    void runSystemMenuAction(String(action) as SystemMenuAction)
  }

  const handleLockApp = (): void => {
    lockApp()
  }

  const handleThumbBroadcast = (event: MessageEvent<{ id?: number }>): void => {
    const id = event?.data?.id
    if (id != null) {
      itemsStore.refreshThumb(id, {broadcast: false})
    }
  }

  const handleUpdateVideoFramesImpl = (id: number): void => {
    itemsStore.refreshThumb(id, {broadcast: false})
  }

  const handleUpdateVideoFrames: Handler = (event) => {
    handleUpdateVideoFramesImpl(Number(event))
  }

  let unsubscribeAboutApp: (() => void) | void | undefined
  let unsubscribeShowDocumentation: (() => void) | void | undefined
  let unsubscribeShowFeedback: (() => void) | void | undefined
  let unsubscribeMenuAction: (() => void) | void | undefined
  let unsubscribeLockApp: (() => void) | void | undefined
  let unsubscribeZoomChanged: (() => void) | void | undefined
  let unsubscribeWindowBlur: (() => void) | void | undefined
  let unsubscribeWindowFocus: (() => void) | void | undefined
  let unsubscribeGetItemsFromDb: (() => void) | void | undefined
  let unsubscribePlayerUpdateVideoFrames: (() => void) | void | undefined
  let unsubscribeRemoveEntitiesFromState: (() => void) | void | undefined
  let thumbBroadcastChannel: BroadcastChannel | null = null
  let playerElectronListenersRegistered = false

  function lockApp(): void {
    clearAuthToken()
    void typedApi.logout().catch(() => {})
    store.isLocked = true
  }

  function setupWindowFocusTracking(): void {
    syncAppWindowFocusedFromDocument()

    window.addEventListener('focus', syncAppWindowFocusedFromDocument)
    window.addEventListener('blur', syncAppWindowFocusedFromDocument)
    document.addEventListener('visibilitychange', syncAppWindowFocusedFromDocument)

    if (store.isElectron) {
      unsubscribeWindowBlur = subscribeElectronIpc('blur', () => setAppWindowFocused(false))
      unsubscribeWindowFocus = subscribeElectronIpc('focus', () => setAppWindowFocused(true))
    }
  }

  function teardownWindowFocusTracking(): void {
    window.removeEventListener('focus', syncAppWindowFocusedFromDocument)
    window.removeEventListener('blur', syncAppWindowFocusedFromDocument)
    document.removeEventListener('visibilitychange', syncAppWindowFocusedFromDocument)
    unsubscribeWindowBlur?.()
    unsubscribeWindowFocus?.()
    unsubscribeWindowBlur = undefined
    unsubscribeWindowFocus = undefined
  }

  const handleElectronGetItemsFromDb = (_event: unknown, data: unknown): void => {
    eventBus.emit('getItemsFromDb', data as GetItemsFromDbEvent)
  }

  const handleElectronUpdateVideoFrames = (_event: unknown, id: unknown): void => {
    itemsStore.refreshThumb(id as number, {broadcast: false})
  }

  const handleElectronRemoveEntitiesFromState = (_event: unknown, data: unknown): void => {
    eventBus.emit('removeEntitiesFromState', data as RemoveEntitiesEvent)
  }

  function setupPlayerElectronListeners(): void {
    if (!store.isElectron || playerElectronListenersRegistered) return

    playerElectronListenersRegistered = true
    unsubscribeGetItemsFromDb = subscribeElectronIpc('getItemsFromDb', handleElectronGetItemsFromDb)
    unsubscribePlayerUpdateVideoFrames = subscribeElectronIpc(
      'updateVideoFrames',
      handleElectronUpdateVideoFrames,
    )
    unsubscribeRemoveEntitiesFromState = subscribeElectronIpc(
      'removeEntitiesFromState',
      handleElectronRemoveEntitiesFromState,
    )

    window.addEventListener('resize', saveWindowSize)
  }

  function teardownPlayerElectronListeners(): void {
    unsubscribeGetItemsFromDb?.()
    unsubscribePlayerUpdateVideoFrames?.()
    unsubscribeRemoveEntitiesFromState?.()
    unsubscribeGetItemsFromDb = undefined
    unsubscribePlayerUpdateVideoFrames = undefined
    unsubscribeRemoveEntitiesFromState = undefined
    playerElectronListenersRegistered = false
  }

  function notifyMainWindowReady(): void {
    if (!window.electronAPI?.send || shellRevealSent || isPlayerWindow.value) return
    shellRevealSent = true
    window.electronAPI.send('main-app-ready')
  }

  function waitForPaintFrame(timeoutMs = 250): Promise<void> {
    return new Promise((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        resolve()
      }

      requestAnimationFrame(finish)
      window.setTimeout(finish, timeoutMs)
    })
  }

  async function revealAppShell(): Promise<void> {
    if (!isShellReady.value) {
      await nextTick()
      isShellReady.value = true
      await nextTick()
    }

    // Notify Electron before waiting for a paint frame: rAF does not run
    // reliably while the main BrowserWindow is still hidden (show: false).
    notifyMainWindowReady()
    await waitForPaintFrame()
  }

  function notifyPlayerReady(): void {
    if (store.isElectron && window.electronAPI?.send) {
      window.electronAPI.send('player-ready')
    }
  }

  function loadPlayerBackgroundData(): void {
    void loadList('mediaTypes')
    void getMachineId()
  }

  const handleUpdatePage: Handler = () => {
    ++upd.value
  }

  const handleGetMediaTypes: Handler = async () => {
    await loadList('mediaTypes')
  }

  const handleGetTags: Handler = async () => {
    await loadList('tags')
  }

  const handleGetMeta: Handler = async () => {
    await loadList('meta')
  }

  const handleGetTabs: Handler = async () => {
    await loadList('tabs')
  }

  const handleGetPlaylists: Handler = async () => {
    await loadList('playlists')
  }

  const handleAddMediaEvent: Handler = (event) => {
    void handleAddMedia(typeof event === 'function' ? event as () => void : undefined)
  }

  const handleDatabaseChanged: Handler = async () => {
    store.isServerError = false
    store.is_app_ready = false
    isAppReady.value = false
    itemsStore.$reset()
    await registrationStore.reloadRegistrationFromConfig()
    await loadMainAppData()
    if (!store.isServerError) {
      eventBus.emit('updatePage')
      await router.push('/')
      await markAppReady()
    }
  }

  const handleAuthenticated: Handler = () => {
    void loadMainAppData().then(() => markAppReady())
  }

  function bindMainAppEventBus(): void {
    eventBus.on('getMediaTypes', handleGetMediaTypes)
    eventBus.on('getTags', handleGetTags)
    eventBus.on('getMeta', handleGetMeta)
    eventBus.on('getTabs', handleGetTabs)
    eventBus.on('getPlaylists', handleGetPlaylists)
    eventBus.on('updatePage', handleUpdatePage)
    eventBus.on('update:watcher', handleUpdateWatcher)
    eventBus.on('addMedia', handleAddMediaEvent)
    eventBus.on('updateVideoFrames', handleUpdateVideoFrames)
    eventBus.on('app:database-changed', handleDatabaseChanged)
    eventBus.on('app:authenticated', handleAuthenticated)
  }

  function unbindMainAppEventBus(): void {
    eventBus.off('getMediaTypes', handleGetMediaTypes)
    eventBus.off('getTags', handleGetTags)
    eventBus.off('getMeta', handleGetMeta)
    eventBus.off('getTabs', handleGetTabs)
    eventBus.off('getPlaylists', handleGetPlaylists)
    eventBus.off('updatePage', handleUpdatePage)
    eventBus.off('update:watcher', handleUpdateWatcher)
    eventBus.off('addMedia', handleAddMediaEvent)
    eventBus.off('updateVideoFrames', handleUpdateVideoFrames)
    eventBus.off('app:database-changed', handleDatabaseChanged)
    eventBus.off('app:authenticated', handleAuthenticated)
  }

  async function markAppReady(): Promise<void> {
    await nextTick()
    isAppReady.value = true
    store.is_app_ready = true
    runAutoRegistration()
    if (!operationsStore.migrationLowDb.dialog) {
      openOnboardingIfNeeded(isPlayerWindow.value)
    }
    await nextTick()
  }

  async function bootstrapPlayerWindow(): Promise<void> {
    setupPlayerElectronListeners()
    store.is_app_ready = true
    isAppReady.value = true
    notifyPlayerReady()

    const settingsPromise = initSettings()
      .then(async () => {
        applyTheme()
        await applyLocale()
      })
      .catch(() => {
        store.isServerError = true
      })

    loadPlayerBackgroundData()
    await settingsPromise
  }

  async function bootstrapMainApp(): Promise<void> {
    store.is_app_ready = false
    isAppReady.value = false
    isShellReady.value = false
    shellRevealSent = false

    await initSettings()
    applyTheme()
    await applyLocale()
    await openLowDbMigrationIfNeeded(isPlayerWindow.value)

    // Reveal the app chrome and Electron window before heavy startup work.
    await revealAppShell()

    if (store.isElectron && window.electronAPI?.updater) {
      void initAppUpdater({
        checkAtStartup: settingsStore.checkForUpdatesAtStartup === '1',
      })
    }

    const authenticated = await tryRestoreSession()

    if (appZoom) {
      await appZoom.initFromSettings()
      window.addEventListener('keydown', appZoom.handleKeydown)
      window.addEventListener('wheel', appZoom.blockPinchZoom, {passive: false})

      if (store.isElectron) {
        unsubscribeZoomChanged = subscribeElectronIpc('zoom-changed', (...args: unknown[]) => {
          void appZoom.syncFromElectron(Number(args[0]))
        })
      }
    }

    await getMachineId()

    try {
      if (authenticated) {
        await loadMainAppData()
        await markAppReady()
      }

      try {
        await ensureDeferredServices()
      } catch (error) {
        console.error('Deferred services failed to load:', error)
      }

      bindMainAppEventBus()

      if (typeof BroadcastChannel !== 'undefined') {
        thumbBroadcastChannel = new BroadcastChannel(THUMB_BROADCAST_CHANNEL)
        thumbBroadcastChannel.addEventListener('message', handleThumbBroadcast)
      }
    } finally {
      if (authenticated && !isAppReady.value) {
        await markAppReady()
      }
    }

    if (store.isElectron) {
      setupPlayerElectronListeners()

      unsubscribeAboutApp = subscribeElectronIpc('aboutApp', handleAboutApp)
      unsubscribeShowDocumentation = subscribeElectronIpc('showDocumentation', handleShowDocumentation)
      unsubscribeShowFeedback = subscribeElectronIpc('showFeedback', handleShowFeedback)
      unsubscribeMenuAction = subscribeElectronIpc('menuAction', handleMenuAction)
      unsubscribeLockApp = subscribeElectronIpc('lockApp', handleLockApp)
    }
  }

  onMounted(async () => {
    setupWindowFocusTracking()

    if (isPlayerWindow.value) {
      await bootstrapPlayerWindow()
      return
    }

    await bootstrapMainApp()
  })

  onBeforeUnmount(() => {
    store.is_app_ready = false
    isAppReady.value = false
    isShellReady.value = false
    shellRevealSent = false
    cleanupMediaAdding?.()
    unbindMainAppEventBus()
    thumbBroadcastChannel?.removeEventListener('message', handleThumbBroadcast)
    thumbBroadcastChannel?.close()
    thumbBroadcastChannel = null
    window.removeEventListener('resize', saveWindowSize)
    saveWindowSize.cancel()
    teardownPlayerElectronListeners()
    unsubscribeAboutApp?.()
    unsubscribeShowDocumentation?.()
    unsubscribeShowFeedback?.()
    unsubscribeMenuAction?.()
    unsubscribeLockApp?.()
    unsubscribeZoomChanged?.()
    teardownWindowFocusTracking()

    if (appZoom) {
      window.removeEventListener('keydown', appZoom.handleKeydown)
      window.removeEventListener('wheel', appZoom.blockPinchZoom)
    }
  })

  return {
    isAppReady,
    isShellReady,
  }
}
