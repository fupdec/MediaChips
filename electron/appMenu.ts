import {app, Menu, type BrowserWindow, type MenuItemConstructorOptions} from 'electron'
import {LOCAL_AI_UI_ENABLED} from '../shared/features'
import {
  getAppMenuLabels,
  normalizeAppMenuLocale,
  type AppMenuLabels,
} from '../shared/electron/appMenuI18n'

export type AppMenuController = {
  install: () => void
  setLocale: (locale: string) => void
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

  function sendMenuAction(action: string) {
    if (deps.sendMenuAction) {
      deps.sendMenuAction(action)
      return
    }
    deps.getMainWindow()?.webContents.send('menuAction', action)
  }

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

  function buildTemplate(): MenuItemConstructorOptions[] {
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
      submenu: [
        menuActionItem(labels.toggleTheme, 'toggleTheme'),
        {type: 'separator'},
        // Use app zoom actions instead of Chromium menu roles so shortcuts stay
        // in sync with the persisted zoom setting.
        menuActionItem(labels.zoomIn, 'zoomIn', 'CommandOrControl+='),
        menuActionItem(labels.zoomOut, 'zoomOut', 'CommandOrControl+-'),
        menuActionItem(labels.resetZoom, 'resetZoom', 'CommandOrControl+0'),
        {type: 'separator'},
        {role: 'togglefullscreen'},
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
            deps.onLock()
          },
        },
        {type: 'separator'},
        menuActionItem(labels.restart, 'restart'),
        ...(!isMac ? [{
          label: labels.exit,
          accelerator: 'CommandOrControl+Q',
          click() {
            app.exit()
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
        label: app.name,
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

  function install() {
    Menu.setApplicationMenu(Menu.buildFromTemplate(buildTemplate()))
  }

  function setLocale(locale: string) {
    labels = getAppMenuLabels(normalizeAppMenuLocale(locale))
    install()
  }

  return {
    install,
    setLocale,
  }
}
