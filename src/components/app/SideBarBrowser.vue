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

          <template v-if="metaArray.length">
            <div class="sidebar-section sidebar-section--actions">
              <span class="sidebar-section__label">{{ t('navigation.section_tags') }}</span>
              <div class="sidebar-section__actions">
                <v-btn
                  icon
                  size="x-small"
                  :variant="tagsEditMode ? 'flat' : 'text'"
                  :color="tagsEditMode ? 'primary' : undefined"
                  :aria-label="tagsEditMode
                    ? t('all_tags.done_editing_categories')
                    : t('all_tags.edit_categories')"
                  :title="tagsEditMode
                    ? t('all_tags.done_editing_categories')
                    : t('all_tags.edit_categories')"
                  @click="tagsEditMode = !tagsEditMode"
                >
                  <v-icon size="16">
                    {{ tagsEditMode ? 'mdi-check' : 'mdi-pencil-outline' }}
                  </v-icon>
                </v-btn>
                <v-btn
                  icon
                  size="x-small"
                  :to="allTagsLink.to"
                  :exact="allTagsLink.exact"
                  :variant="isAllTagsActive ? 'flat' : 'text'"
                  :color="isAllTagsActive ? 'primary' : undefined"
                  :aria-label="allTagsLink.title"
                  :title="allTagsLink.title"
                >
                  <v-icon size="16">{{ allTagsLink.icon }}</v-icon>
                </v-btn>
              </div>
            </div>
          </template>
        </v-list>

        <div
          v-if="metaArray.length"
          class="sidebar-browser__tags-panel"
        >
          <SidebarTagsBrowser :edit-mode="tagsEditMode" />
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
import {computed, ref} from 'vue'
import {useRoute} from 'vue-router'
import {useI18n} from 'vue-i18n'
import {useLibraryNavItems} from '@/composable/useLibraryNavItems'
import SidebarTagsBrowser from '@/components/app/SidebarTagsBrowser.vue'

const folderHovered = ref(false)
const tagsEditMode = ref(false)
const {t} = useI18n()
const route = useRoute()

const {
  metaArray,
  libraryLinks,
  settingsLink,
  allTagsLink,
  watcherFiles,
  showWatcherFolders,
  watcherBadgeCountsByFolderId,
  watcherBusy,
  openDialogFolder,
} = useLibraryNavItems()

const isAllTagsActive = computed(() => route.path === '/tags')
</script>

<style scoped lang="scss">
.sidebar-browser {
  border-right: 1px solid rgba(var(--v-theme-on-surface), 0.08) !important;

  :deep(a.v-list-item),
  :deep(.v-list-item--link) {
    text-decoration: none;
  }

  :deep(.sidebar-browser__nav) {
    padding-bottom: 0;
  }
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

.sidebar-section--actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  height: auto;
  min-height: 32px;
  margin-bottom: 4px;
  opacity: 1;
  padding-inline: 8px 4px;
  overflow: visible;
}

.sidebar-section__label {
  opacity: 0.55;
  min-width: 0;
}

.sidebar-section__actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 4px;
}

.sidebar-browser__tags-panel {
  margin: 2px 0 4px;
  padding-inline: 8px;
}

.sidebar-browser__system {
  padding-bottom: 12px;
}
</style>
