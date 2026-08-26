<template>
  <v-container
    v-if="appStore.localhost && appStore.is_app_ready"
    ref="foldersPageRef"
    class="folders-page items-layout-container"
  >
    <div
      ref="controlDeckSentinel"
      class="items-control-deck-sentinel"
      aria-hidden="true"
    />
    <div
      class="items-control-deck items-control-deck--browser"
      :class="controlDeckClass"
    >
      <div class="items-control-deck__surface items-control-deck__surface--card">
        <div class="items-page-header items-control-deck__header items-page-header--deck d-flex align-center justify-space-between flex-nowrap ga-2">
          <button
            type="button"
            class="items-control-deck__sticky-pin"
            :class="{'items-control-deck__sticky-pin--active': stickyControlDeck}"
            :aria-pressed="stickyControlDeck ? 'true' : 'false'"
            :aria-label="stickyControlDeck
              ? t('settings_labels.appearance.sticky_control_deck_unpin')
              : t('settings_labels.appearance.sticky_control_deck_pin')"
            v-tooltip:top="stickyControlDeck
              ? t('settings_labels.appearance.sticky_control_deck_unpin')
              : t('settings_labels.appearance.sticky_control_deck_pin')"
            @click="toggleStickyControlDeck"
          >
            <span class="items-control-deck__sticky-pin-glyph" aria-hidden="true">
              <v-icon size="16" icon="mdi-pin"/>
            </span>
          </button>

          <div class="d-flex align-center items-page-header__title min-width-0 ga-2">
            <v-icon class="items-page-header__icon" start>
              mdi-folder-outline
            </v-icon>
            <span class="items-page-header__name text-truncate">
              {{ pageTitle }}
            </span>
            <span
              v-if="!loading && entryCount > 0"
              class="items-page-header__meta"
            >
              ({{ entryCount }})
            </span>
          </div>

          <div class="d-flex align-center flex-nowrap ga-2 items-control-deck__controls">
            <div
              class="folders-page__mode-track"
              v-tooltip:top="t('folders_browser.mode_tooltip')"
            >
              <button
                type="button"
                class="folders-page__mode-opt"
                :class="{'folders-page__mode-opt--active': browseMode === 'library'}"
                @click="browseMode = 'library'"
              >
                <v-icon size="14" icon="mdi-bookshelf"/>
                <span>{{ t('folders_browser.mode_library') }}</span>
              </button>
              <button
                type="button"
                class="folders-page__mode-opt"
                :class="{'folders-page__mode-opt--active': browseMode === 'filesystem'}"
                @click="browseMode = 'filesystem'"
              >
                <v-icon size="14" icon="mdi-monitor-screenshot"/>
                <span>{{ t('folders_browser.mode_filesystem') }}</span>
              </button>
            </div>

            <v-select
              v-model="sort"
              :items="sortOptions"
              item-title="title"
              item-value="value"
              variant="outlined"
              density="compact"
              hide-details
              single-line
              rounded="xl"
              class="folders-page__sort"
              :aria-label="t('filters.sort_by')"
            />

            <v-btn
              @click="showAppearancePanel = !showAppearancePanel"
              v-tooltip:top="t('appbar.buttons.customize_appearance')"
              color="primary"
              :variant="showAppearancePanel ? 'flat' : 'tonal'"
              size="small"
              icon
            >
              <v-icon size="18">mdi-eye-settings-outline</v-icon>
            </v-btn>
          </div>
        </div>

        <v-expand-transition>
          <div
            v-if="showAppearancePanel"
            class="items-control-deck__appearance items-control-deck__section folders-page__appearance-section"
          >
            <div class="folders-page__appearance-deck">
              <div class="toolbar-appearance__deck-group">
                <span class="toolbar-appearance__deck-label">{{ t('settings_labels.appearance.item_size') }}</span>
                <div class="toolbar-appearance__deck-track">
                  <button
                    v-for="(label, index) in sizeLabels"
                    :key="label"
                    type="button"
                    class="toolbar-appearance__deck-opt"
                    :class="{'toolbar-appearance__deck-opt--active': itemsStore.size === index + 1}"
                    @click="itemsStore.size = index + 1"
                  >
                    {{ label }}
                  </button>
                </div>
              </div>

              <div class="toolbar-appearance__deck-group">
                <span class="toolbar-appearance__deck-label">{{ t('items.view_type') }}</span>
                <div class="items-view-track">
                  <button
                    type="button"
                    class="items-view-opt"
                    :class="{'items-view-opt--active': !listMode}"
                    @click="listMode = false"
                  >
                    <v-icon size="15">mdi-view-module</v-icon>
                    <span>{{ t('folders_browser.view_icons') }}</span>
                  </button>
                  <button
                    type="button"
                    class="items-view-opt"
                    :class="{'items-view-opt--active': listMode}"
                    @click="listMode = true"
                  >
                    <v-icon size="15">mdi-view-list</v-icon>
                    <span>{{ t('folders_browser.view_list') }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </v-expand-transition>

        <!-- Filters + Actions combined row -->
        <div class="folders-page__filters d-flex align-center flex-wrap ga-2">
          <v-text-field
            v-model="searchQuery"
            density="compact"
            variant="outlined"
            hide-details
            clearable
            rounded="xl"
            prepend-inner-icon="mdi-magnify"
            :placeholder="t('folders_browser.search_placeholder')"
            class="folders-page__search"
            @keydown.esc.stop="searchQuery = ''"
          />

          <template v-if="browseMode === 'library'">
            <v-chip
              size="small"
              label
              :color="mediaTypeId == null ? 'primary' : undefined"
              :variant="mediaTypeId == null ? 'flat' : 'tonal'"
              @click="setMediaTypeFilter(null)"
            >
              {{ t('folders_browser.all_types') }}
            </v-chip>
            <v-chip
              v-for="mediaType in visibleMediaTypes"
              :key="mediaType.id"
              size="small"
              label
              :color="mediaTypeId === mediaType.id ? 'primary' : undefined"
              :variant="mediaTypeId === mediaType.id ? 'flat' : 'tonal'"
              :prepend-icon="`mdi-${mediaType.icon || 'file'}`"
              @click="setMediaTypeFilter(mediaType.id)"
            >
              {{ mediaTypeTitle(mediaType) }}
            </v-chip>

            <div
              v-if="uniqueFolderTagChips.length"
              class="ml-2 d-flex align-center ga-1"
            >
              <v-chip
                size="x-small"
                label
                :color="tagFilterId == null ? 'primary' : undefined"
                :variant="tagFilterId == null ? 'flat' : 'tonal'"
                prepend-icon="mdi-tag-multiple-outline"
                @click="tagFilterId = null"
              >
                {{ t('folders_browser.all_tags') }}
              </v-chip>
              <v-chip
                v-for="chip in uniqueFolderTagChips"
                :key="chip.tagId"
                size="x-small"
                label
                :color="tagFilterId === chip.tagId ? 'primary' : undefined"
                :variant="tagFilterId === chip.tagId ? 'flat' : 'tonal'"
                @click="tagFilterId = tagFilterId === chip.tagId ? null : chip.tagId"
              >
                {{ chip.name }}
              </v-chip>
            </div>
          </template>

          <v-checkbox
            v-if="browseMode === 'filesystem'"
            v-model="showHidden"
            density="compact"
            hide-details
            :label="t('folders_browser.show_hidden')"
            class="mt-0 folders-page__filter-check"
          />

          <!-- Action buttons inline -->
          <div class="d-flex align-center ga-1 ml-auto">
            <template v-if="browseMode === 'filesystem' && currentFsPath">
              <v-btn
                size="small"
                variant="tonal"
                prepend-icon="mdi-folder-plus-outline"
                :disabled="loading || !currentFsPath"
                @click="openCreateFolderDialog"
              >
                {{ t('folders_browser.new_folder') }}
              </v-btn>
              <v-btn
                size="small"
                variant="tonal"
                @click="selectAllAddableFiles"
              >
                <v-icon size="16" icon="mdi-checkbox-multiple-marked" class="mr-1"/>
                {{ t('folders_browser.select_all_addable') }}
              </v-btn>
              <v-btn
                size="small"
                variant="tonal"
                color="success"
                prepend-icon="mdi-plus"
                :disabled="loading || !currentFsPath"
                @click="addCurrentFsFolder"
              >
                {{ t('folders_browser.add_to_library') }}
              </v-btn>
            </template>
            <template v-if="browseMode === 'library' && currentPath">
              <FolderTagsMenu
                :folder-path="currentPath"
                v-model:open="currentTagsMenuOpen"
                @saved="reloadFolderTags"
              >
                <template #activator="{props: menuProps}">
                  <v-btn
                    v-bind="menuProps"
                    size="small"
                    variant="tonal"
                    color="primary"
                    prepend-icon="mdi-tag-multiple-outline"
                  >
                    {{ t('media.adding.folder_tags_edit') }}
                  </v-btn>
                </template>
              </FolderTagsMenu>
              <v-btn
                size="small"
                variant="text"
                prepend-icon="mdi-folder-multiple-outline"
                @click="folderTagsManagerOpen = true"
              >
                {{ t('media.adding.folder_tags_manager_open') }}
              </v-btn>
              <v-btn
                size="small"
                variant="tonal"
                color="primary"
                prepend-icon="mdi-folder-open-outline"
                @click="revealPath(currentPath)"
              >
                {{ t('folders_browser.reveal') }}
              </v-btn>
              <v-btn
                size="small"
                variant="tonal"
                color="primary"
                prepend-icon="mdi-play"
                @click="playAllInPath(currentPath)"
              >
                {{ t('folders_browser.play_all') }}
              </v-btn>
            </template>
          </div>
        </div>

        <!-- Places chips (above breadcrumbs) -->
        <div
          v-if="browseMode === 'filesystem' && places.length"
          class="folders-page__places"
        >
          <div class="d-flex flex-wrap ga-1">
            <v-chip
              v-for="place in places"
              :key="place.id"
              size="small"
              label
              :color="activePlaceId === place.id ? 'primary' : undefined"
              :variant="activePlaceId === place.id ? 'flat' : 'tonal'"
              :prepend-icon="place.icon || 'mdi-folder'"
              @click="onSelectPlace(place.path)"
            >
              {{ placeLabel(place) }}
            </v-chip>
          </div>
        </div>

        <!-- Path / breadcrumbs (third, one line) -->
        <div class="folders-page__nav d-flex align-center ga-2 flex-nowrap min-width-0">
          <v-btn
            icon="mdi-arrow-left"
            size="x-small"
            color="primary"
            variant="tonal"
            :aria-label="t('folders_browser.back')"
            @click="router.back()"
          />
          <v-btn
            icon="mdi-arrow-right"
            size="x-small"
            color="primary"
            variant="tonal"
            :aria-label="t('folders_browser.forward')"
            @click="router.forward()"
          />
          <v-btn
            icon="mdi-arrow-up"
            size="x-small"
            color="primary"
            variant="tonal"
            :disabled="loading || !canGoUp"
            :aria-label="t('folders_browser.up')"
            @click="goUp"
          />
          <div class="folders-page__crumbs d-flex align-center ga-1 flex-nowrap min-width-0 overflow-x-auto">
            <v-chip
              v-if="browseMode === 'library'"
              size="small"
              label
              :color="!currentPath ? 'primary' : undefined"
              :variant="!currentPath ? 'flat' : 'tonal'"
              prepend-icon="mdi-folder-outline"
              :disabled="loading"
              @click="navigateTo(null)"
            >
              {{ t('folders_browser.roots') }}
            </v-chip>
            <v-chip
              v-else-if="browseMode === 'filesystem' && fsRootPath"
              size="small"
              label
              :color="currentFsPath === fsRootPath ? 'primary' : undefined"
              :variant="currentFsPath === fsRootPath ? 'flat' : 'tonal'"
              prepend-icon="mdi-folder-outline"
              :disabled="loading"
              @click="navigateToFs(fsRootPath)"
            >
              {{ fsRootName }}
            </v-chip>
            <template
              v-for="crumb in browseMode === 'filesystem' ? fsBreadcrumbs : breadcrumbs"
              :key="crumb.path"
            >
              <v-icon
                icon="mdi-chevron-right"
                size="14"
                class="text-medium-emphasis flex-shrink-0"
              />
              <v-chip
                size="small"
                label
                :color="crumb.path === (browseMode === 'filesystem' ? currentFsPath : currentPath) ? 'primary' : undefined"
                :variant="crumb.path === (browseMode === 'filesystem' ? currentFsPath : currentPath) ? 'flat' : 'tonal'"
                :disabled="loading"
                class="flex-shrink-0"
                @click="browseMode === 'filesystem' ? navigateToFs(crumb.path) : navigateTo(crumb.path)"
              >
                {{ crumb.name }}
              </v-chip>
            </template>
          </div>
        </div>

        <div
          v-if="browseMode === 'library' && currentPath && currentFolderTags.length"
          class="folders-page__current-tags d-flex flex-wrap ga-1"
        >
          <v-chip
            v-for="chip in currentFolderTags"
            :key="chip.tagId"
            size="x-small"
            label
            :color="chip.color || undefined"
            variant="tonal"
          >
            {{ chip.name }}
          </v-chip>
        </div>

        <v-progress-linear
          v-if="loading"
          indeterminate
          color="primary"
          height="2"
          class="mt-2"
        />

        <v-alert
          v-if="browseMode === 'filesystem' && fsError"
          type="error"
          variant="tonal"
          density="compact"
          rounded="lg"
          class="ma-2 text-caption"
        >
          {{ fsError }}
        </v-alert>

        <v-alert
          v-if="browseMode === 'filesystem' && fsTruncated"
          type="warning"
          variant="tonal"
          density="compact"
          rounded="lg"
          class="ma-2 text-caption"
        >
          {{ t('folders_browser.browser_truncated', {limit: 2000}) }}
        </v-alert>
      </div>
    </div>

    <div
      v-if="!loading && !fsEntries.length && !folders.length && !media.length && !searchQuery && (browseMode === 'library' || tagFilterId == null)"
      class="folders-page__status text-medium-emphasis"
    >
      <div class="mb-3">
        {{ browseMode === 'filesystem'
          ? t('folders_browser.browser_empty')
          : currentPath ? t('folders_browser.empty_folder') : t('folders_browser.empty_library') }}
      </div>
      <v-btn
        v-if="browseMode === 'library' && !currentPath"
        color="success"
        variant="flat"
        rounded="xl"
        prepend-icon="mdi-plus"
        @click="openAddMedia"
      >
        {{ t('commandPalette.actions.add_media') }}
      </v-btn>
      <v-btn
        v-else-if="browseMode === 'filesystem' && currentFsPath"
        color="primary"
        variant="tonal"
        rounded="xl"
        prepend-icon="mdi-folder-plus-outline"
        @click="openCreateFolderDialog"
      >
        {{ t('folders_browser.new_folder') }}
      </v-btn>
    </div>

    <div
      v-else-if="!loading && !visibleFolders.length && !visibleMedia.length && browseMode === 'library' && (searchQuery || tagFilterId != null)"
      class="folders-page__status text-medium-emphasis"
    >
      {{ t('folders_browser.search_empty') }}
    </div>

    <div
      v-else-if="visibleFolders.length || visibleMedia.length || fsFiles.length"
      ref="foldersGridRef"
      class="items-page-grid items-virtual-grid"
    >
      <FoldersVirtualGrid
        :folders="visibleFolders"
        :media="visibleMedia"
        :fs-files="fsFiles"
        :browse-mode="browseMode"
        :size="itemsStore.size"
        :gap-size="settingsStore.gapSize"
        :list="listMode"
        :folder-tags="folderTagsByPath"
        :cover-url-by-media-id="coverUrlByMediaId"
        :reg="registrationStore.reg"
        :select-mode="fsSelection.isSelectMode"
        :selected-folder-paths="fsSelectionSelectedFolderPaths"
        :selected-fs-file-paths="fsSelectionSelectedFsFilePaths"
        @open-folder="browseMode === 'filesystem' ? navigateToFs($event) : navigateTo($event)"
        @folder-contextmenu="onFolderContextMenu"
        @media-contextmenu="onMediaContextMenu"
        @fsfile-contextmenu="onFsFileContextMenu"
        @toggle-folder-select="onToggleFolderSelect"
        @toggle-fsfile-select="onToggleFsFileSelect"
      />
    </div>

    <FolderTagsMenu
      v-if="contextTagsPath"
      :folder-path="contextTagsPath"
      v-model:open="contextTagsMenuOpen"
      @saved="reloadFolderTags"
    >
      <template #activator="{props: menuProps}">
        <button
          v-bind="menuProps"
          ref="contextTagsActivator"
          class="folders-page__hidden-activator"
          type="button"
          tabindex="-1"
          aria-hidden="true"
        />
      </template>
    </FolderTagsMenu>

    <DialogFolderTagsManager v-model="folderTagsManagerOpen"/>

    <DialogBrowseFolder
      v-model="folderPickerOpen"
      :header="folderPickerOperation === 'copy'
        ? t('folders_browser.copy_selected')
        : t('folders_browser.move_selected')"
      :confirm-text="folderPickerOperation === 'copy'
        ? t('folders_browser.copy_selected')
        : t('folders_browser.move_selected')"
      @confirm="onFolderPickerConfirm"
    />

    <v-dialog
      v-model="createFolderOpen"
      width="420"
      @after-enter="focusCreateFolderInput"
    >
      <v-card rounded="xl">
        <v-card-title class="text-subtitle-1 font-weight-medium px-5 pt-5">
          {{ t('folders_browser.new_folder') }}
        </v-card-title>
        <v-card-text class="px-5 pb-2">
          <v-text-field
            ref="createFolderInputRef"
            v-model="createFolderName"
            density="compact"
            variant="outlined"
            hide-details="auto"
            rounded="lg"
            autofocus
            :label="t('folders_browser.new_folder_prompt')"
            :disabled="createFolderBusy"
            :error-messages="createFolderError ? [createFolderError] : []"
            @keydown.enter.prevent="submitCreateFolder"
          />
        </v-card-text>
        <v-card-actions class="px-5 pb-5">
          <v-spacer/>
          <v-btn
            variant="text"
            rounded="pill"
            :disabled="createFolderBusy"
            @click="createFolderOpen = false"
          >
            {{ t('common.cancel') }}
          </v-btn>
          <v-btn
            color="primary"
            variant="flat"
            rounded="pill"
            :loading="createFolderBusy"
            :disabled="!createFolderName.trim()"
            @click="submitCreateFolder"
          >
            {{ t('common.create') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Clipboard / Selection buffer -->
    <v-slide-y-transition>
      <div
        v-if="fsSelection.isSelectMode"
        class="folders-page__clipboard-bar"
        :style="clipboardBarStyle"
        :class="{'folders-page__clipboard-bar--bottom-nav': useBottomBar}"
      >
        <div class="folders-page__clipboard-bar-inner">
          <div class="folders-page__clipboard-bar-left">
            <v-icon size="16" icon="mdi-clipboard-text-outline" class="mr-1"/>
            <span class="folders-page__clipboard-bar-title">{{ t('folders_browser.clipboard_title') }}</span>
            <v-chip
              size="x-small"
              color="primary"
              variant="tonal"
              label
              class="ml-2"
            >
              {{ t('folders_browser.selected_count', {count: fsSelection.selectedCount}) }}
            </v-chip>
          </div>
          <div ref="clipboardEntriesContainerRef" class="folders-page__clipboard-bar-entries">
            <span
              v-if="!fsSelection.selectedCount"
              class="folders-page__clipboard-bar-empty"
            >
              {{ t('folders_browser.clipboard_empty') }}
            </span>
            <template v-else>
              <v-chip
                v-for="entry in fsSelection.selectedEntries"
                :key="entry.path"
                size="x-small"
                variant="tonal"
                label
                class="folders-page__clipboard-entry"
                :prepend-icon="entry.kind === 'folder' ? 'mdi-folder-outline' : 'mdi-file-outline'"
              >
                {{ entry.name }}
              </v-chip>
              <v-chip
                size="x-small"
                variant="tonal"
                label
                class="folders-page__clipboard-entry folders-page__clipboard-entry--more"
                :class="{'folders-page__clipboard-entry--more-hidden': clipboardOverflowCount <= 0}"
              >
                +{{ clipboardOverflowCount || '0' }}
              </v-chip>
            </template>
          </div>
          <div class="folders-page__clipboard-bar-actions">
            <v-btn
              size="x-small"
              variant="tonal"
              icon="mdi-content-copy"
              v-tooltip:top="t('folders_browser.copy_names')"
              @click="onCopyNames"
            />
            <v-btn
              v-if="browseMode === 'filesystem'"
              size="x-small"
              variant="tonal"
              icon="mdi-content-copy"
              v-tooltip:top="t('folders_browser.copy_selected')"
              @click="onCopySelectedTo"
            />
            <v-btn
              v-if="browseMode === 'filesystem'"
              size="x-small"
              variant="tonal"
              icon="mdi-file-move-outline"
              v-tooltip:top="t('folders_browser.move_selected')"
              @click="onMoveSelectedTo"
            />
            <div
              v-if="browseMode === 'filesystem'"
              class="folders-page__clipboard-bar-divider"
            />
            <v-btn
              v-if="browseMode === 'filesystem'"
              size="x-small"
              variant="tonal"
              color="error"
              icon="mdi-delete-outline"
              v-tooltip:top="t('folders_browser.delete_selected')"
              @click="onDeleteSelected"
            />
            <v-btn
              size="x-small"
              variant="tonal"
              icon="mdi-close"
              v-tooltip:top="t('folders_browser.clipboard_clear')"
              @click="fsSelection.clearSelection()"
            />
          </div>
        </div>

        <!-- Queue indicator -->
        <div
          v-if="fsQueue.totalPending > 0"
          class="folders-page__queue-bar"
        >
          <v-icon size="14" icon="mdi-progress-clock" class="mr-1"/>
          <span class="folders-page__queue-text">
            <template v-if="fsQueue.activeEntry">
              {{ fsQueue.activeEntry.label }}…
            </template>
            <template v-if="fsQueue.pendingCount > 0">
              {{ fsQueue.activeEntry ? ' +' : '' }}{{ fsQueue.pendingCount }} queued
            </template>
          </span>
        </div>
      </div>
    </v-slide-y-transition>
  </v-container>
</template>

<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRoute, useRouter} from 'vue-router'
import FoldersVirtualGrid from '@/components/folders/FoldersVirtualGrid.vue'
import FolderTagsMenu from '@/components/dialogs/FolderTagsMenu.vue'
import DialogFolderTagsManager from '@/components/dialogs/DialogFolderTagsManager.vue'
import DialogBrowseFolder from '@/components/dialogs/DialogBrowseFolder.vue'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useSettingsStore} from '@/stores/settings'
import {useRegistrationStore} from '@/stores/registration'
import {useContextMenu} from '@/stores/contextMenu'
import {useDialogsStore} from '@/stores/dialogs'
import {useStickyControlDeck} from '@/composable/useStickyControlDeck'
import {useFoldersBrowserFocus} from '@/composable/useFoldersBrowserFocus'
import {useNavigationLayout} from '@/composable/useNavigationLayout'
import {useFsBrowseSelection} from '@/stores/fsBrowseSelection'
import {useFsOperationsQueue} from '@/stores/fsOperationsQueue'
import {useAppShell} from '@/composable/appShell'
import useItemContextMenu from '@/composable/ItemContextMenu'
import {useEventBus} from '@/utils/eventBus'
import {typedApi} from '@/services/typedApi'
import {setNotification} from '@/services/notificationService'
import {openPath} from '@/services/shellService'
import {copyToClipboard} from '@/utils/copyToClipboard'
import {getMediaTypeName} from '@/utils/mediaTypeI18n'
import {findMediaTypeById, getMediaDeleteAssetFolder, isVideoMediaType, parseMediaTypeExtensions} from '@/utils/mediaType'
import {CARD_THUMB_MAX_EDGE, resolveMediaThumbDisplayUrl} from '@/utils/thumbSource'
import {useItemsThumbPrefetch} from '@/composable/useItemsThumbPrefetch'
import {
  canonicalizeFolderTagPath,
  filterAndSortFolderBrowse,
  folderTagLookupPaths,
  type FolderBrowseSort,
} from '@shared/libraryFolderBrowseUi'
import type {MediaType} from '@/types/media'
import type {ContextMenuEntry, MediaItem} from '@/types/stores'
import type {FolderBrowseTagChip, FolderBrowseTileModel} from '@/components/folders/FolderBrowseTile.vue'
import type {BrowsePlace} from '@/services/typedApi/browse'
import type {FsBrowseEntry} from '@/components/folders/FsBrowseEntry'

type Breadcrumb = {
  path: string
  name: string
}

const {t} = useI18n()
const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const itemsStore = useItemsStore()
const settingsStore = useSettingsStore()
const registrationStore = useRegistrationStore()
const contextMenuStore = useContextMenu()
const dialogsStore = useDialogsStore()
const appShell = useAppShell()
const eventBus = useEventBus()
const {setFocus, clearFocus} = useFoldersBrowserFocus()
const fsSelection = useFsBrowseSelection()
const fsQueue = useFsOperationsQueue()
const {useBottomBar} = useNavigationLayout()

const {
  controlDeckSentinel,
  controlDeckClass,
  stickyControlDeck,
  toggleStickyControlDeck,
} = useStickyControlDeck()

const loading = ref(false)
const currentPath = ref<string | null>(null)
const parentPath = ref<string | null>(null)
const breadcrumbs = ref<Breadcrumb[]>([])
const folders = ref<FolderBrowseTileModel[]>([])
const media = ref<MediaItem[]>([])
const searchQuery = ref('')
const sort = ref<FolderBrowseSort>('name-asc')
const foldersPageStorageKey = 'mediachips:folders-page-state'

type FoldersPageState = {
  browseMode?: 'library' | 'filesystem'
  listMode?: boolean
  libraryPath?: string | null
  filesystemPath?: string
}

function readFoldersPageState(): FoldersPageState {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(foldersPageStorageKey)
    if (!raw) return {}
    const value = JSON.parse(raw) as FoldersPageState
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

function writeFoldersPageState(patch: Partial<FoldersPageState>) {
  if (typeof window === 'undefined') return
  try {
    const current = readFoldersPageState()
    window.localStorage.setItem(foldersPageStorageKey, JSON.stringify({...current, ...patch}))
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}

const savedFoldersPageState = readFoldersPageState()
const listMode = ref(savedFoldersPageState.listMode === true)
const showAppearancePanel = ref(false)
const folderTagsByPath = ref<Record<string, FolderBrowseTagChip[]>>({})
const tagFilterId = ref<number | null>(null)
const coverUrlByMediaId = ref<Record<number, string>>({})
const coverMediaTypeById = ref<Record<string, number>>({})
const currentTagsMenuOpen = ref(false)
const contextTagsMenuOpen = ref(false)
const contextTagsPath = ref('')
const folderTagsManagerOpen = ref(false)
const contextTagsActivator = ref<HTMLButtonElement | null>(null)

// Filesystem browse mode state
const browseMode = ref<'library' | 'filesystem'>(
  savedFoldersPageState.browseMode === 'filesystem' ? 'filesystem' : 'library',
)
const showHidden = ref(false)
const places = ref<BrowsePlace[]>([])
const currentFsPath = ref(savedFoldersPageState.filesystemPath || '')
const fsParentPath = ref<string | null>(null)
const fsRootPath = ref<string | null>(null)
const fsBreadcrumbs = ref<Breadcrumb[]>([])
const fsEntries = ref<FsBrowseEntry[]>([])
const fsError = ref('')
const fsTruncated = ref(false)

// Folder-picker dialog state
const folderPickerOpen = ref(false)
const folderPickerOperation = ref<'copy' | 'move'>('copy')
const folderPickerEntries = ref<{path: string; name: string}[]>([])

const createFolderOpen = ref(false)
const createFolderName = ref('')
const createFolderBusy = ref(false)
const createFolderError = ref('')
const createFolderInputRef = ref<{focus?: () => void} | null>(null)

type ElementRef = HTMLElement | { $el?: HTMLElement | null } | null

const foldersPageRef = ref<ElementRef>(null)
const foldersGridRef = ref<HTMLElement | null>(null)
const clipboardEntriesContainerRef = ref<HTMLElement | null>(null)
const clipboardOverflowCount = ref(0)
const clipboardBarLeft = ref<number | null>(null)
const clipboardBarWidth = ref<number | null>(null)
const clipboardBarStyle = computed(() => {
  if (clipboardBarLeft.value == null || clipboardBarWidth.value == null) return {}
  return {
    left: `${clipboardBarLeft.value}px`,
    width: `${clipboardBarWidth.value}px`,
    maxWidth: 'none',
    transform: 'none',
  }
})

function asDomElement(value: ElementRef): HTMLElement | null {
  if (value instanceof HTMLElement) return value
  return value?.$el instanceof HTMLElement ? value.$el : null
}

function syncClipboardBarBounds() {
  const el = foldersGridRef.value || asDomElement(foldersPageRef.value)
  if (!el) return
  const {left, width} = el.getBoundingClientRect()
  clipboardBarLeft.value = left
  clipboardBarWidth.value = width
}

function recalcClipboardOverflow() {
  const el = clipboardEntriesContainerRef.value
  if (!el) return
  const chips = el.querySelectorAll<HTMLElement>(':scope > .folders-page__clipboard-entry:not(.folders-page__clipboard-entry--more)')
  if (!chips.length) {
    clipboardOverflowCount.value = 0
    return
  }
  const containerWidth = el.clientWidth
  const gap = 4
  // Measure the actual overflow chip width
  const overflowChip = el.querySelector<HTMLElement>('.folders-page__clipboard-entry--more')
  const overflowWidth = overflowChip ? overflowChip.offsetWidth + gap : 48
  const limit = containerWidth - overflowWidth
  let used = 0
  let visible = 0
  for (const chip of chips) {
    if (visible > 0) used += gap
    if (used + chip.offsetWidth > limit) break
    used += chip.offsetWidth
    visible++
  }
  clipboardOverflowCount.value = visible >= chips.length ? 0 : chips.length - visible
}

const sizeLabels = ['XS', 'S', 'M', 'L', 'XL', 'XXL']

const sortOptions = computed(() => [
  {value: 'name-asc' as const, title: t('folders_browser.sort_name_asc')},
  {value: 'name-desc' as const, title: t('folders_browser.sort_name_desc')},
  {value: 'count' as const, title: t('folders_browser.sort_count')},
  {value: 'date' as const, title: t('folders_browser.sort_date')},
])

const visibleMediaTypes = computed(() =>
  (appStore.mediaTypes || []).filter((item) => !item.hidden),
)

/** All file extensions accepted by any non-hidden media type, as a comma-separated string. */
const allMediaExtensions = computed(() => {
  const parts = new Set<string>()
  for (const mt of visibleMediaTypes.value) {
    for (const ext of parseMediaTypeExtensions(mt.extensions)) {
      parts.add(ext)
    }
  }
  return [...parts].join(',')
})

const mediaTypeId = computed((): number | null => {
  const raw = route.query.mediaTypeId
  const value = Array.isArray(raw) ? raw[0] : raw
  if (value == null || value === '') return null
  const id = Number(value)
  return Number.isFinite(id) && id > 0 ? id : null
})

const pathFromQuery = computed((): string | null => {
  const raw = route.query.path
  const value = Array.isArray(raw) ? raw[0] : raw
  if (value == null || value === '') return null
  return String(value)
})

const canGoUp = computed(() => {
  if (browseMode.value === 'filesystem') return Boolean(fsParentPath.value)
  return Boolean(currentPath.value)
})

const fsFiles = computed(() => {
  if (browseMode.value !== 'filesystem') return []
  return fsEntries.value.filter((entry) => !entry.isDirectory)
})

const fsFolders = computed(() => {
  if (browseMode.value !== 'filesystem') return []
  return fsEntries.value.filter((entry) => entry.isDirectory)
})

const filtered = computed(() => {
  let result = filterAndSortFolderBrowse(
    folders.value,
    media.value,
    {query: searchQuery.value, sort: sort.value},
  )

  if (tagFilterId.value != null) {
    result = {
      ...result,
      folders: result.folders.filter((folder) =>
        (folderTagsByPath.value[canonicalizeFolderTagPath(folder.path)] || [])
          .some((chip) => chip.tagId === tagFilterId.value),
      ),
    }
  }

  return result
})

const visibleFolders = computed(() => {
  if (browseMode.value === 'filesystem') {
    return fsFolders.value
      .filter((f) => {
        if (!searchQuery.value) return true
        return f.name.toLowerCase().includes(searchQuery.value.toLowerCase())
      })
      .map((f) => ({
        path: f.path,
        name: f.name,
        mediaCount: 0,
      }))
  }
  return filtered.value.folders
})

const visibleMedia = computed(() => {
  if (browseMode.value === 'filesystem') return []
  return filtered.value.media as MediaItem[]
})

const entryCount = computed(() => {
  if (browseMode.value === 'filesystem') {
    return fsEntries.value.length
  }
  return visibleFolders.value.length + visibleMedia.value.length
})

const pageTitle = computed(() => {
  if (browseMode.value === 'filesystem' && currentFsPath.value) {
    const last = fsBreadcrumbs.value[fsBreadcrumbs.value.length - 1]
    return last?.name || t('navigation.folders')
  }
  if (!currentPath.value) return t('navigation.folders')
  const last = breadcrumbs.value[breadcrumbs.value.length - 1]
  return last?.name || t('navigation.folders')
})

const fsSelectionSelectedFolderPaths = computed(() => {
  const s = new Set<string>()
  for (const e of fsSelection.selectedEntries) {
    if (e.kind === 'folder') s.add(e.path)
  }
  return s
})

const fsSelectionSelectedFsFilePaths = computed(() => {
  const s = new Set<string>()
  for (const e of fsSelection.selectedEntries) {
    if (e.kind === 'fs-file') s.add(e.path)
  }
  return s
})

const currentFolderTags = computed(() => {
  if (!currentPath.value) return []
  return folderTagsByPath.value[canonicalizeFolderTagPath(currentPath.value)] || []
})

const uniqueFolderTagChips = computed(() => {
  const byId = new Map<number, FolderBrowseTagChip>()
  for (const folder of folders.value) {
    const chips = folderTagsByPath.value[canonicalizeFolderTagPath(folder.path)] || []
    for (const chip of chips) {
      if (!byId.has(chip.tagId)) byId.set(chip.tagId, chip)
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
})

const prefetchMediaType = computed(() => {
  const id = mediaTypeId.value
  if (id == null) return null
  return findMediaTypeById(appStore.mediaTypes, id)
})

useItemsThumbPrefetch({
  items: computed(() => visibleMedia.value),
  itemsType: computed(() => 'media' as const),
  mediaType: prefetchMediaType,
})

function mediaTypeTitle(mediaType: MediaType) {
  return getMediaTypeName(mediaType, t)
}

function navigateTo(path: string | null) {
  writeFoldersPageState({libraryPath: path})
  itemsStore.clearSelection()
  clearFocus()
  fsSelection.clearSelection()
  const query: Record<string, string> = {}
  if (path) query.path = path
  if (mediaTypeId.value != null) query.mediaTypeId = String(mediaTypeId.value)
  void router.push({path: '/folders', query})
}

function setMediaTypeFilter(id: number | null) {
  const query: Record<string, string> = {}
  if (pathFromQuery.value) query.path = pathFromQuery.value
  if (id != null) query.mediaTypeId = String(id)
  void router.push({path: '/folders', query})
}

function goUp() {
  if (browseMode.value === 'filesystem') {
    if (fsParentPath.value) {
      navigateToFs(fsParentPath.value)
      return
    }
    if (currentFsPath.value) {
      navigateToFs('')
      return
    }
    return
  }
  if (parentPath.value) {
    navigateTo(parentPath.value)
    return
  }
  if (currentPath.value) navigateTo(null)
}

function openAddMedia() {
  appShell.showAddMediaDialog()
}

function revealPath(folderPath: string) {
  void openPath(folderPath, true)
}

// Filesystem browse mode functions

const knownPlaceIds = new Set([
  'home', 'desktop', 'documents', 'downloads',
  'videos', 'pictures', 'music', 'computer', 'network',
])

function placeLabel(place: BrowsePlace): string {
  if (knownPlaceIds.has(place.id)) {
    return t(`media.adding.place_${place.id}`)
  }
  return place.name || place.path
}

const activePlaceId = computed(() => {
  const current = currentFsPath.value
  if (!current) return null
  const matches = places.value
    .filter((place) => {
      if (current === place.path) return true
      const prefix = place.path.endsWith('/') || place.path.endsWith('\\')
        ? place.path
        : `${place.path}/`
      const prefixWin = place.path.endsWith('\\') ? place.path : `${place.path}\\`
      return current.startsWith(prefix) || current.startsWith(prefixWin)
    })
    .sort((a, b) => b.path.length - a.path.length)
  return matches[0]?.id ?? null
})

const fsRootName = computed(() => {
  if (!fsRootPath.value) return ''
  const parts = fsRootPath.value.replace(/[/\\]+$/, '').split(/[/\\]/).filter(Boolean)
  return parts[parts.length - 1] || fsRootPath.value
})

function onSelectPlace(path: string) {
  navigateToFs(path)
}

function navigateToFs(targetPath: string | null | undefined) {
  if (!targetPath || loading.value) return
  writeFoldersPageState({filesystemPath: targetPath})
  currentFsPath.value = targetPath
  fsSelection.clearSelection()
  void loadFsDirectory(targetPath)
}

function joinFsPath(parent: string, name: string) {
  const separator = parent.includes('\\') ? '\\' : '/'
  return parent.endsWith('/') || parent.endsWith('\\')
    ? `${parent}${name}`
    : `${parent}${separator}${name}`
}

function openCreateFolderDialog() {
  if (!currentFsPath.value) return
  createFolderName.value = ''
  createFolderError.value = ''
  createFolderOpen.value = true
}

function focusCreateFolderInput() {
  void nextTick(() => {
    createFolderInputRef.value?.focus?.()
  })
}

async function submitCreateFolder() {
  const name = createFolderName.value.trim()
  const parent = currentFsPath.value
  if (!parent || createFolderBusy.value) return

  if (!name) {
    createFolderError.value = t('folders_browser.new_folder_prompt')
    return
  }
  if (/[/\\]/.test(name) || name === '.' || name === '..') {
    createFolderError.value = t('folders_browser.new_folder_invalid')
    return
  }

  createFolderBusy.value = true
  createFolderError.value = ''
  try {
    await typedApi.createFolder(joinFsPath(parent, name))
    createFolderOpen.value = false
    createFolderName.value = ''
    setNotification({
      type: 'success',
      title: t('folders_browser.new_folder_done', {name}),
    })
    await loadFsDirectory(parent)
  } catch (err: unknown) {
    createFolderError.value = (err as {response?: {data?: {message?: string}}; message?: string})
      ?.response?.data?.message
      || (err as {message?: string})?.message
      || t('folders_browser.new_folder_error')
  } finally {
    createFolderBusy.value = false
  }
}

async function loadPlaces() {
  try {
    const {data} = await typedApi.listBrowsePlaces()
    places.value = data.places
  } catch {
    places.value = []
  }
}

async function loadFsDirectory(targetPath: string) {
  loading.value = true
  fsError.value = ''
  try {
    const {data} = await typedApi.listBrowseDirectory({
      path: targetPath,
      extensions: allMediaExtensions.value,
      showHidden: showHidden.value,
    })
    currentFsPath.value = data.currentPath
    writeFoldersPageState({filesystemPath: currentFsPath.value})
    fsParentPath.value = data.parentPath
    fsRootPath.value = data.rootPath
    fsTruncated.value = data.truncated

    const dirs: FsBrowseEntry[] = []
    const files: FsBrowseEntry[] = []
    for (const entry of data.entries) {
      const fsEntry: FsBrowseEntry = {
        name: entry.name,
        path: entry.path,
        isDirectory: entry.isDirectory,
        size: entry.size,
        mtimeMs: entry.mtimeMs,
        extension: entry.extension,
        inLibrary: entry.inLibrary,
        addable: entry.addable,
      }
      if (entry.isDirectory) dirs.push(fsEntry)
      else files.push(fsEntry)
    }
    fsEntries.value = [...dirs, ...files]

    // Build breadcrumbs from rootPath
    if (data.rootPath && data.currentPath) {
      const separator = data.rootPath.includes('\\') ? '\\' : '/'
      const relative = data.currentPath === data.rootPath
        ? ''
        : data.currentPath.slice(data.rootPath.length).replace(/^[/\\]+/, '')
      const parts = relative ? relative.split(/[/\\]/).filter(Boolean) : []
      const items: Breadcrumb[] = []
      let cursor = data.rootPath
      for (const part of parts) {
        cursor = cursor.endsWith('/') || cursor.endsWith('\\')
          ? `${cursor}${part}`
          : `${cursor}${separator}${part}`
        items.push({name: part, path: cursor})
      }
      fsBreadcrumbs.value = items
    } else {
      fsBreadcrumbs.value = []
    }
  } catch (err: unknown) {
    const message = (err as {response?: {data?: {message?: string}}; message?: string})
      ?.response?.data?.message
      || (err as {message?: string})?.message
      || t('folders_browser.browser_load_error')
    fsError.value = message
    fsEntries.value = []
    fsBreadcrumbs.value = []
  } finally {
    loading.value = false
  }
}

function addCurrentFsFolder() {
  appShell.showAddMediaDialog()
}

async function playAllInPath(folderPath: string) {
  const inCurrent = canonicalizeFolderTagPath(folderPath) === canonicalizeFolderTagPath(currentPath.value)
  if (inCurrent) {
    const localVideos = media.value.filter((item) =>
      isVideoMediaType(findMediaTypeById(appStore.mediaTypes, item.mediaTypeId)),
    )
    if (localVideos.length) {
      await itemsStore.playVideo({video: localVideos[0], videos: localVideos, player: 'default'})
      return
    }
  }

  try {
    const {data} = await typedApi.getMediaIds({
      mediaTypeId: mediaTypeId.value,
      filters: [{
        id: null,
        active: true,
        lock: false,
        note: null,
        param: 'path',
        type: 'string',
        cond: 'under folder',
        val: folderPath,
      }],
    })
    const ids = (data.ids || []).map(Number).filter((id) => Number.isFinite(id))
    if (!ids.length) return
    const basics = await typedApi.getMediaBasics({ids})
    const videos = (basics.data.items || []).filter((item) =>
      isVideoMediaType(findMediaTypeById(appStore.mediaTypes, item.mediaTypeId)),
    ) as MediaItem[]
    if (!videos.length) return
    itemsStore.entities = videos
    itemsStore.navigationItems = videos
    await itemsStore.playVideo({video: videos[0], videos, player: 'default'})
  } catch (error) {
    console.error('Failed to play folder videos', error)
  }
}

function syncPlaylist(items: MediaItem[]) {
  itemsStore.type = 'media'
  itemsStore.environment.media_type_id = mediaTypeId.value
  // Card grid needs standard media view so Item hover/big preview work.
  // Folders list mode uses a custom list row, not itemsStore view 5.
  if (!listMode.value) {
    itemsStore.view = 1
  }
  itemsStore.entities = items
  itemsStore.navigationItems = items
  itemsStore.itemsOnPage = items
  itemsStore.totalFiltered = items.length
}

async function reloadFolderTags() {
  const paths = [
    currentPath.value,
    ...folders.value.map((folder) => folder.path),
  ]
    .flatMap((path) => folderTagLookupPaths(path))
    .filter(Boolean)

  if (!paths.length) {
    folderTagsByPath.value = {}
    return
  }

  try {
    const res = await typedApi.getTagsInFoldersByPaths(paths)
    const next: Record<string, FolderBrowseTagChip[]> = {}
    for (const [path, rows] of Object.entries(res.data || {})) {
      const key = canonicalizeFolderTagPath(path)
      next[key] = (rows || []).map((row) => {
        const tag = (row as {tag?: {name?: string; color?: string | null}}).tag
        return {
          tagId: Number(row.tagId),
          name: String(tag?.name || row.tagId),
          color: tag?.color ?? null,
        }
      }).filter((row) => row.tagId && row.name)
    }
    folderTagsByPath.value = next
  } catch (error) {
    console.error(error)
  }
}

function buildCoverUrls(nextFolders: FolderBrowseTileModel[]) {
  const map: Record<number, string> = {}
  const typeById = coverMediaTypeById.value
  const mediaPath = appStore.mediaPath || ''
  for (const folder of nextFolders) {
    for (const id of folder.coverMediaIds || []) {
      const mediaTypeId = typeById[String(id)]
      const mediaType = mediaTypeId ? findMediaTypeById(appStore.mediaTypes, mediaTypeId) : null
      const assetFolder = getMediaDeleteAssetFolder(mediaType) || 'videos'
      const url = resolveMediaThumbDisplayUrl(
        mediaPath,
        assetFolder,
        id,
        'thumbs',
        {maxEdge: CARD_THUMB_MAX_EDGE},
      )
      if (url) map[id] = url
    }
  }
  coverUrlByMediaId.value = map
}

async function loadFolder() {
  if (!appStore.localhost || !appStore.is_app_ready) return

  loading.value = true
  try {
    const {data} = await typedApi.folderBrowse({
      path: pathFromQuery.value,
      mediaTypeId: mediaTypeId.value,
    })
    currentPath.value = data.currentPath ?? null
    writeFoldersPageState({libraryPath: currentPath.value})
    parentPath.value = data.parentPath ?? null
    breadcrumbs.value = Array.isArray(data.breadcrumbs) ? data.breadcrumbs : []
    folders.value = Array.isArray(data.folders) ? data.folders : []
    const nextMedia = (Array.isArray(data.media) ? data.media : []) as MediaItem[]
    media.value = nextMedia
    coverMediaTypeById.value = data.coverMediaTypeById || {}
    buildCoverUrls(folders.value)
    syncPlaylist(nextMedia)
    await reloadFolderTags()
  } catch (error) {
    console.error('Failed to browse library folders', error)
    currentPath.value = pathFromQuery.value
    parentPath.value = null
    breadcrumbs.value = []
    folders.value = []
    media.value = []
    syncPlaylist([])
  } finally {
    loading.value = false
  }
}

function onFolderContextMenu(event: MouseEvent, folderPath: string) {
  setFocus({kind: 'folder', path: folderPath})

  // In filesystem mode, select the clicked folder and show appropriate menu
  if (browseMode.value === 'filesystem') {
    const folderName = folderPath.split(/[/\\]/).filter(Boolean).pop() || folderPath
    fsSelection.selectFolder({path: folderPath, name: folderName, mediaCount: 0})
    if (!fsSelection.isSelectMode) {
      fsSelection.toggleSelectMode(true)
    }

    const selected = fsSelection.selectedEntries
    if (selected.length > 1) {
      const content: ContextMenuEntry[] = [
        {
          name: t('folders_browser.copy_names'),
          type: 'item',
          icon: 'content-copy',
          action: () => { void onCopyNames() },
        },
        {type: 'divider' as const},
        {
          name: t('folders_browser.copy_selected'),
          type: 'item',
          icon: 'content-copy',
          action: () => { void onCopySelectedTo() },
        },
        {
          name: t('folders_browser.move_selected'),
          type: 'item',
          icon: 'file-move-outline',
          action: () => { void onMoveSelectedTo() },
        },
        {type: 'divider' as const},
        {
          name: t('folders_browser.delete_selected'),
          type: 'item',
          icon: 'delete',
          color: 'error',
          action: () => { void onDeleteSelected() },
        },
      ]
      contextMenuStore.showContextMenu({
        content,
        x: event.clientX,
        y: event.clientY,
      })
      return
    }

    const content: ContextMenuEntry[] = [
      {
        name: t('folders_browser.open_folder'),
        type: 'item',
        icon: 'folder-open',
        action: () => navigateToFs(folderPath),
      },
      {type: 'divider' as const},
      {
        name: t('folders_browser.copy_names'),
        type: 'item',
        icon: 'content-copy',
        action: () => {
          const folderName = folderPath.split(/[/\\]/).filter(Boolean).pop() || folderPath
          void copyToClipboard(folderName, {successText: t('folders_browser.copy_names_done', {count: 1})})
        },
      },
      {
        name: t('context_menu.copy_path'),
        type: 'item',
        icon: 'content-copy',
        action: () => { void copyToClipboard(folderPath) },
      },
      {type: 'divider' as const},
      {
        name: t('folders_browser.delete_selected'),
        type: 'item',
        icon: 'delete',
        color: 'error',
        action: () => { void onDeleteSelected() },
      },
    ]
    contextMenuStore.showContextMenu({
      content,
      x: event.clientX,
      y: event.clientY,
    })
    return
  }

  // Library mode — original menu
  const content: ContextMenuEntry[] = [
    {
      name: t('folders_browser.open_folder'),
      type: 'item',
      icon: 'folder-open',
      action: () => navigateTo(folderPath),
    },
    {
      name: t('folders_browser.play_all'),
      type: 'item',
      icon: 'play',
      action: () => { void playAllInPath(folderPath) },
    },
    {type: 'divider' as const},
    {
      name: t('folders_browser.copy_names'),
      type: 'item',
      icon: 'content-copy',
      action: () => {
        const folderName = folderPath.split(/[/\\]/).filter(Boolean).pop() || folderPath
        void copyToClipboard(folderName, {successText: t('folders_browser.copy_names_done', {count: 1})})
      },
    },
    {
      name: t('context_menu.copy_path'),
      type: 'item',
      icon: 'content-copy',
      action: () => { void copyToClipboard(folderPath) },
    },
    {type: 'divider' as const},
    {
      name: t('media.adding.folder_tags_edit'),
      type: 'item',
      icon: 'tag-multiple-outline',
      action: () => openTagsForPath(folderPath),
    },
    {type: 'divider' as const},
    {
      name: t('folders_browser.reveal'),
      type: 'item',
      icon: 'folder-outline',
      action: () => revealPath(folderPath),
    },
    {type: 'divider' as const},
    {
      name: t('folders_browser.delete_folder'),
      type: 'item',
      icon: 'delete',
      color: 'error',
      action: () => { void deleteFolderWithConfirm(folderPath) },
    },
  ]
  contextMenuStore.showContextMenu({
    content,
    x: event.clientX,
    y: event.clientY,
  })
}

function onFsFileContextMenu(_event: MouseEvent, entry: FsBrowseEntry) {
  // Select the right-clicked entry
  fsSelection.selectFsFile(entry)
  if (!fsSelection.isSelectMode) {
    fsSelection.toggleSelectMode(true)
  }

  const selected = fsSelection.selectedEntries
  if (selected.length > 1) {
    const content: ContextMenuEntry[] = [
      {
        name: t('folders_browser.copy_names'),
        type: 'item',
        icon: 'content-copy',
        action: () => { void onCopyNames() },
      },
      {type: 'divider' as const},
      {
        name: t('folders_browser.copy_selected'),
        type: 'item',
        icon: 'content-copy',
        action: () => { void onCopySelectedTo() },
      },
      {
        name: t('folders_browser.move_selected'),
        type: 'item',
        icon: 'file-move-outline',
        action: () => { void onMoveSelectedTo() },
      },
      {type: 'divider' as const},
      {
        name: t('folders_browser.delete_selected'),
        type: 'item',
        icon: 'delete',
        color: 'error',
        action: () => { void onDeleteSelected() },
      },
    ]
    contextMenuStore.showContextMenu({
      content,
      x: _event.clientX,
      y: _event.clientY,
    })
    return
  }

  const content: ContextMenuEntry[] = [
    {
      name: t('context_menu.copy_path'),
      type: 'item',
      icon: 'content-copy',
      action: () => { void copyToClipboard(entry.path) },
    },
    {
      name: t('folders_browser.copy_names'),
      type: 'item',
      icon: 'content-copy',
      action: () => { void copyToClipboard(entry.name, {successText: t('folders_browser.copy_names_done', {count: 1})}) },
    },
    {type: 'divider' as const},
    {
      name: t('folders_browser.delete_selected'),
      type: 'item',
      icon: 'delete',
      color: 'error',
      action: () => { void onDeleteSelected() },
    },
  ]
  contextMenuStore.showContextMenu({
    content,
    x: _event.clientX,
    y: _event.clientY,
  })
}

function onToggleFolderSelect(folder: FolderBrowseTileModel) {
  fsSelection.toggleFolder(folder)
}

function onToggleFsFileSelect(entry: FsBrowseEntry) {
  fsSelection.toggleFsFile(entry)
}

async function onCopyNames() {
  const names = fsSelection.clipboardNames
  if (!names) return
  await copyToClipboard(names, {
    successText: t('folders_browser.copy_names_done', {count: fsSelection.selectedCount}),
  })
}

function selectAllAddableFiles() {
  const addable = fsFiles.value.filter((entry) => entry.addable)
  if (!addable.length) {
    setNotification({type: 'info', title: t('folders_browser.no_addable_files')})
    return
  }
  fsSelection.selectAllAddable(addable)
}

async function onDeleteSelected() {
  const entries = fsSelection.selectedEntries.map((e) => ({
    path: e.path,
    name: e.name,
  }))
  if (!entries.length) return

  dialogsStore.confirm.variant = 'delete'
  dialogsStore.confirm.checkBox = false
  dialogsStore.confirm.text = t('folders_browser.delete_selected_confirm', {count: entries.length})
  dialogsStore.confirm.action = async () => {
    await fsQueue.enqueue(
      {label: `Delete ${entries.length} items`, kind: 'delete', entryCount: entries.length},
      async () => {
        const {data} = await typedApi.deleteEntries(entries)
        const deleted = data.deleted?.length || 0
        const failed = data.failed?.length || 0
        if (deleted > 0) {
          setNotification({
            type: 'success',
            title: t('folders_browser.delete_selected_done', {count: deleted}),
          })
        }
        if (failed > 0) {
          setNotification({
            type: 'error',
            title: t('folders_browser.delete_selected_failed', {count: failed}),
          })
        }
        if (browseMode.value === 'filesystem' && currentFsPath.value) {
          await loadFsDirectory(currentFsPath.value)
        }
      },
    )
    fsSelection.clearSelection()
  }
  dialogsStore.confirm.show = true
}

async function doFsOperation(
  operation: 'copy' | 'move',
) {
  const entries = fsSelection.selectedEntries.map((e) => ({
    path: e.path,
    name: e.name,
  }))
  if (!entries.length) return

  // First try Electron native dialog
  try {
    const {getElectronOperable} = await import('@/services/electronBridge')
    const operable = getElectronOperable()
    if (operable?.showOpenDialog) {
      const result = await operable.showOpenDialog({
        properties: ['openDirectory'],
      })
      if (result?.canceled || !result?.filePaths?.length) return
      const destination = result.filePaths[0]
      await executeFsOperation(operation, entries, destination)
      return
    }
  } catch {
    // Electron dialog not available
  }

  // Fallback: built-in folder picker dialog
  folderPickerOperation.value = operation
  folderPickerEntries.value = entries
  folderPickerOpen.value = true
}

async function onFolderPickerConfirm(paths: string[]) {
  folderPickerOpen.value = false
  const destination = paths[0]
  if (!destination || !folderPickerEntries.value.length) return
  await executeFsOperation(folderPickerOperation.value, folderPickerEntries.value, destination)
  folderPickerEntries.value = []
}

async function executeFsOperation(
  operation: 'copy' | 'move',
  entries: {path: string; name: string}[],
  destination: string,
) {

  const opLabel = `${operation === 'copy' ? 'Copy' : 'Move'} ${entries.length} items to ${destination.split(/[/\\]/).pop() || destination}`
  const opKind = operation === 'copy' ? 'copy' as const : 'move' as const

  await fsQueue.enqueue(
    {label: opLabel, kind: opKind, entryCount: entries.length},
    async () => {
      if (operation === 'copy') {
        const {data} = await typedApi.copyEntries(entries, destination)
        const copied = data.copied?.length || 0
        const failed = data.failed?.length || 0
        if (copied > 0) {
          setNotification({type: 'success', title: `Copied ${copied} item(s)`})
        }
        if (failed > 0) {
          setNotification({type: 'error', title: `Failed to copy ${failed} item(s)`})
        }
      } else {
        const {data} = await typedApi.moveEntries(entries, destination)
        const moved = data.moved?.length || 0
        const failed = data.failed?.length || 0
        if (moved > 0) {
          setNotification({type: 'success', title: `Moved ${moved} item(s)`})
        }
        if (failed > 0) {
          setNotification({type: 'error', title: `Failed to move ${failed} item(s)`})
        }
      }
      if (browseMode.value === 'filesystem' && currentFsPath.value) {
        await loadFsDirectory(currentFsPath.value)
      }
    },
  )
  fsSelection.clearSelection()
}

function onCopySelectedTo() {
  void doFsOperation('copy')
}

function onMoveSelectedTo() {
  void doFsOperation('move')
}

function onMediaContextMenu(event: MouseEvent, item: MediaItem) {
  setFocus({kind: 'media', id: Number(item.id)})
  const {getContextMenu} = useItemContextMenu(item, 'media', null, true, null)
  contextMenuStore.showContextMenu({
    content: getContextMenu() as ContextMenuEntry[],
    x: event.clientX,
    y: event.clientY,
    targetItemId: item.id,
  })
}

async function openTagsForPath(folderPath: string) {
  contextTagsPath.value = folderPath
  await nextTick()
  contextTagsMenuOpen.value = true
  contextTagsActivator.value?.click()
}

async function deleteFolderWithConfirm(folderPath: string) {
  try {
    const filter = {
      id: null,
      active: true,
      lock: false,
      note: null,
      param: 'path',
      type: 'string',
      cond: 'under folder',
      val: folderPath,
    }

    const allIds: number[] = []
    const mediaTypesToCollect = mediaTypeId.value != null
      ? [mediaTypeId.value]
      : visibleMediaTypes.value.map((mt) => mt.id)

    for (const mtId of mediaTypesToCollect) {
      try {
        const {data} = await typedApi.getMediaIds({
          mediaTypeId: mtId,
          filters: [filter],
        })
        for (const rawId of data.ids || []) {
          const id = Number(rawId)
          if (Number.isFinite(id) && id > 0 && !allIds.includes(id)) {
            allIds.push(id)
          }
        }
      } catch (error) {
        console.error(`Failed to query media for type ${mtId}`, error)
      }
    }
    if (!allIds.length) {
      setNotification({
        type: 'info',
        title: t('folders_browser.delete_folder_empty'),
      })
      return
    }

    const count = allIds.length
    dialogsStore.confirm.variant = 'delete'
    dialogsStore.confirm.checkBox = false
    dialogsStore.confirm.checkBox2 = false
    dialogsStore.confirm.checkBoxText = t('actions.delete_permanently')
    dialogsStore.confirm.checkBox2Text = t('actions.also_delete_files')
    dialogsStore.confirm.checkBox2RequiresPrimary = true
    dialogsStore.confirm.text = t('folders_browser.delete_folder_confirm', {count, path: folderPath})
    dialogsStore.confirm.action = async () => {
      const permanent = Boolean(dialogsStore.confirm.checkBox)
      const withFile = Boolean(dialogsStore.confirm.checkBox2)
      await fsQueue.enqueue(
        {
          label: `Delete ${allIds.length} media from ${folderPath.split(/[/\\]/).pop() || folderPath}`,
          kind: 'delete',
          entryCount: allIds.length,
        },
        async () => {
          let deleted = 0
          for (const id of allIds) {
            try {
              await typedApi.deleteEntityOne('media', {
                id,
                with_file: withFile,
                permanent,
              })
              deleted += 1
            } catch (error) {
              console.error('Failed to delete media', id, error)
            }
          }
          setNotification({
            type: 'success',
            title: permanent
              ? t('folders_browser.delete_folder_done', {count: deleted})
              : t('notifications_text.items_moved_to_trash'),
          })
          await loadFolder()
        },
      )
    }
    dialogsStore.confirm.show = true
  } catch (error) {
    console.error('Failed to query folder media', error)
    setNotification({
      type: 'error',
      title: t('folders_browser.delete_folder_error'),
    })
  }
}

watch(
  () => [pathFromQuery.value, mediaTypeId.value, appStore.is_app_ready] as const,
  () => {
    if (browseMode.value === 'library') {
      void loadFolder()
    }
  },
  {immediate: true},
)

watch(browseMode, (mode) => {
  writeFoldersPageState({browseMode: mode})
  fsSelection.clearSelection()
  if (mode === 'filesystem') {
    fsSelection.toggleSelectMode(true)
    if (!places.value.length) {
      void loadPlaces()
    }
    if (currentFsPath.value) {
      void loadFsDirectory(currentFsPath.value)
    } else {
      // Default to home or first place
      void loadPlaces().then(() => {
        if (places.value.length && !currentFsPath.value) {
          const home = places.value.find((p) => p.id === 'home')
          const first = home || places.value[0]
          if (first) {
            navigateToFs(first.path)
          }
        }
      })
    }
  } else {
    fsSelection.toggleSelectMode(false)
  }
}, {immediate: true})

watch(listMode, (value) => {
  writeFoldersPageState({listMode: value})
  if (!value && browseMode.value === 'library') {
    itemsStore.view = 1
  }
})

watch(showHidden, () => {
  if (browseMode.value === 'filesystem' && currentFsPath.value) {
    void loadFsDirectory(currentFsPath.value)
  }
})

watch(uniqueFolderTagChips, (chips) => {
  if (tagFilterId.value != null && !chips.some((chip) => chip.tagId === tagFilterId.value)) {
    tagFilterId.value = null
  }
})

watch(visibleMedia, (items) => {
  syncPlaylist(items)
})

let resizeObserver: ResizeObserver | null = null
let pageResizeObserver: ResizeObserver | null = null

onMounted(() => {
  eventBus.on('folders:go-up', goUp)
  if (browseMode.value === 'library' && !pathFromQuery.value && savedFoldersPageState.libraryPath) {
    void router.replace({
      path: '/folders',
      query: {
        path: savedFoldersPageState.libraryPath,
        ...(mediaTypeId.value != null ? {mediaTypeId: String(mediaTypeId.value)} : {}),
      },
    })
  }
  syncClipboardBarBounds()
  window.addEventListener('resize', syncClipboardBarBounds)
  const pageElement = asDomElement(foldersPageRef.value)
  if (pageElement) {
    pageResizeObserver = new ResizeObserver(syncClipboardBarBounds)
    pageResizeObserver.observe(pageElement)
  }
  if (foldersGridRef.value && pageResizeObserver) {
    pageResizeObserver.observe(foldersGridRef.value)
  }
  eventBus.on('folders:open-path', navigateTo)
  eventBus.on('folders:open-tags', () => {
    if (currentPath.value) {
      currentTagsMenuOpen.value = true
      return
    }
    if (folders.value[0]) openTagsForPath(folders.value[0].path)
  })
  if (clipboardEntriesContainerRef.value) {
    resizeObserver = new ResizeObserver(() => {
      recalcClipboardOverflow()
    })
    resizeObserver.observe(clipboardEntriesContainerRef.value)
  }
})

watch(() => fsSelection.selectedEntries.length, () => {
  void nextTick().then(() => {
    syncClipboardBarBounds()
    recalcClipboardOverflow()
  })
})

watch(() => visibleFolders.value.length + visibleMedia.value.length + fsFiles.value.length, () => {
  void nextTick().then(syncClipboardBarBounds)
})

watch(browseMode, () => {
  void nextTick().then(recalcClipboardOverflow)
})

onBeforeUnmount(() => {
  eventBus.clearAll()
  clearFocus()
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (pageResizeObserver) {
    pageResizeObserver.disconnect()
    pageResizeObserver = null
  }
  window.removeEventListener('resize', syncClipboardBarBounds)
})
</script>

<style scoped>
.folders-page__nav {
  padding: 0 var(--deck-pad-x, 14px) 8px;
}

.folders-page__crumbs {
  flex: 1;
  padding-bottom: 2px;
}

.folders-page__filters {
  padding: 0 var(--deck-pad-x, 14px) 10px;
}

.folders-page__search {
  min-width: 120px;
  max-width: 200px;
  flex: 1 1 120px;
}

.folders-page__search :deep(.v-field) {
  --v-input-control-height: 36px;
}

.folders-page__search :deep(.v-field__input) {
  min-height: 36px !important;
  max-height: 36px;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  padding-inline: 10px 6px !important;
  align-items: center;
  font-size: 0.75rem !important;
  line-height: 1.2 !important;
}

.folders-page__search :deep(.v-field__prepend-inner) {
  padding-top: 0;
  align-self: center;
}

.folders-page__search :deep(.v-field__prepend-inner .v-icon) {
  font-size: 16px !important;
}

.folders-page__sort {
  min-width: 150px;
  max-width: 200px;
}

.folders-page__sort :deep(.v-field) {
  --v-input-control-height: 36px;
}

.folders-page__sort :deep(.v-field__input) {
  min-height: 36px !important;
  max-height: 36px;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  padding-inline: 10px 6px !important;
  align-items: center;
  font-size: 0.75rem !important;
  line-height: 1.2 !important;
}

.folders-page__sort :deep(.v-field__append-inner) {
  padding-top: 0;
  align-self: center;
}

.folders-page__sort :deep(.v-field__append-inner .v-icon) {
  font-size: 16px !important;
}

.folders-page__sort :deep(.v-select__selection) {
  font-size: 0.75rem;
  line-height: 1.2;
}

.folders-page__current-tags {
  padding: 0 var(--deck-pad-x, 14px) 10px;
}

.folders-page__appearance-section {
  border-top: 1px solid rgba(var(--v-theme-primary), 0.12);
  border-bottom: 1px solid rgba(var(--v-theme-primary), 0.12);
  margin-bottom: 8px;
}

.folders-page__appearance-deck {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px 14px;
  padding: 10px 14px;
  background: rgba(var(--v-theme-primary), 0.03);
}

.folders-page__appearance-deck :deep(.toolbar-appearance__deck-group) {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-width: 0;
}

.folders-page__appearance-deck :deep(.toolbar-appearance__deck-group + .toolbar-appearance__deck-group) {
  padding-left: 14px;
  border-left: 1px solid rgba(var(--v-theme-primary), 0.12);
}

.folders-page__appearance-deck :deep(.toolbar-appearance__deck-label) {
  font-size: 0.6875rem;
  font-weight: 400;
  letter-spacing: normal;
  text-transform: none;
  opacity: 0.55;
  padding-inline: 6px;
  line-height: 1.2;
}

.folders-page__appearance-deck :deep(.toolbar-appearance__deck-track),
.folders-page__appearance-deck :deep(.items-view-track) {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border-radius: 999px;
  background: rgba(var(--v-theme-surface), 0.9);
  border: 1px solid rgba(var(--v-theme-primary), 0.12);
}

.folders-page__appearance-deck :deep(.toolbar-appearance__deck-opt),
.folders-page__appearance-deck :deep(.items-view-opt) {
  appearance: none;
  border: 0;
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 28px;
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  background: transparent;
  color: rgba(var(--v-theme-primary), 0.72);
  font: inherit;
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease;
}

.folders-page__appearance-deck :deep(.toolbar-appearance__deck-opt:hover),
.folders-page__appearance-deck :deep(.items-view-opt:hover) {
  background: rgba(var(--v-theme-primary), 0.08);
  color: rgb(var(--v-theme-primary));
}

.folders-page__appearance-deck :deep(.toolbar-appearance__deck-opt--active),
.folders-page__appearance-deck :deep(.items-view-opt--active) {
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}

.folders-page__appearance-deck :deep(.toolbar-appearance__deck-opt--active:hover),
.folders-page__appearance-deck :deep(.items-view-opt--active:hover) {
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}

.folders-page__current-tags {
  padding: 0 var(--deck-pad-x, 14px) 10px;
}


.folders-page__status {
  padding: 32px 8px;
  text-align: center;
}

.folders-page__hidden-activator {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.folders-page__mode-track {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border-radius: 999px;
  background: rgba(var(--v-theme-surface), 0.9);
  border: 1px solid rgba(var(--v-theme-primary), 0.12);
}

.folders-page__mode-opt {
  appearance: none;
  border: 0;
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 28px;
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  background: transparent;
  color: rgba(var(--v-theme-primary), 0.72);
  font: inherit;
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease;
}

.folders-page__mode-opt:hover {
  background: rgba(var(--v-theme-primary), 0.08);
  color: rgb(var(--v-theme-primary));
}

.folders-page__mode-opt--active {
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}

.folders-page__mode-opt--active:hover {
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}

.folders-page__places {
  padding: 0 var(--deck-pad-x, 14px) 8px;
}

.folders-page__filter-check :deep(.v-label) {
  font-size: 0.75rem;
  opacity: 0.85;
}

/* Clipboard / Selection buffer bar */
.folders-page__clipboard-bar {
  position: fixed;
  box-sizing: border-box;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  width: calc(100% - 32px);
  max-width: var(--container-max-width, 1184px);
  z-index: 1005;
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-primary), 0.16);
  border-radius: 16px;
  box-shadow:
    0 1px 0 rgba(var(--v-theme-primary), 0.04),
    0 10px 30px -12px rgba(0, 0, 0, 0.28);
  padding: 0 16px;
}

.folders-page__clipboard-bar--bottom-nav {
  bottom: 72px;
}

.folders-page__clipboard-bar-inner {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 48px;
  max-height: 56px;
  overflow: hidden;
}

.folders-page__clipboard-bar-left {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  min-width: 0;
}

.folders-page__clipboard-bar-title {
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}

.folders-page__clipboard-bar-entries {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
  position: relative;
}

.folders-page__clipboard-entry--more {
  flex-shrink: 0;
  opacity: 0.7;
  font-weight: 600;
  position: sticky;
  right: 0;
  z-index: 1;
}

.folders-page__clipboard-entry--more-hidden {
  visibility: hidden;
}

.folders-page__clipboard-bar-empty {
  font-size: 0.7rem;
  color: rgba(var(--v-theme-on-surface), 0.4);
  white-space: nowrap;
}

.folders-page__clipboard-entry {
  flex-shrink: 0;
}

.folders-page__clipboard-bar-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.folders-page__clipboard-bar-divider {
  width: 1px;
  height: 20px;
  background: rgba(var(--v-theme-on-surface), 0.15);
  margin: 0 2px;
  flex-shrink: 0;
}

.folders-page__queue-bar {
  display: flex;
  align-items: center;
  padding: 2px 0 6px;
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-size: 0.65rem;
  line-height: 1;
}

.folders-page__queue-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
