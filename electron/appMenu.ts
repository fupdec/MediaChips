import {app, ipcMain, Menu, type BrowserWindow, type IpcMainInvokeEvent, type MenuItemConstructorOptions} from 'electron'
import {LOCAL_AI_UI_ENABLED} from '../shared/features'
import {
  APP_MENU_GAP_SIZE_LABELS,
  APP_MENU_LOCALE_NATIVE_NAMES,
  APP_MENU_LOCALES,
  getAppMenuLabels,
  normalizeAppMenuLocale,
  type AppMenuLabels,
} from '../shared/electron/appMenuI18n'
import {
  APP_MENU_GAP_SIZES,
  APP_MENU_THEMES,
  DEFAULT_APP_MENU_STATE,
  parseAppMenuCheckedState,
  type AppMenuCheckedState,
  type AppMenuGapSize,
  type AppMenuThemeMode,
} from '../shared/electron/appMenuState'

export type AppMenuController = {
  install: () => void
  setLocale: (locale: string) => void
  setState: (state: AppMenuCheckedState) => void
  registerIpc: () => void
}

export function buildAppMenuTemplate(options: {
  isMac: boolean
  localAiEnabled: boolean
  appName: string
  labels: AppMenuLabels
  state: AppMenuCheckedState
  sendMenuAction: (action: string) => void
  onLock: () => void
  onExit: () => void
}): MenuItemConstructorOptions[] {
  const {isMac, localAiEnabled, appName, labels, state, sendMenuAction, onLock, onExit} = options

  function menuActionItem(
    label: string,
    action: string,
    accelerator?: string,
  ): MenuItemConstructorOptions {
    return {
      label,
      ...(accelerator ? {accelerator} : {}),
      click() {
        sendMenuAction(action)
      },
    }
  }

  function checkboxItem(
    label: string,
    action: string,
    checked: boolean,
    options: {accelerator?: string; enabled?: boolean} = {},
  ): MenuItemConstructorOptions {
    return {
      label,
      type: 'checkbox',
      checked,
      enabled: options.enabled ?? true,
      ...(options.accelerator ? {accelerator: options.accelerator} : {}),
      click() {
        sendMenuAction(action)
      },
    }
  }

  function radioItem(
    label: string,
    action: string,
    checked: boolean,
  ): MenuItemConstructorOptions {
    return {
      label,
      type: 'radio',
      checked,
      click() {
        sendMenuAction(action)
      },
    }
  }

  const themeSubmenu: MenuItemConstructorOptions[] = APP_MENU_THEMES.map((mode: AppMenuThemeMode) => {
    const themeLabels: Record<AppMenuThemeMode, string> = {
      system: labels.themeSystem,
      light: labels.themeLight,
      dark: labels.themeDark,
    }
    return radioItem(themeLabels[mode], `setTheme:${mode}`, state.theme === mode)
  })

  const languageSubmenu: MenuItemConstructorOptions[] = APP_MENU_LOCALES.map((locale) =>
    radioItem(
      APP_MENU_LOCALE_NATIVE_NAMES[locale],
      `setLocale:${locale}`,
      state.locale === locale,
    ),
  )

  const gapSubmenu: MenuItemConstructorOptions[] = APP_MENU_GAP_SIZES.map((size: AppMenuGapSize) =>
    radioItem(APP_MENU_GAP_SIZE_LABELS[size], `setGapSize:${size}`, state.gapSize === size),
  )

  const fileMenu: MenuItemConstructorOptions = {
    label: labels.menuFile,
    submenu: [
      menuActionItem(labels.addMedia, 'addMedia'),
      {type: 'separator'},
      menuActionItem(labels.importBackup, 'importBackup'),
      menuActionItem(labels.exportBackup, 'exportBackup'),
      {type: 'separator'},
      menuActionItem(labels.openDataFolder, 'openDataFolder'),
      {type: 'separator'},
      {role: 'close'},
    ],
  }

  const editMenu: MenuItemConstructorOptions = {
    label: labels.menuEdit,
    submenu: [
      {
        label: labels.undo,
        accelerator: 'CommandOrControl+Z',
        role: 'undo',
      },
      {
        label: labels.redo,
        accelerator: 'CommandOrControl+Y',
        role: 'redo',
      },
      {type: 'separator'},
      {
        label: labels.cut,
        accelerator: 'CommandOrControl+X',
        role: 'cut',
      },
      {
        label: labels.copy,
        accelerator: 'CommandOrControl+C',
        role: 'copy',
      },
      {
        label: labels.paste,
        accelerator: 'CommandOrControl+V',
        role: 'paste',
      },
      {type: 'separator'},
      {
        label: labels.selectAll,
        accelerator: 'CommandOrControl+A',
        role: 'selectAll',
      },
      menuActionItem(labels.globalSearch, 'globalSearch', 'CommandOrControl+F'),
    ],
  }

  const viewMenu: MenuItemConstructorOptions = {
    label: labels.menuView,
    // Identifies this as the system View menu so macOS still adds Full Screen
    // when the label is localized (Вид / Ansicht / …).
    ...(isMac ? {role: 'viewMenu' as const} : {}),
    submenu: [
      menuActionItem(labels.commandPalette, 'commandPalette', 'CommandOrControl+K'),
      {type: 'separator'},
      {
        label: labels.theme,
        submenu: themeSubmenu,
      },
      {
        label: labels.language,
        submenu: languageSubmenu,
      },
      {type: 'separator'},
      checkboxItem(labels.sfwMode, 'toggleSfwMode', state.sfwMode),
      {type: 'separator'},
      {
        label: labels.navigation,
        submenu: [
          checkboxItem(labels.navBottomBar, 'toggleBottomBar', state.bottomBar),
          checkboxItem(labels.navPlaylists, 'toggleNavPlaylists', state.showPlaylists),
          checkboxItem(labels.navMarkers, 'toggleNavMarkers', state.showMarkers),
          checkboxItem(labels.navTrash, 'toggleNavTrash', state.showTrash),
        ],
      },
      checkboxItem(labels.showSidebar, 'toggleSidebar', state.sidebarVisible),
      checkboxItem(labels.showInspector, 'toggleInspector', state.inspectorVisible),
      {type: 'separator'},
      {
        label: labels.gapSize,
        submenu: gapSubmenu,
      },
      {
        label: labels.playback,
        submenu: [
          checkboxItem(labels.systemPlayer, 'toggleSystemPlayer', state.playInSystemPlayer),
          checkboxItem(
            labels.separatePlayerWindow,
            'toggleSeparatePlayerWindow',
            state.separatePlayerWindow,
            {enabled: !state.playInSystemPlayer},
          ),
          checkboxItem(labels.previewSound, 'togglePreviewSound', state.playSoundOnPreview),
        ],
      },
      {type: 'separator'},
      // Use app zoom actions instead of Chromium menu roles so shortcuts stay
      // in sync with the persisted zoom setting.
      menuActionItem(labels.zoomIn, 'zoomIn', 'CommandOrControl+='),
      menuActionItem(labels.zoomOut, 'zoomOut', 'CommandOrControl+-'),
      menuActionItem(labels.resetZoom, 'resetZoom', 'CommandOrControl+0'),
      // macOS AppKit already injects "Enter Full Screen" into the View menu;
      // adding role:togglefullscreen here duplicates the item.
      ...(!isMac ? [
        {type: 'separator' as const},
        {role: 'togglefullscreen' as const},
      ] : []),
    ],
  }

  const appMenu: MenuItemConstructorOptions = {
    label: labels.menuApp,
    submenu: [
      ...(!isMac ? [menuActionItem(labels.settings, 'settings', 'CommandOrControl+,')] : []),
      {
        label: labels.lock,
        id: 'lock',
        enabled: true,
        click() {
          onLock()
        },
      },
      {type: 'separator'},
      checkboxItem(labels.minimizeToTray, 'toggleMinimizeToTray', state.minimizeToTray),
      {type: 'separator'},
      menuActionItem(labels.restart, 'restart'),
      ...(!isMac ? [{
        label: labels.exit,
        accelerator: 'CommandOrControl+Q',
        click() {
          onExit()
        },
      }] : []),
    ],
  }

  const windowMenu: MenuItemConstructorOptions = {
    label: labels.menuWindow,
    submenu: [
      {role: 'minimize'},
      {role: 'zoom'},
      {type: 'separator'},
      {role: 'front'},
    ],
  }

  const helpMenu: MenuItemConstructorOptions = {
    label: labels.menuHelp,
    submenu: [
      menuActionItem(labels.documentation, 'documentation'),
      ...(localAiEnabled ? [menuActionItem(labels.localAi, 'localAi')] : []),
      menuActionItem(labels.gettingStarted, 'gettingStarted'),
      menuActionItem(labels.sendFeedback, 'sendFeedback'),
      menuActionItem(labels.keyboardShortcuts, 'keyboardShortcuts'),
      {type: 'separator'},
      menuActionItem(labels.checkUpdates, 'checkUpdates'),
      menuActionItem(labels.versionHistory, 'versionHistory'),
      menuActionItem(labels.website, 'website'),
      {type: 'separator'},
      {
        label: labels.toggleDevTools,
        accelerator: 'CommandOrControl+Shift+I',
        role: 'toggleDevTools',
      },
      ...(!isMac ? [
        {type: 'separator' as const},
        menuActionItem(labels.about, 'about'),
      ] : []),
    ],
  }

  return [
    ...(isMac ? [{
      label: appName,
      submenu: [
        menuActionItem(labels.aboutMediaChips, 'about'),
        {type: 'separator' as const},
        menuActionItem(labels.settingsEllipsis, 'settings', 'CommandOrControl+,'),
        {type: 'separator' as const},
        {role: 'services' as const},
        {type: 'separator' as const},
        {role: 'hide' as const},
        {role: 'hideOthers' as const},
        {role: 'unhide' as const},
        {type: 'separator' as const},
        {role: 'quit' as const},
      ],
    } satisfies MenuItemConstructorOptions] : []),
    ...(isMac
      ? [fileMenu, editMenu, viewMenu, appMenu, windowMenu, helpMenu]
      : [appMenu, fileMenu, viewMenu, helpMenu]),
  ]
}

export function createAppMenuController(deps: {
  getMainWindow: () => BrowserWindow | null
  onLock: () => void
  localAiEnabled?: boolean
  /** Optional shared delivery (queues while the main window is missing/loading). */
  sendMenuAction?: (action: string) => void
}): AppMenuController {
  const localAiEnabled = deps.localAiEnabled ?? LOCAL_AI_UI_ENABLED
  const isMac = process.platform === 'darwin'
  let labels: AppMenuLabels = getAppMenuLabels('en')
  let state: AppMenuCheckedState = {...DEFAULT_APP_MENU_STATE}

  function sendMenuAction(action: string) {
    if (deps.sendMenuAction) {
      deps.sendMenuAction(action)
      return
    }
    deps.getMainWindow()?.webContents.send('menuAction', action)
  }

  function install() {
    Menu.setApplicationMenu(Menu.buildFromTemplate(buildAppMenuTemplate({
      isMac,
      localAiEnabled,
      appName: app.name,
      labels,
      state,
      sendMenuAction,
      onLock: deps.onLock,
      onExit: () => app.exit(),
    })))
  }

  function setLocale(locale: string) {
    const next = normalizeAppMenuLocale(locale)
    labels = getAppMenuLabels(next)
    state = {...state, locale: next}
    install()
  }

  function setState(next: AppMenuCheckedState) {
    state = next
    labels = getAppMenuLabels(next.locale)
    install()
  }

  function registerIpc() {
    ipcMain.handle('set-app-menu-state', (_event: IpcMainInvokeEvent, next: unknown) => {
      setState(parseAppMenuCheckedState(next))
      return true
    })
  }

  return {
    install,
    setLocale,
    setState,
    registerIpc,
  }
}
