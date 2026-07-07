export type SystemMenuAction =
  | 'addMedia'
  | 'importBackup'
  | 'exportBackup'
  | 'openDataFolder'
  | 'undo'
  | 'redo'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'selectAll'
  | 'find'
  | 'globalSearch'
  | 'toggleTheme'
  | 'zoomIn'
  | 'zoomOut'
  | 'resetZoom'
  | 'toggleFullscreen'
  | 'settings'
  | 'lock'
  | 'restart'
  | 'exit'
  | 'minimizeWindow'
  | 'toggleMaximize'
  | 'closeWindow'
  | 'documentation'
  | 'sendFeedback'
  | 'keyboardShortcuts'
  | 'checkUpdates'
  | 'versionHistory'
  | 'website'
  | 'toggleDevTools'
  | 'about'

export interface SystemMenuItemConfig {
  action?: SystemMenuAction
  divider?: boolean
  icon?: string
  hotkey?: string
  labelKey?: string
  disabled?: () => boolean
}

export interface SystemMenuConfig {
  id: 'file' | 'edit' | 'view' | 'app' | 'window' | 'help'
  labelKey: string
  items: SystemMenuItemConfig[]
}

export const SYSTEM_MENUS: SystemMenuConfig[] = [
  {
    id: 'app',
    labelKey: 'systemBar.menu_app',
    items: [
      {action: 'settings', icon: 'mdi-cog', labelKey: 'systemBar.settings', hotkey: 'Ctrl+,'},
      {action: 'lock', icon: 'mdi-lock', labelKey: 'systemBar.lock'},
      {divider: true},
      {action: 'restart', icon: 'mdi-restart', labelKey: 'systemBar.restart'},
      {action: 'exit', icon: 'mdi-logout', labelKey: 'common.exit', hotkey: 'Ctrl+Q'},
    ],
  },
  {
    id: 'file',
    labelKey: 'systemBar.menu_file',
    items: [
      {action: 'addMedia', icon: 'mdi-plus', labelKey: 'systemBar.add_media'},
      {divider: true},
      {action: 'importBackup', icon: 'mdi-database-import', labelKey: 'systemBar.import_backup'},
      {action: 'exportBackup', icon: 'mdi-database-export', labelKey: 'systemBar.export_backup'},
      {divider: true},
      {action: 'openDataFolder', icon: 'mdi-folder-open', labelKey: 'systemBar.open_data_folder'},
    ],
  },
  {
    id: 'view',
    labelKey: 'systemBar.menu_view',
    items: [
      {action: 'globalSearch', icon: 'mdi-magnify', labelKey: 'systemBar.global_search', hotkey: '/'},
      {action: 'toggleTheme', icon: 'mdi-theme-light-dark', labelKey: 'systemBar.toggle_theme'},
      {divider: true},
      {action: 'zoomIn', labelKey: 'systemBar.zoom_in', hotkey: 'Ctrl++'},
      {action: 'zoomOut', labelKey: 'systemBar.zoom_out', hotkey: 'Ctrl+-'},
      {action: 'resetZoom', labelKey: 'systemBar.reset_zoom', hotkey: 'Ctrl+0'},
      {divider: true},
      {action: 'toggleFullscreen', icon: 'mdi-fullscreen', labelKey: 'systemBar.toggle_fullscreen'},
    ],
  },
  {
    id: 'help',
    labelKey: 'systemBar.menu_help',
    items: [
      {action: 'documentation', icon: 'mdi-book-open-page-variant', labelKey: 'systemBar.documentation'},
      {action: 'sendFeedback', icon: 'mdi-message-text-outline', labelKey: 'systemBar.send_feedback'},
      {action: 'keyboardShortcuts', icon: 'mdi-keyboard-outline', labelKey: 'systemBar.keyboard_shortcuts'},
      {divider: true},
      {action: 'checkUpdates', icon: 'mdi-update', labelKey: 'systemBar.check_updates'},
      {action: 'versionHistory', icon: 'mdi-text', labelKey: 'systemBar.version_history'},
      {action: 'website', icon: 'mdi-web', labelKey: 'systemBar.website'},
      {divider: true},
      {action: 'toggleDevTools', labelKey: 'systemBar.toggle_dev_tools', hotkey: 'Ctrl+Shift+I'},
      {divider: true},
      {action: 'about', icon: 'mdi-information-variant', labelKey: 'settings.tabs.about'},
    ],
  },
]
