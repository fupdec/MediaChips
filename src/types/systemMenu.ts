import {LOCAL_AI_UI_ENABLED} from '@shared/features'
import {
  APP_MENU_GAP_SIZE_LABELS,
  APP_MENU_LOCALE_NATIVE_NAMES,
  APP_MENU_LOCALES,
} from '@shared/electron/appMenuI18n'
import {
  APP_MENU_GAP_SIZES,
  APP_MENU_THEMES,
  type AppMenuSettingAction,
} from '@shared/electron/appMenuState'

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
  | 'globalSearch'
  | 'commandPalette'
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
  | 'localAi'
  | 'gettingStarted'
  | 'sendFeedback'
  | 'keyboardShortcuts'
  | 'checkUpdates'
  | 'versionHistory'
  | 'website'
  | 'toggleDevTools'
  | 'about'
  | AppMenuSettingAction

export interface SystemMenuItemConfig {
  action?: SystemMenuAction
  divider?: boolean
  icon?: string
  hotkey?: string
  labelKey?: string
  label?: string
  checkable?: boolean
  submenu?: SystemMenuItemConfig[]
}

export interface SystemMenuConfig {
  id: 'file' | 'edit' | 'view' | 'app' | 'window' | 'help'
  labelKey: string
  items: SystemMenuItemConfig[]
}

const LANGUAGE_ITEMS: SystemMenuItemConfig[] = APP_MENU_LOCALES.map((code) => ({
  action: `setLocale:${code}`,
  label: APP_MENU_LOCALE_NATIVE_NAMES[code],
  checkable: true,
}))

const THEME_ITEMS: SystemMenuItemConfig[] = APP_MENU_THEMES.map((mode) => ({
  action: `setTheme:${mode}`,
  icon: mode === 'system'
    ? 'mdi-theme-light-dark'
    : mode === 'dark'
      ? 'mdi-weather-night'
      : 'mdi-weather-sunny',
  labelKey: `systemBar.theme_${mode}`,
  checkable: true,
}))

const GAP_ITEMS: SystemMenuItemConfig[] = APP_MENU_GAP_SIZES.map((size) => ({
  action: `setGapSize:${size}`,
  label: APP_MENU_GAP_SIZE_LABELS[size],
  checkable: true,
}))

export const SYSTEM_MENUS: SystemMenuConfig[] = [
  {
    id: 'app',
    labelKey: 'systemBar.menu_app',
    items: [
      {action: 'settings', icon: 'mdi-cog', labelKey: 'systemBar.settings', hotkey: 'Ctrl+,'},
      {action: 'lock', icon: 'mdi-lock', labelKey: 'systemBar.lock'},
      {divider: true},
      {
        action: 'toggleMinimizeToTray',
        icon: 'mdi-inbox-arrow-down',
        labelKey: 'systemBar.minimize_to_tray',
        checkable: true,
      },
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
      {action: 'commandPalette', icon: 'mdi-console-line', labelKey: 'systemBar.command_palette', hotkey: 'Ctrl+K'},
      {divider: true},
      {
        icon: 'mdi-theme-light-dark',
        labelKey: 'systemBar.theme',
        submenu: THEME_ITEMS,
      },
      {
        icon: 'mdi-translate',
        labelKey: 'systemBar.language',
        submenu: LANGUAGE_ITEMS,
      },
      {divider: true},
      {
        action: 'toggleSfwMode',
        icon: 'mdi-eye-off-outline',
        labelKey: 'systemBar.sfw_mode',
        checkable: true,
      },
      {divider: true},
      {
        icon: 'mdi-menu',
        labelKey: 'systemBar.navigation',
        submenu: [
          {
            action: 'toggleBottomBar',
            icon: 'mdi-dock-bottom',
            labelKey: 'systemBar.nav_bottom_bar',
            checkable: true,
          },
          {
            action: 'toggleNavPlaylists',
            icon: 'mdi-playlist-play',
            labelKey: 'systemBar.nav_playlists',
            checkable: true,
          },
          {
            action: 'toggleNavMarkers',
            icon: 'mdi-bookmark-multiple-outline',
            labelKey: 'systemBar.nav_markers',
            checkable: true,
          },
          {
            action: 'toggleNavTrash',
            icon: 'mdi-delete-outline',
            labelKey: 'systemBar.nav_trash',
            checkable: true,
          },
        ],
      },
      {
        action: 'toggleSidebar',
        icon: 'mdi-view-sidebar-outline',
        labelKey: 'systemBar.show_sidebar',
        checkable: true,
        hotkey: 'B',
      },
      {
        action: 'toggleInspector',
        icon: 'mdi-information-outline',
        labelKey: 'systemBar.show_inspector',
        checkable: true,
        hotkey: 'I',
      },
      {divider: true},
      {
        icon: 'mdi-view-agenda-outline',
        labelKey: 'systemBar.gap_size',
        submenu: GAP_ITEMS,
      },
      {
        icon: 'mdi-play-circle-outline',
        labelKey: 'systemBar.playback',
        submenu: [
          {
            action: 'toggleSystemPlayer',
            icon: 'mdi-television-play',
            labelKey: 'systemBar.system_player',
            checkable: true,
          },
          {
            action: 'toggleSeparatePlayerWindow',
            icon: 'mdi-dock-window',
            labelKey: 'systemBar.separate_player_window',
            checkable: true,
          },
          {
            action: 'togglePreviewSound',
            icon: 'mdi-volume-high',
            labelKey: 'systemBar.preview_sound',
            checkable: true,
          },
        ],
      },
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
      ...(LOCAL_AI_UI_ENABLED
        ? [{action: 'localAi' as const, icon: 'mdi-robot-outline', labelKey: 'settings_labels.local_ai.chat_title'}]
        : []),
      {action: 'gettingStarted', icon: 'mdi-flag-outline', labelKey: 'systemBar.getting_started'},
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
