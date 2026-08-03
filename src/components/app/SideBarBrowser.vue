<template>
  <v-navigation-drawer
    app
    clipped
    permanent
    width="260"
    class="sidebar-browser"
  >
    <div class="sidebar-browser__scroll scrollable vertical">
      <div class="scrollable-child">
        <v-list
          nav
          density="compact"
          class="sidebar-browser__nav"
        >
          <v-list-subheader class="sidebar-section">
            {{ t('navigation.section_library') }}
          </v-list-subheader>

          <v-list-item
            v-for="link in libraryLinks"
            :key="link.key"
            :to="link.to"
            :prepend-icon="link.icon"
            :title="link.title"
            :exact="link.exact"
            color="primary"
            link
          />

          <template v-if="metaVisible.length">
            <v-list-subheader class="sidebar-section">
              {{ t('navigation.section_tags') }}
            </v-list-subheader>

            <v-list-item
              :to="allTagsLink.to"
              :prepend-icon="allTagsLink.icon"
              :title="allTagsLink.title"
              :exact="allTagsLink.exact"
              color="primary"
              link
            />
          </template>
        </v-list>

        <div
          v-if="metaVisible.length"
          class="sidebar-browser__tags-panel"
        >
          <SidebarTagsBrowser />
        </div>

        <v-list
          nav
          density="compact"
          class="sidebar-browser__system"
        >
          <v-list-subheader class="sidebar-section">
            {{ t('navigation.section_system') }}
          </v-list-subheader>

          <v-list-item
            :to="settingsLink.to"
            :prepend-icon="settingsLink.icon"
            :title="settingsLink.title"
            color="primary"
            link
          />

          <div
            v-if="showWatcherFolders"
            @mouseover="folderHovered = true"
            @mouseleave="folderHovered = false"
          >
            <v-list-item
              v-for="f in watcherFiles"
              :key="f.folder.id"
              :disabled="watcherBusy"
              @click="openDialogFolder(f)"
            >
              <template #prepend>
                <v-badge
                  v-if="!watcherBusy"
                  :content="watcherBadgeCountsByFolderId[f.folder.id]?.new ?? 0"
                  :model-value="Boolean(watcherBadgeCountsByFolderId[f.folder.id]?.new)"
                  :dot="!folderHovered"
                  color="success"
                  location="top right"
                >
                  <v-badge
                    v-if="!watcherBusy"
                    :content="watcherBadgeCountsByFolderId[f.folder.id]?.lost ?? 0"
                    :model-value="Boolean(watcherBadgeCountsByFolderId[f.folder.id]?.lost)"
                    :dot="!folderHovered"
                    color="error"
                    location="bottom right"
                  >
                    <v-icon>mdi-folder-outline</v-icon>
                  </v-badge>
                </v-badge>
                <v-icon v-else>mdi-folder-sync-outline</v-icon>
              </template>
              <template #title>
                {{ f.folder.name }}
              </template>
            </v-list-item>
          </div>
        </v-list>
      </div>
    </div>
  </v-navigation-drawer>
</template>

<script setup lang="ts">
import {ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {useLibraryNavItems} from '@/composable/useLibraryNavItems'
import SidebarTagsBrowser from '@/components/app/SidebarTagsBrowser.vue'

const folderHovered = ref(false)
const {t} = useI18n()

const {
  metaVisible,
  libraryLinks,
  settingsLink,
  allTagsLink,
  watcherFiles,
  showWatcherFolders,
  watcherBadgeCountsByFolderId,
  watcherBusy,
  openDialogFolder,
} = useLibraryNavItems()
</script>

<style scoped lang="scss">
.sidebar-browser {
  border-right: 1px solid rgba(var(--v-theme-on-surface), 0.08) !important;
}

.sidebar-browser__scroll {
  height: 100%;
}

:deep(.v-navigation-drawer__content) {
  overflow: hidden;
}

.sidebar-section {
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  height: 28px;
  min-height: 28px;
  padding-inline: 16px;
  opacity: 0.55;
}

.sidebar-browser__tags-panel {
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  margin: 4px 0;
  padding-bottom: 4px;
}

.sidebar-browser__system {
  padding-bottom: 12px;
}
</style>
