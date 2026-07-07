<script setup lang="ts">
import {ref, computed} from 'vue'
import {useAppStore} from '@/stores/app'
import {useSettingsStore} from '@/stores/settings'
import {useWatcherStore} from '@/stores/watcher'
import {useI18n} from 'vue-i18n'
import {getMediaTypeName} from '@/utils/mediaTypeI18n'
import {useWatcherBadgeCounts} from '@/composable/useWatcherBadgeCounts'
import type { WatcherFilesEntry } from '@/types/watcher'

const settings = useSettingsStore()
const app = useAppStore()
const watcherStore = useWatcherStore()
const {t} = useI18n()
const {watcherBadgeCountsByFolderId} = useWatcherBadgeCounts()

const watcherFiles = computed(() => watcherStore.menuEntries)
const folderHovered = ref(false)
const hiddenMetaMenu = ref(false)

const mediaTypes = computed(() => app.mediaTypes.filter(i => !i.hidden))
const mediaTypesHidden = computed(() => app.mediaTypes.filter(i => i.hidden))

const meta = computed(() => app.meta.filter(i => i.type === 'array' && !i.hidden))
const hiddenMeta = computed(() => app.meta.filter(i => i.type === 'array' && i.hidden))

function openDialogFolder(folder: WatcherFilesEntry) {
  watcherStore.folder = folder
  watcherStore.dialogFolder = true
}
</script>

<template>
  <v-bottom-navigation
    app
    :active="true"
    mode="shift"
    density="comfortable"
    elevation="10"
    class="bottom-menu"
  >
    <!-- Home -->
    <v-tooltip location="top">
      <template #activator="{ props }">
        <v-btn
          v-bind="props"
          to="/"
          variant="text"
          color="primary"
        >
          <v-icon>mdi-home-outline</v-icon>
          <span>{{ t('navigation.home') }}</span>
        </v-btn>
      </template>
      {{ t('navigation.home') }}
    </v-tooltip>

    <!-- Media types -->
    <v-tooltip
      v-for="media in mediaTypes"
      :key="media.id"
      location="top"
    >
      <template #activator="{ props }">
        <v-btn
          v-bind="props"
          :to="`/media?mediaTypeId=${media.id}`"
          variant="text"
          color="primary"
          exact
        >
          <v-icon>{{ `mdi-${media.icon}` }}</v-icon>
          <span>{{ getMediaTypeName(media, t) }}</span>
        </v-btn>
      </template>
      {{ getMediaTypeName(media, t) }}
    </v-tooltip>

    <!-- Playlists -->
    <v-tooltip v-if="settings.showPlaylistsInNavigation === '1'" location="top">
      <template #activator="{ props }">
        <v-btn
          v-bind="props"
          to="/playlists"
          variant="text"
          color="primary"
        >
          <v-icon>mdi-format-list-bulleted</v-icon>
          <span>{{ t('navigation.playlists') }}</span>
        </v-btn>
      </template>
      {{ t('navigation.playlists') }}
    </v-tooltip>

    <!-- Markers -->
    <v-tooltip v-if="settings.showMarkersInNavigation === '1'" location="top">
      <template #activator="{ props }">
        <v-btn
          v-bind="props"
          to="/markers"
          variant="text"
          color="primary"
        >
          <v-icon>mdi-tooltip-outline</v-icon>
          <span>{{ t('navigation.markers') }}</span>
        </v-btn>
      </template>
      {{ t('navigation.markers') }}
    </v-tooltip>

    <!-- Meta -->
    <v-tooltip
      v-for="i in meta"
      :key="i.id"
      location="top"
    >
      <template #activator="{ props }">
        <v-btn
          v-bind="props"
          :to="`/meta?metaId=${i.id}`"
          variant="text"
          color="primary"
          exact
        >
          <v-icon>{{ `mdi-${i.icon}` }}</v-icon>
          <span>{{ i.name }}</span>
        </v-btn>
      </template>
      {{ i.name }}
    </v-tooltip>

    <!-- Hidden menu -->
    <v-menu
      v-if="mediaTypesHidden.length || hiddenMeta.length"
      v-model="hiddenMetaMenu"
      location="top"
    >
      <template #activator="{ props }">
        <div class="folder-wrapper">
          <v-btn
            v-bind="props"
            @click.prevent
            class="folder btn-hidden"
            variant="text"
          >
            <v-icon v-if="hiddenMetaMenu">mdi-chevron-down</v-icon>
            <v-icon v-else>mdi-chevron-up</v-icon>
          </v-btn>
        </div>
      </template>

      <v-list density="compact">
        <v-list-item
          v-for="i in hiddenMeta"
          :key="i.id"
          :to="`/meta?metaId=${i.id}`"
          color="primary"
          density="compact"
          exact
          link
        >
          <template #prepend>
            <v-icon>{{ `mdi-${i.icon}` }}</v-icon>
          </template>
          <template #title>
            <span>{{ i.name }}</span>
          </template>
        </v-list-item>
      </v-list>
    </v-menu>

    <!-- Settings -->
    <v-tooltip location="top">
      <template #activator="{ props }">
        <v-btn v-bind="props"
          to="/settings"
          color="primary"
          variant="text">
          <v-icon>mdi-cog-outline</v-icon>
          <span>{{ t('navigation.settings') }}</span>
        </v-btn>
      </template>
      {{ t('navigation.settings') }}
    </v-tooltip>

    <!-- Watcher folders -->
    <div
      v-if="watcherFiles.length && settings.watchFolders === '1'"
      class="folders"
      @mouseover="folderHovered = true"
      @mouseleave="folderHovered = false"
    >
      <v-tooltip
        v-for="i in watcherFiles"
        :key="i.folder.id"
        location="top"
      >
        <template #activator="{ props }">
          <div class="folder-wrapper">
            <v-btn
              v-bind="props"
              @click="openDialogFolder(i)"
              :disabled="watcherStore.busy"
              class="folder v-btn--selected v-btn--active"
              variant="text"
            >
              <v-icon v-if="watcherStore.busy">mdi-folder-sync-outline</v-icon>
              <v-icon v-else>mdi-folder-outline</v-icon>
            </v-btn>

            <!-- badges -->
            <v-badge
              v-if="!watcherStore.busy"
              :content="watcherBadgeCountsByFolderId[i.folder.id]?.new ?? 0"
              :dot="!folderHovered"
              :offset-x="!folderHovered ? 48 : 55"
              :offset-y="!folderHovered ? -16 : -20"
              color="success"
            />
            <v-badge
              v-if="!watcherStore.busy"
              :content="watcherBadgeCountsByFolderId[i.folder.id]?.lost ?? 0"
              :dot="!folderHovered"
              :offset-x="!folderHovered ? 48 : 55"
              :offset-y="!folderHovered ? 0 : 2"
              color="error"
            ></v-badge>
          </div>
        </template>

        <span>{{ i.folder.name }}</span>
      </v-tooltip>
    </div>
  </v-bottom-navigation>
</template>

<style
  lang="scss">
.bottom-menu {
  --bottom-bar-height: 56px;
  height: calc(var(--bottom-bar-height) + env(safe-area-inset-bottom, 0px));
  width: 100%;
  max-width: 100vw;
  display: flex;
  background-color: rgba(var(--v-theme-background), 0.85);
  backdrop-filter: blur(25px);
  padding-bottom: env(safe-area-inset-bottom, 0px);
  z-index: 1004;
}

.bottom-menu .v-bottom-navigation__content {
  justify-content: safe center;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}

.bottom-menu .v-bottom-navigation__content::-webkit-scrollbar {
  display: none;
}

.bottom-menu .v-btn {
  flex: 0 0 auto;
}

.bottom-menu-wrap {
  text-align: center;
  white-space: nowrap;
}

.scrollable {
  overflow-x: auto;
  white-space: nowrap;
}

.folders {
  display: flex;
  flex: 0 0 auto;
  height: 100%;
}

.folder-wrapper {
  height: 100%;
  .v-btn__overlay,
  .v-btn__underlay {
    display: none;
  }
  .v-btn__content {
    transform: none !important;
  }
}

.btn-hidden {
  min-width: 50px;
}

@media (max-width: 600px) {
  .bottom-menu .v-bottom-navigation__content {
    gap: 2px;
    padding-inline: 4px;
  }

  .bottom-menu .v-btn {
    min-width: 52px;
    padding-inline: 0;
  }

  .bottom-menu .v-btn .v-btn__content > span {
    display: none;
  }

  .bottom-menu .folder,
  .bottom-menu .btn-hidden {
    min-width: 44px;
  }
}
</style>
