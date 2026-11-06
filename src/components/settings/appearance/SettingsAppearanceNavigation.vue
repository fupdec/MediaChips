<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import {useLibraryNavItems} from '@/composable/useLibraryNavItems'
import SettingsSwitch from '@/components/ui/SettingsSwitch.vue'
import SettingsGroupPanel from '@/components/ui/SettingsGroupPanel.vue'
const {t} = useI18n()
const {syncLibraryNavFromLegacyFlags} = useLibraryNavItems()
</script>
<template>
  <div class="mx-4">
  <SettingsGroupPanel icon="menu" :title="t('settings_labels.appearance.group_navigation')">
    <settings-switch
      option="bottomBar"
      :title="t('settings_labels.appearance.nav_bottom')"
    />

    <settings-switch
      option="showPlaylistsInNavigation"
      :title="t('settings_labels.appearance.show_playlists')"
      @update="syncLibraryNavFromLegacyFlags"
    />

    <settings-switch
      option="showMarkersInNavigation"
      :title="t('settings_labels.appearance.show_markers')"
      @update="syncLibraryNavFromLegacyFlags"
    />

    <settings-switch
      option="showTrashInNavigation"
      :title="t('settings_labels.appearance.show_trash')"
    />
    <settings-switch
      option="showHistoryInAppBar"
      :title="t('settingsLayout.show_history_button')"
      :hint="t('settingsLayout.show_history_button_hint')"
      data-testid="settings-history-button"
    />
  </SettingsGroupPanel>
  </div>
</template>
