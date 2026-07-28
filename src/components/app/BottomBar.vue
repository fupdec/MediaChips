<script setup lang="ts">
import {ref} from 'vue'
import {useLibraryNavItems} from '@/composable/useLibraryNavItems'

const folderHovered = ref(false)
const hiddenMetaMenu = ref(false)

const {
  mediaTypesHidden,
  metaVisible,
  metaHidden,
  libraryLinks,
  settingsLink,
  watcherFiles,
  showWatcherFolders,
  watcherBadgeCountsByFolderId,
  watcherBusy,
  openDialogFolder,
  metaPath,
} = useLibraryNavItems()
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
    <v-tooltip
      v-for="link in libraryLinks"
      :key="link.key"
      location="top"
    >
      <template #activator="{ props }">
        <v-btn
          v-bind="props"
          :to="link.to"
          :exact="link.exact"
          draggable="false"
          variant="text"
          color="primary"
        >
          <v-icon>{{ link.icon }}</v-icon>
          <span>{{ link.title }}</span>
        </v-btn>
      </template>
      {{ link.title }}
    </v-tooltip>

    <v-tooltip
      v-for="item in metaVisible"
      :key="item.id"
      location="top"
    >
      <template #activator="{ props }">
        <v-btn
          v-bind="props"
          :to="metaPath(item.id)"
          draggable="false"
          variant="text"
          color="primary"
          exact
        >
          <v-icon>{{ `mdi-${item.icon}` }}</v-icon>
          <span>{{ item.name }}</span>
        </v-btn>
      </template>
      {{ item.name }}
    </v-tooltip>

    <v-menu
      v-if="mediaTypesHidden.length || metaHidden.length"
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
          v-for="item in metaHidden"
          :key="item.id"
          :to="metaPath(item.id)"
          color="primary"
          density="compact"
          exact
          link
          draggable="false"
        >
          <template #prepend>
            <v-icon>{{ `mdi-${item.icon}` }}</v-icon>
          </template>
          <template #title>
            <span>{{ item.name }}</span>
          </template>
        </v-list-item>
      </v-list>
    </v-menu>

    <v-tooltip location="top">
      <template #activator="{ props }">
        <v-btn
          v-bind="props"
          :to="settingsLink.to"
          draggable="false"
          color="primary"
          variant="text"
        >
          <v-icon>{{ settingsLink.icon }}</v-icon>
          <span>{{ settingsLink.title }}</span>
        </v-btn>
      </template>
      {{ settingsLink.title }}
    </v-tooltip>

    <div
      v-if="showWatcherFolders"
      class="folders"
      @mouseover="folderHovered = true"
      @mouseleave="folderHovered = false"
    >
      <v-tooltip
        v-for="entry in watcherFiles"
        :key="entry.folder.id"
        location="top"
      >
        <template #activator="{ props }">
          <div class="folder-wrapper">
            <v-btn
              v-bind="props"
              @click="openDialogFolder(entry)"
              :disabled="watcherBusy"
              class="folder v-btn--selected v-btn--active"
              variant="text"
            >
              <v-icon v-if="watcherBusy">mdi-folder-sync-outline</v-icon>
              <v-icon v-else>mdi-folder-outline</v-icon>
            </v-btn>

            <v-badge
              v-if="!watcherBusy"
              :content="watcherBadgeCountsByFolderId[entry.folder.id]?.new ?? 0"
              :dot="!folderHovered"
              :offset-x="!folderHovered ? 48 : 55"
              :offset-y="!folderHovered ? -16 : -20"
              color="success"
            />
            <v-badge
              v-if="!watcherBusy"
              :content="watcherBadgeCountsByFolderId[entry.folder.id]?.lost ?? 0"
              :dot="!folderHovered"
              :offset-x="!folderHovered ? 48 : 55"
              :offset-y="!folderHovered ? 0 : 2"
              color="error"
            />
          </div>
        </template>

        <span>{{ entry.folder.name }}</span>
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
