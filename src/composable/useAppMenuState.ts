import {computed} from 'vue'
import {useSettingsStore} from '@/stores/settings'
import {useAppStore} from '@/stores/app'
import {readMinimizeToTrayFromStore} from '@/services/globalAppConfig'
import {appMenuStateFromSettings, type AppMenuCheckedState} from '@shared/electron/appMenuState'

export function useAppMenuCheckedState() {
  const settingsStore = useSettingsStore()
  const appStore = useAppStore()

  return computed((): AppMenuCheckedState => appMenuStateFromSettings({
    locale: settingsStore.locale,
    systemDarkMode: settingsStore.system_dark_mode,
    darkMode: settingsStore.darkMode,
    sfwMode: settingsStore.sfwMode,
    gapSize: settingsStore.gapSize,
    minimizeToTray: readMinimizeToTrayFromStore(appStore.config),
    playInSystemPlayer: settingsStore.isPlayVideoInSystemPlayer,
    separatePlayerWindow: settingsStore.open_player_in_separate_window,
    playSoundOnPreview: settingsStore.play_sound_on_video_preview,
    bottomBar: settingsStore.bottomBar,
    showPlaylists: settingsStore.showPlaylistsInNavigation,
    showMarkers: settingsStore.showMarkersInNavigation,
    showTrash: settingsStore.showTrashInNavigation,
    sidebarCollapsed: settingsStore.sidebarCollapsed,
    inspectorCollapsed: settingsStore.inspectorCollapsed,
  }))
}
