<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from 'vue'
import {useDisplay} from 'vuetify'
import {useI18n} from 'vue-i18n'
import {useLibraryNavItems} from '@/composable/useLibraryNavItems'

const CONTENT_HEIGHT = 56

const folderHovered = ref(false)
const hiddenMetaMenu = ref(false)
const safeAreaBottom = ref(0)

const {mobile} = useDisplay()
const {t} = useI18n()

const {
  mediaTypesHidden,
  metaVisible,
  metaHidden,
  libraryLinks,
  settingsLink,
  allTagsLink,
  watcherFiles,
  showWatcherFolders,
  showInbox,
  inboxBadgeCount,
  watcherBadgeCountsByFolderId,
  watcherBusy,
  openDialogFolder,
  openInbox,
  metaPath,
} = useLibraryNavItems()

function readSafeAreaBottom() {
  if (typeof document === 'undefined') return 0
  const probe = document.createElement('div')
  probe.setAttribute('aria-hidden', 'true')
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;height:env(safe-area-inset-bottom,0px)'
  document.body.appendChild(probe)
  const value = probe.getBoundingClientRect().height
  probe.remove()
  return Number.isFinite(value) ? value : 0
}

function updateSafeAreaBottom() {
  safeAreaBottom.value = readSafeAreaBottom()
}

/** Include home-indicator inset so Vuetify layout reserves enough space. */
const navHeight = computed(() => CONTENT_HEIGHT + Math.ceil(safeAreaBottom.value))

onMounted(() => {
  updateSafeAreaBottom()
  window.addEventListener('resize', updateSafeAreaBottom)
  window.visualViewport?.addEventListener('resize', updateSafeAreaBottom)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateSafeAreaBottom)
  window.visualViewport?.removeEventListener('resize', updateSafeAreaBottom)
})
</script>

<template>
  <v-bottom-navigation
    app
    :active="true"
    :mode="mobile ? undefined : 'shift'"
    density="default"
    :height="navHeight"
    elevation="8"
    border
    class="bottom-menu"
    :class="{'bottom-menu--mobile': mobile}"
  >
    <v-tooltip
      v-for="link in libraryLinks"
      :key="link.key"
      location="top"
      :disabled="mobile"
      open-on-hover
    >
      <template #activator="{ props }">
        <v-btn
          v-bind="props"
          :to="link.to"
          :exact="link.exact"
          :aria-label="link.title"
          :title="link.title"
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
      location="top"
      :disabled="mobile"
      open-on-hover
    >
      <template #activator="{ props }">
        <v-btn
          v-bind="props"
          :to="allTagsLink.to"
          :exact="allTagsLink.exact"
          :aria-label="allTagsLink.title"
          :title="allTagsLink.title"
          draggable="false"
          variant="text"
          color="primary"
        >
          <v-icon>{{ allTagsLink.icon }}</v-icon>
          <span>{{ allTagsLink.title }}</span>
        </v-btn>
      </template>
      {{ allTagsLink.title }}
    </v-tooltip>

    <v-tooltip
      v-for="item in metaVisible"
      :key="item.id"
      location="top"
      :disabled="mobile"
      open-on-hover
    >
      <template #activator="{ props }">
        <v-btn
          v-bind="props"
          :to="metaPath(item.id)"
          :aria-label="item.name"
          :title="item.name"
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
            :aria-label="t('actions.more')"
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

    <v-tooltip
      location="top"
      :disabled="mobile"
      open-on-hover
    >
      <template #activator="{ props }">
        <v-btn
          v-bind="props"
          :to="settingsLink.to"
          :aria-label="settingsLink.title"
          :title="settingsLink.title"
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

    <v-tooltip
      v-if="showInbox"
      location="top"
      :disabled="mobile"
      open-on-hover
    >
      <template #activator="{ props }">
        <v-btn
          v-bind="props"
          class="v-btn--selected v-btn--active"
          variant="text"
          :disabled="watcherBusy"
          :aria-label="t('media_inbox.nav')"
          @click="openInbox()"
        >
          <v-badge
            :content="inboxBadgeCount"
            :model-value="inboxBadgeCount > 0"
            color="success"
          >
            <v-icon>mdi-inbox-outline</v-icon>
          </v-badge>
        </v-btn>
      </template>
      {{ t('media_inbox.nav') }}
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
        :disabled="mobile"
        open-on-hover
      >
        <template #activator="{ props }">
          <div class="folder-wrapper">
            <v-btn
              v-bind="props"
              @click="openDialogFolder(entry)"
              :disabled="watcherBusy"
              :aria-label="entry.folder.name"
              :title="entry.folder.name"
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

<style lang="scss">
.bottom-menu {
  --bottom-bar-height: 56px;
  box-sizing: border-box !important;
  width: 100%;
  max-width: 100vw;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  background-color: rgba(var(--v-theme-surface), 0.94) !important;
  backdrop-filter: blur(25px);
  -webkit-backdrop-filter: blur(25px);
  padding-bottom: env(safe-area-inset-bottom, 0px) !important;
  border-top: thin solid rgba(var(--v-border-color), 0.22);
  z-index: 1004;
}

.bottom-menu .v-bottom-navigation__content {
  flex: 0 0 var(--bottom-bar-height);
  height: var(--bottom-bar-height);
  max-height: var(--bottom-bar-height);
  justify-content: safe center;
  align-items: center;
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
  color: rgba(var(--v-theme-on-surface), 0.72) !important;
  opacity: 1;
}

.bottom-menu .v-btn.v-btn--selected,
.bottom-menu .v-btn.v-btn--active {
  color: rgb(var(--v-theme-primary)) !important;
}

.bottom-menu .v-btn .v-icon {
  opacity: 1;
  font-size: 1.5rem;
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

  .bottom-menu .v-btn .v-icon {
    font-size: 1.65rem;
  }

  /* Shift mode is off on mobile; keep icons centered above the home indicator. */
  .bottom-menu .v-btn .v-btn__content {
    transform: none !important;
  }

  .bottom-menu .folder,
  .bottom-menu .btn-hidden {
    min-width: 44px;
  }
}
</style>
