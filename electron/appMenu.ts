import {app, Menu, type BrowserWindow, type MenuItemConstructorOptions} from 'electron'
import {LOCAL_AI_UI_ENABLED} from '../shared/features'

export type AppMenuController = {
  install: () => void
}

export function createAppMenuController(deps: {
  getMainWindow: () => BrowserWindow | null
  onLock: () => void
  localAiEnabled?: boolean
}): AppMenuController {
  const localAiEnabled = deps.localAiEnabled ?? LOCAL_AI_UI_ENABLED
  const isMac = process.platform === 'darwin'

  function sendMenuAction(action: string) {
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
      label: 'File',
      submenu: [
        menuActionItem('Add Media', 'addMedia'),
        {type: 'separator'},
        menuActionItem('Import Backup...', 'importBackup'),
        menuActionItem('Export Backup...', 'exportBackup'),
        {type: 'separator'},
        menuActionItem('Open Data Folder', 'openDataFolder'),
        {type: 'separator'},
        {role: 'close'},
      ],
    }

    const editMenu: MenuItemConstructorOptions = {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: 'CommandOrControl+Z',
          role: 'undo',
        },
        {
          label: 'Redo',
          accelerator: 'CommandOrControl+Y',
          role: 'redo',
        },
        {type: 'separator'},
        {
          label: 'Cut',
          accelerator: 'CommandOrControl+X',
          role: 'cut',
        },
        {
          label: 'Copy',
          accelerator: 'CommandOrControl+C',
          role: 'copy',
        },
        {
          label: 'Paste',
          accelerator: 'CommandOrControl+V',
          role: 'paste',
        },
        {type: 'separator'},
        {
          label: 'Select all',
          accelerator: 'CommandOrControl+A',
          role: 'selectAll',
        },
        menuActionItem('Global Search', 'globalSearch', 'CommandOrControl+F'),
      ],
    }

    const viewMenu: MenuItemConstructorOptions = {
      label: 'View',
      submenu: [
        menuActionItem('Toggle Theme', 'toggleTheme'),
        {type: 'separator'},
        // Use app zoom actions (CSS zoom) instead of Chromium roles — setZoomFactor
        // cuts off nested settings scroll regions when zoomed in.
        menuActionItem('Zoom In', 'zoomIn', 'CommandOrControl+='),
        menuActionItem('Zoom Out', 'zoomOut', 'CommandOrControl+-'),
        menuActionItem('Reset Zoom', 'resetZoom', 'CommandOrControl+0'),
        {type: 'separator'},
        {role: 'togglefullscreen'},
      ],
    }

    const appMenu: MenuItemConstructorOptions = {
      label: 'App',
      submenu: [
        ...(!isMac ? [menuActionItem('Settings', 'settings', 'CommandOrControl+,')] : []),
        {
          label: 'Lock',
          id: 'lock',
          enabled: true,
          click() {
            deps.onLock()
          },
        },
        {type: 'separator'},
        menuActionItem('Restart', 'restart'),
        ...(!isMac ? [{
          label: 'Exit',
          accelerator: 'CommandOrControl+Q',
          click() {
            app.exit()
          },
        }] : []),
      ],
    }

    const windowMenu: MenuItemConstructorOptions = {
      label: 'Window',
      submenu: [
        {role: 'minimize'},
        {role: 'zoom'},
        {type: 'separator'},
        {role: 'front'},
      ],
    }

    const helpMenu: MenuItemConstructorOptions = {
      label: 'Help',
      submenu: [
        menuActionItem('Documentation', 'documentation'),
        ...(localAiEnabled ? [menuActionItem('Local AI', 'localAi')] : []),
        menuActionItem('Getting Started', 'gettingStarted'),
        menuActionItem('Send Feedback', 'sendFeedback'),
        menuActionItem('Keyboard Shortcuts', 'keyboardShortcuts'),
        {type: 'separator'},
        menuActionItem('Check for Updates', 'checkUpdates'),
        menuActionItem('Version History', 'versionHistory'),
        menuActionItem('Website', 'website'),
        {type: 'separator'},
        {
          label: 'Toggle Developer Tools',
          accelerator: 'CommandOrControl+Shift+I',
          role: 'toggleDevTools',
        },
        ...(!isMac ? [
          {type: 'separator' as const},
          menuActionItem('About', 'about'),
        ] : []),
      ],
    }

    return [
      ...(isMac ? [{
        label: app.name,
        submenu: [
          menuActionItem('About MediaChips', 'about'),
          {type: 'separator' as const},
          menuActionItem('Settings...', 'settings', 'CommandOrControl+,'),
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

  return {
    install() {
      Menu.setApplicationMenu(Menu.buildFromTemplate(buildTemplate()))
    },
  }
}
