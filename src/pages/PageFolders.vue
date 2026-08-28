<template>
  <v-container
    v-if="appStore.localhost && appStore.is_app_ready"
    class="folders-page items-layout-container"
  >
    <div
      ref="controlDeckSentinel"
      class="items-control-deck-sentinel"
      aria-hidden="true"
    />
    <div
      class="items-control-deck items-control-deck--browser folders-control-deck"
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

          <div class="items-page-header__title min-width-0">
            <div class="items-page-header__heading min-width-0">
              <v-icon class="items-page-header__icon" start>
                mdi-folder-outline
              </v-icon>
              <span class="items-page-header__name text-truncate">
                {{ pageTitle }}
              </span>
            </div>
            <div
              v-if="!loading && entryCount > 0"
              class="items-page-header__badges"
            >
              <span class="items-page-header__meta">
                {{ entryCount }}
              </span>
            </div>
          </div>

          <div class="d-flex align-center flex-nowrap ga-2 items-control-deck__controls">
            <div
              class="folders-page__mode-track"
              v-tooltip:top="t('folders_browser.presence_tooltip')"
            >
              <button
                v-for="option in presenceOptions"
                :key="option.value"
                type="button"
                class="folders-page__mode-opt"
                :class="{'folders-page__mode-opt--active': presenceFilter === option.value}"
                @click="presenceFilter = option.value"
              >
                <v-icon
                  size="14"
                  :icon="option.icon"
                />
                <span>{{ option.title }}</span>
                <span
                  v-if="option.value === 'new' && addablePendingCount > 0"
                  class="folders-page__mode-badge"
                >
                  {{ addablePendingCount }}
                </span>
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
            <div class="items-control-deck__appearance-close">
              <v-btn
                @click="showAppearancePanel = false"
                size="x-small"
                icon
                variant="text"
                color="primary"
                :aria-label="t('common.close')"
              >
                <v-icon size="16">mdi-close</v-icon>
              </v-btn>
            </div>
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
                    :class="{'items-view-opt--active': foldersViewMode === 'cards'}"
                    @click="foldersViewMode = 'cards'"
                  >
                    <v-icon size="15">mdi-view-module</v-icon>
                    <span>{{ t('folders_browser.view_cards') }}</span>
                  </button>
                  <button
                    type="button"
                    class="items-view-opt"
                    :class="{'items-view-opt--active': foldersViewMode === 'icons'}"
                    @click="foldersViewMode = 'icons'"
                  >
                    <v-icon size="15">mdi-view-grid-outline</v-icon>
                    <span>{{ t('folders_browser.view_icons') }}</span>
                  </button>
                  <button
                    type="button"
                    class="items-view-opt"
                    :class="{'items-view-opt--active': foldersViewMode === 'list'}"
                    @click="foldersViewMode = 'list'"
                  >
                    <v-icon size="15">mdi-view-list</v-icon>
                    <span>{{ t('folders_browser.view_list') }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </v-expand-transition>

        <div class="folders-page__explorer">
          <div class="folders-page__nav">
            <div class="folders-page__nav-cluster">
              <button
                type="button"
                class="folders-page__nav-btn"
                :disabled="!canGoBack"
                :aria-label="t('folders_browser.back')"
                @click="goHistoryBack"
              >
                <v-icon size="16" icon="mdi-arrow-left"/>
              </button>
              <button
                type="button"
                class="folders-page__nav-btn"
                :disabled="!canGoForward"
                :aria-label="t('folders_browser.forward')"
                @click="goHistoryForward"
              >
                <v-icon size="16" icon="mdi-arrow-right"/>
              </button>
              <button
                type="button"
                class="folders-page__nav-btn"
                :disabled="!canGoUp"
                :aria-label="t('folders_browser.up')"
                @click="goUp"
              >
                <v-icon size="16" icon="mdi-arrow-up"/>
              </button>
              <span
                class="folders-page__nav-divider"
                aria-hidden="true"
              />
              <v-menu
                location="bottom start"
                content-class="folders-page__more-menu folders-page__places-menu"
              >
                <template #activator="{props: menuProps}">
                  <button
                    v-bind="menuProps"
                    type="button"
                    class="folders-page__nav-btn"
                    :class="{'folders-page__nav-btn--on': Boolean(activePlaceId)}"
                    :aria-label="t('media.adding.browser_places')"
                    v-tooltip:top="t('media.adding.browser_places')"
                  >
                    <v-icon size="16" icon="mdi-dots-horizontal"/>
                  </button>
                </template>
                <v-list density="compact">
                  <v-list-item
                    prepend-icon="mdi-folder-home-outline"
                    :title="t('folders_browser.roots')"
                    :active="activePlaceId === LIBRARY_PLACE_ID"
                    slim
                    @click="onSelectPlace(null)"
                  />
                  <template v-if="places.length">
                    <v-divider class="my-1"/>
                    <v-list-item
                      v-for="place in places"
                      :key="place.id"
                      :prepend-icon="place.icon || 'mdi-folder'"
                      :title="placeLabel(place)"
                      :active="activePlaceId === place.id"
                      slim
                      @click="onSelectPlace(place.path)"
                    />
                  </template>
                </v-list>
              </v-menu>
            </div>

            <nav
              class="folders-page__path"
              :aria-label="t('navigation.folders')"
            >
              <template
                v-for="(crumb, index) in breadcrumbs"
                :key="crumb.path"
              >
                <v-icon
                  v-if="index > 0"
                  icon="mdi-chevron-right"
                  size="14"
                  class="folders-page__path-sep"
                />
                <button
                  type="button"
                  class="folders-page__path-seg"
                  :class="{'folders-page__path-seg--current': crumb.path === currentPath}"
                  :disabled="loading"
                  :title="crumb.path"
                  @click="navigateTo(crumb.path)"
                >
                  {{ crumb.name }}
                </button>
              </template>
            </nav>

            <div
              v-if="currentPath && currentFolderTags.length"
              class="folders-page__current-tags"
            >
              <span
                v-for="chip in currentFolderTags"
                :key="chip.tagId"
                class="folders-page__tag-pill"
                :style="chip.color ? {background: chip.color} : undefined"
              >
                {{ chip.name }}
              </span>
            </div>
          </div>
        </div>

        <div class="folders-page__toolbar">
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

          <div class="folders-page__filters">
            <div class="folders-page__chip-rail">
              <button
                type="button"
                class="folders-page__filter-chip"
                :class="{'folders-page__filter-chip--on': mediaTypeId == null}"
                @click="setMediaTypeFilter(null)"
              >
                {{ t('folders_browser.all_types') }}
              </button>
              <button
                v-for="mediaType in visibleMediaTypes"
                :key="mediaType.id"
                type="button"
                class="folders-page__filter-chip"
                :class="{'folders-page__filter-chip--on': mediaTypeId === mediaType.id}"
                @click="setMediaTypeFilter(mediaType.id)"
              >
                <v-icon
                  size="13"
                  :icon="`mdi-${mediaType.icon || 'file'}`"
                />
                <span>{{ mediaTypeTitle(mediaType) }}</span>
              </button>
            </div>

            <div
              v-if="uniqueFolderTagChips.length"
              class="folders-page__chip-rail folders-page__chip-rail--tags"
            >
              <button
                type="button"
                class="folders-page__filter-chip folders-page__filter-chip--tag"
                :class="{'folders-page__filter-chip--on': tagFilterId == null}"
                @click="tagFilterId = null"
              >
                <v-icon size="13" icon="mdi-tag-multiple-outline"/>
                <span>{{ t('folders_browser.all_tags') }}</span>
              </button>
              <button
                v-for="chip in uniqueFolderTagChips"
                :key="chip.tagId"
                type="button"
                class="folders-page__filter-chip folders-page__filter-chip--tag"
                :class="{'folders-page__filter-chip--on': tagFilterId === chip.tagId}"
                :style="chip.color && tagFilterId === chip.tagId
                  ? {'--chip-accent': chip.color}
                  : undefined"
                @click="tagFilterId = tagFilterId === chip.tagId ? null : chip.tagId"
              >
                {{ chip.name }}
              </button>
            </div>
          </div>

          <div class="folders-page__actions">
            <template v-if="currentPath">
              <v-btn
                size="small"
                variant="flat"
                color="success"
                rounded="xl"
                :icon="mdAndDown"
                :disabled="loading || !addablePendingCount"
                v-tooltip:top="addablePendingCount
                  ? t('folders_browser.add_to_library')
                  : t('folders_browser.no_addable_files')"
                @click="addCurrentFolder"
              >
                <v-icon
                  size="18"
                  :start="!mdAndDown"
                  icon="mdi-plus"
                />
                <span v-if="!mdAndDown">{{ t('folders_browser.add_new') }}</span>
                <span
                  v-if="!mdAndDown && addablePendingCount"
                  class="folders-page__cta-count"
                >
                  {{ addablePendingCount }}
                </span>
              </v-btn>
              <v-btn
                size="small"
                variant="tonal"
                rounded="xl"
                icon
                :disabled="loading"
                v-tooltip:top="t('folders_browser.new_folder')"
                @click="openCreateFolderDialog"
              >
                <v-icon size="18" icon="mdi-folder-plus-outline"/>
              </v-btn>
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
                    rounded="xl"
                    icon
                    v-tooltip:top="t('media.adding.folder_tags_edit')"
                  >
                    <v-icon size="18" icon="mdi-tag-multiple-outline"/>
                  </v-btn>
                </template>
              </FolderTagsMenu>
              <v-btn
                size="small"
                variant="tonal"
                color="primary"
                rounded="xl"
                icon
                v-tooltip:top="t('folders_browser.reveal')"
                @click="revealPath(currentPath)"
              >
                <v-icon size="18" icon="mdi-folder-open-outline"/>
              </v-btn>
              <v-btn
                size="small"
                variant="tonal"
                color="primary"
                rounded="xl"
                icon
                :disabled="!visibleMedia.length"
                v-tooltip:top="t('folders_browser.play_all')"
                @click="playAllInPath(currentPath)"
              >
                <v-icon size="18" icon="mdi-play"/>
              </v-btn>
            </template>
            <v-btn
              v-else
              size="small"
              variant="flat"
              color="success"
              rounded="xl"
              :icon="mdAndDown"
              v-tooltip:top="mdAndDown ? t('commandPalette.actions.add_media') : undefined"
              @click="openAddMedia"
            >
              <v-icon
                size="18"
                :start="!mdAndDown"
                icon="mdi-plus"
              />
              <span v-if="!mdAndDown">{{ t('commandPalette.actions.add_media') }}</span>
            </v-btn>
            <v-menu
              location="bottom end"
              content-class="folders-page__more-menu"
            >
              <template #activator="{props: menuProps}">
                <v-btn
                  v-bind="menuProps"
                  size="small"
                  :variant="showHidden ? 'tonal' : 'text'"
                  :color="showHidden ? 'primary' : undefined"
                  rounded="xl"
                  icon
                  v-tooltip:top="t('common.more')"
                >
                  <v-icon size="18" icon="mdi-dots-horizontal"/>
                </v-btn>
              </template>
              <v-list
                density="compact"
                class="folders-page__more-list"
              >
                <v-list-item
                  v-if="currentPath"
                  :prepend-icon="showHidden ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                  :title="t('folders_browser.show_hidden')"
                  :active="showHidden"
                  slim
                  @click="showHidden = !showHidden"
                />
                <v-list-item
                  prepend-icon="mdi-folder-multiple-outline"
                  :title="t('media.adding.folder_tags_manager_open')"
                  slim
                  @click="folderTagsManagerOpen = true"
                />
              </v-list>
            </v-menu>
          </div>
        </div>

        <v-progress-linear
          v-if="loading"
          indeterminate
          color="primary"
          height="2"
          class="folders-page__progress"
        />

        <v-alert
          v-if="fsError"
          type="error"
          variant="tonal"
          density="compact"
          rounded="lg"
          class="ma-2 text-caption"
        >
          {{ fsError }}
        </v-alert>

        <v-alert
          v-if="fsTruncated"
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
      v-if="!loading && !visibleFolders.length && !visibleMedia.length && !fsFiles.length && !missingMedia.length && !searchQuery && tagFilterId == null"
      class="folders-page__empty"
    >
      <div
        class="folders-page__empty-orb"
        aria-hidden="true"
      >
        <span class="folders-page__empty-glow"/>
        <v-icon
          size="44"
          :icon="presenceFilter === 'new'
            ? 'mdi-sparkles'
            : currentPath ? 'mdi-folder-open-outline' : 'mdi-folder-plus-outline'"
        />
      </div>
      <p class="folders-page__empty-copy">
        {{ presenceFilter === 'new'
          ? t('folders_browser.empty_new')
          : currentPath ? t('folders_browser.empty_folder') : t('folders_browser.empty_library') }}
      </p>
      <v-btn
        v-if="!currentPath"
        color="success"
        variant="flat"
        rounded="xl"
        prepend-icon="mdi-plus"
        @click="openAddMedia"
      >
        {{ t('commandPalette.actions.add_media') }}
      </v-btn>
      <v-btn
        v-else-if="currentPath"
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
      v-else-if="!loading && !visibleFolders.length && !visibleMedia.length && !fsFiles.length && !missingMedia.length && (searchQuery || tagFilterId != null)"
      class="folders-page__empty"
    >
      <div
        class="folders-page__empty-orb"
        aria-hidden="true"
      >
        <span class="folders-page__empty-glow"/>
        <v-icon
          size="44"
          icon="mdi-magnify"
        />
      </div>
      <p class="folders-page__empty-copy">
        {{ t('folders_browser.search_empty') }}
      </p>
    </div>

    <div
      v-else-if="visibleFolders.length || visibleMedia.length || fsFiles.length || missingMedia.length"
      class="items-page-grid items-virtual-grid"
    >
      <FoldersVirtualGrid
        :folders="visibleFolders"
        :media="visibleMedia"
        :fs-files="fsFiles"
        :missing-media="missingMedia"
        browse-mode="unified"
        :size="itemsStore.size"
        :gap-size="settingsStore.gapSize"
        :view-mode="foldersViewMode"
        :folder-tags="folderTagsByPath"
        :cover-url-by-media-id="coverUrlByMediaId"
        :reg="registrationStore.reg"
        :select-mode="itemsStore.isSelect"
        :selected-folder-paths="fsSelectionSelectedFolderPaths"
        :selected-fs-file-paths="fsSelectionSelectedFsFilePaths"
        :ingesting-paths="ingestingPaths"
        @open-folder="navigateTo($event)"
        @folder-contextmenu="onFolderContextMenu"
        @media-contextmenu="onMediaContextMenu"
        @fsfile-contextmenu="onFsFileContextMenu"
        @toggle-folder-select="onToggleFolderSelect"
        @toggle-fsfile-select="onToggleFsFileSelect"
        @add-fsfile="onAddPendingFile"
        @focus-fsfile="onFocusPendingFile"
        @tag-drop="onPendingTagDrop"
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

    <!-- Clipboard / Selection buffer — shares the bottom dock with the tag tray -->
    <Teleport
      defer
      :to="dockHost"
    >
      <div
        v-if="clipboardTotalCount > 0"
        class="floating-bottom-dock-lane folders-page__clipboard-bar"
        data-dock-order="clipboard"
      >
        <div class="floating-bottom-dock-lane__row">
          <div class="floating-bottom-dock-lane__left">
            <span
              class="floating-bottom-dock-lane__glyph"
              aria-hidden="true"
            >
              <v-icon size="16" icon="mdi-checkbox-multiple-marked-outline"/>
            </span>
            <span class="floating-bottom-dock-lane__title">{{ t('folders_browser.clipboard_title') }}</span>
            <v-chip
              size="x-small"
              color="primary"
              variant="tonal"
              label
              class="ml-2"
            >
              {{ t('folders_browser.selected_count', {count: clipboardTotalCount}) }}
            </v-chip>
          </div>
          <div ref="clipboardEntriesContainerRef" class="floating-bottom-dock-lane__entries">
            <span
              v-if="!clipboardTotalCount"
              class="floating-bottom-dock-lane__empty"
            >
              {{ t('folders_browser.clipboard_empty') }}
            </span>
            <template v-else>
              <v-chip
                v-for="entry in clipboardChips"
                :key="entry.key"
                size="x-small"
                variant="tonal"
                label
                class="folders-page__clipboard-entry"
                :prepend-icon="entry.icon"
                :title="entry.name"
              >
                <span class="folders-page__clipboard-entry-name">{{ entry.name }}</span>
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
          <div class="floating-bottom-dock-lane__actions">
            <v-btn
              size="x-small"
              variant="tonal"
              icon="mdi-content-copy"
              v-tooltip:top="t('folders_browser.copy_names')"
              @click="onCopyNames"
            />
            <v-btn
              size="x-small"
              variant="tonal"
              icon="mdi-plus"
              color="success"
              v-tooltip:top="t('folders_browser.add_selected')"
              :disabled="!selectedAddableCount"
              @click="addSelectedToLibrary"
            />
            <v-btn
              size="x-small"
              variant="tonal"
              icon="mdi-content-copy"
              v-tooltip:top="t('folders_browser.copy_selected')"
              :disabled="!fsSelection.selectedCount"
              @click="onCopySelectedTo"
            />
            <v-btn
              size="x-small"
              variant="tonal"
              icon="mdi-file-move-outline"
              v-tooltip:top="t('folders_browser.move_selected')"
              :disabled="!fsSelection.selectedCount"
              @click="onMoveSelectedTo"
            />
            <div class="floating-bottom-dock-lane__divider"/>
            <v-btn
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
              @click="clearClipboardSelection"
            />
          </div>
        </div>

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
    </Teleport>
  </v-container>
</template>

<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRoute, useRouter} from 'vue-router'
import {useDisplay} from 'vuetify'
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
import {useFsBrowseSelection} from '@/stores/fsBrowseSelection'
import {useFsOperationsQueue} from '@/stores/fsOperationsQueue'
import {useAppShell} from '@/composable/appShell'
import useItemContextMenu from '@/composable/ItemContextMenu'
import {useEventBus} from '@/utils/eventBus'
import {typedApi} from '@/services/typedApi'
import {setNotification} from '@/services/notificationService'
import {openPath} from '@/services/shellService'
import {copyToClipboard} from '@/utils/copyToClipboard'
import {recalcChipBarOverflow} from '@/utils/chipBarOverflow'
import {FLOATING_BOTTOM_DOCK_HOST} from '@/utils/floatingBottomDock'
import {
  canGoFolderHistoryBack,
  canGoFolderHistoryForward,
  canGoFolderUp,
  emptyFolderNavHistory,
  recordFolderNavPath,
  stepFolderNavHistory,
} from '@/utils/folderNavHistory'
import {getMediaTypeName} from '@/utils/mediaTypeI18n'
import {findMediaTypeById, getMediaDeleteAssetFolder, inferMediaTypeFromPaths, isVideoMediaType, parseMediaTypeExtensions} from '@/utils/mediaType'
import {CARD_THUMB_MAX_EDGE, resolveMediaThumbDisplayUrl} from '@/utils/thumbSource'
import {useItemsThumbPrefetch} from '@/composable/useItemsThumbPrefetch'
import {useMediaTagTransfer} from '@/composable/useMediaTagTransfer'
import {resolveOpenMediaKind} from '@/utils/openMediaKind'
import {openTextMedia} from '@/utils/openTextMedia'
import {
  canonicalizeFolderTagPath,
  filterAndSortFolderBrowse,
  folderTagLookupPaths,
  type FolderBrowseSort,
} from '@shared/libraryFolderBrowseUi'
import {
  filterUnifiedPendingFiles,
  folderBrowsePathKey,
  mergeUnifiedFolderBrowse,
  sortUnifiedPendingFiles,
  type PresenceFilter,
} from '@shared/unifiedFolderBrowse'
import type {MediaType} from '@/types/media'
import type {ContextMenuEntry, MediaItem} from '@/types/stores'
import type {FolderBrowseTagChip, FolderBrowseTileModel} from '@/components/folders/FolderBrowseTile.vue'
import type {BrowsePlace} from '@/services/typedApi/browse'
import type {FsBrowseEntry} from '@/components/folders/FsBrowseEntry'
import type {MediaTagDragPayload} from '@/utils/mediaTagDrag'
import {useTasksStore} from '@/stores/tasks'

type Breadcrumb = {
  path: string
  name: string
}

const {t} = useI18n()
const route = useRoute()
const router = useRouter()
const {mdAndDown} = useDisplay()
const appStore = useAppStore()
const itemsStore = useItemsStore()
const settingsStore = useSettingsStore()
const registrationStore = useRegistrationStore()
const contextMenuStore = useContextMenu()
const dialogsStore = useDialogsStore()
const tasksStore = useTasksStore()
const appShell = useAppShell()
const eventBus = useEventBus()
const {transferTagToMedia} = useMediaTagTransfer()
const {setFocus, clearFocus} = useFoldersBrowserFocus()
const fsSelection = useFsBrowseSelection()
const fsQueue = useFsOperationsQueue()

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

type FoldersViewMode = 'cards' | 'icons' | 'list'

type FoldersPageState = {
  presenceFilter?: PresenceFilter
  browseMode?: 'library' | 'filesystem'
  /** @deprecated prefer viewMode */
  listMode?: boolean
  viewMode?: FoldersViewMode
  path?: string | null
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

function resolveSavedViewMode(state: FoldersPageState): FoldersViewMode {
  if (state.viewMode === 'cards' || state.viewMode === 'icons' || state.viewMode === 'list') {
    return state.viewMode
  }
  return state.listMode === true ? 'list' : 'cards'
}

const savedFoldersPageState = readFoldersPageState()
const foldersViewMode = ref<FoldersViewMode>(resolveSavedViewMode(savedFoldersPageState))
const presenceFilter = ref<PresenceFilter>(
  savedFoldersPageState.presenceFilter === 'library' || savedFoldersPageState.presenceFilter === 'new'
    ? savedFoldersPageState.presenceFilter
    : 'all',
)
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
const ingestingPaths = ref(new Set<string>())

const showHidden = ref(false)
const places = ref<BrowsePlace[]>([])
const fsParentPath = ref<string | null>(null)
const fsRootPath = ref<string | null>(null)
const fsEntries = ref<FsBrowseEntry[]>([])
const pendingFiles = ref<FsBrowseEntry[]>([])
const missingMedia = ref<MediaItem[]>([])
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

const clipboardEntriesContainerRef = ref<HTMLElement | null>(null)
const clipboardOverflowCount = ref(0)
const dockHost = FLOATING_BOTTOM_DOCK_HOST

function recalcClipboardOverflow() {
  clipboardOverflowCount.value = recalcChipBarOverflow(clipboardEntriesContainerRef.value, {
    chipSelector: ':scope > .folders-page__clipboard-entry:not(.folders-page__clipboard-entry--more)',
    moreSelector: '.folders-page__clipboard-entry--more',
  })
}

const sizeLabels = ['XS', 'S', 'M', 'L', 'XL', 'XXL']

const sortOptions = computed(() => [
  {value: 'name-asc' as const, title: t('folders_browser.sort_name_asc')},
  {value: 'name-desc' as const, title: t('folders_browser.sort_name_desc')},
  {value: 'count' as const, title: t('folders_browser.sort_count')},
  {value: 'date' as const, title: t('folders_browser.sort_date')},
])

const presenceOptions = computed(() => [
  {value: 'all' as const, title: t('folders_browser.presence_all'), icon: 'mdi-folder-multiple-outline'},
  {value: 'library' as const, title: t('folders_browser.presence_library'), icon: 'mdi-bookshelf'},
  {value: 'new' as const, title: t('folders_browser.presence_new'), icon: 'mdi-file-outline'},
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

/** Extensions accepted by the active type filter, or every visible media type. */
const browseExtensions = computed(() => {
  if (mediaTypeId.value != null) {
    const mediaType = findMediaTypeById(appStore.mediaTypes, mediaTypeId.value)
    if (mediaType) return parseMediaTypeExtensions(mediaType.extensions).join(',')
  }
  return allMediaExtensions.value
})

const pathFromQuery = computed((): string | null => {
  const raw = route.query.path
  const value = Array.isArray(raw) ? raw[0] : raw
  if (value == null || value === '') return null
  return String(value)
})

const canGoUp = computed(() => canGoFolderUp({
  parentPath: parentPath.value,
  fsParentPath: fsParentPath.value,
  hasFsRoot: Boolean(fsRootPath.value),
  currentPath: currentPath.value,
}))
const folderHistory = ref(emptyFolderNavHistory())
let suppressFolderHistory = false

const canGoBack = computed(() => canGoFolderHistoryBack(folderHistory.value))
const canGoForward = computed(() => canGoFolderHistoryForward(folderHistory.value))

function recordFolderHistory(path: string | null) {
  if (suppressFolderHistory) {
    suppressFolderHistory = false
    return
  }
  folderHistory.value = recordFolderNavPath(folderHistory.value, path)
}

function goHistoryBack() {
  if (!canGoBack.value) return
  const stepped = stepFolderNavHistory(folderHistory.value, -1)
  if (!stepped) return
  suppressFolderHistory = true
  folderHistory.value = stepped.history
  navigateTo(stepped.path)
}

function goHistoryForward() {
  if (!canGoForward.value) return
  const stepped = stepFolderNavHistory(folderHistory.value, 1)
  if (!stepped) return
  suppressFolderHistory = true
  folderHistory.value = stepped.history
  navigateTo(stepped.path)
}

const fsFiles = computed(() => {
  const filteredPending = filterUnifiedPendingFiles(pendingFiles.value, searchQuery.value)
  return sortUnifiedPendingFiles(filteredPending, sort.value)
})

const addablePendingCount = computed(() =>
  pendingFiles.value.filter((entry) => entry.addable && !entry.inLibrary).length,
)

const selectedAddableCount = computed(() =>
  fsSelection.selectedEntries.filter((entry) => {
    if (entry.kind !== 'fs-file') return false
    return pendingFiles.value.some((file) => file.path === entry.path && file.addable)
  }).length,
)

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

const visibleFolders = computed(() => filtered.value.folders)

const visibleMedia = computed(() => filtered.value.media as MediaItem[])

const entryCount = computed(() =>
  visibleFolders.value.length
    + visibleMedia.value.length
    + fsFiles.value.length
    + missingMedia.value.length,
)

const pageTitle = computed(() => {
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

type ClipboardChip = {
  key: string
  name: string
  icon: string
}

function clipboardMediaLabel(item: MediaItem): string {
  if (item.basename) return String(item.basename)
  if (item.path) {
    const parts = String(item.path).split(/[/\\]/).filter(Boolean)
    return parts[parts.length - 1] || String(item.path)
  }
  return item.name || `#${item.id}`
}

const clipboardMediaById = computed(() => {
  const map = new Map<number, MediaItem>()
  for (const item of visibleMedia.value) map.set(Number(item.id), item)
  for (const item of (itemsStore.entities || []) as MediaItem[]) {
    const id = Number(item.id)
    if (!map.has(id)) map.set(id, item)
  }
  return map
})

const clipboardChips = computed<ClipboardChip[]>(() => {
  const chips: ClipboardChip[] = []
  for (const entry of fsSelection.selectedEntries) {
    chips.push({
      key: `fs:${entry.path}`,
      name: entry.name,
      icon: entry.kind === 'folder' ? 'mdi-folder-outline' : 'mdi-file-outline',
    })
  }
  for (const rawId of itemsStore.selection) {
    const id = Number(rawId)
    if (!Number.isFinite(id)) continue
    const item = clipboardMediaById.value.get(id)
    chips.push({
      key: `media:${id}`,
      name: item ? clipboardMediaLabel(item) : `#${id}`,
      icon: 'mdi-play-box-outline',
    })
  }
  return chips
})

const clipboardTotalCount = computed(() => clipboardChips.value.length)

function clearClipboardSelection() {
  fsSelection.clearSelection()
  itemsStore.selection = []
  itemsStore.selected_last = null
  itemsStore.selectionAnchor = null
}

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
  writeFoldersPageState({path, libraryPath: path, filesystemPath: path || undefined})
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
  if (!canGoUp.value) return
  if (fsRootPath.value) {
    if (fsParentPath.value) {
      navigateTo(fsParentPath.value)
      return
    }
    // Filesystem browse root → library folders list
    if (currentPath.value) {
      navigateTo(null)
    }
    return
  }
  const next = fsParentPath.value || parentPath.value
  if (!next) return
  navigateTo(next)
}

function openAddMedia() {
  appShell.showAddMediaDialog({
    browsePath: currentPath.value || undefined,
  })
}

function revealPath(folderPath: string) {
  void openPath(folderPath, true)
}

// Filesystem browse mode functions

const knownPlaceIds = new Set([
  'home', 'desktop', 'documents', 'downloads',
  'videos', 'pictures', 'music', 'computer', 'network',
])

const LIBRARY_PLACE_ID = 'library'

function placeLabel(place: BrowsePlace): string {
  if (knownPlaceIds.has(place.id)) {
    return t(`media.adding.place_${place.id}`)
  }
  return place.name || place.path
}

const activePlaceId = computed(() => {
  const current = currentPath.value
  if (!current) return LIBRARY_PLACE_ID
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

function onSelectPlace(path: string | null) {
  navigateTo(path)
}

function joinFsPath(parent: string, name: string) {
  const separator = parent.includes('\\') ? '\\' : '/'
  return parent.endsWith('/') || parent.endsWith('\\')
    ? `${parent}${name}`
    : `${parent}${separator}${name}`
}

function openCreateFolderDialog() {
  if (!currentPath.value) return
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
  const parent = currentPath.value
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
    await loadBrowse()
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

function addCurrentFolder() {
  const paths = pendingFiles.value.filter((entry) => entry.addable).map((entry) => entry.path)
  if (!paths.length) {
    setNotification({type: 'info', title: t('folders_browser.no_addable_files')})
    return
  }
  appShell.showAddMediaDialog({
    paths: paths.join('\n'),
    browsePath: currentPath.value || undefined,
  })
}

function addSelectedToLibrary() {
  const paths = fsSelection.selectedEntries
    .filter((entry) => entry.kind === 'fs-file')
    .filter((entry) => pendingFiles.value.some((file) => file.path === entry.path && file.addable))
    .map((entry) => entry.path)
  if (!paths.length) {
    setNotification({type: 'info', title: t('folders_browser.no_addable_files')})
    return
  }
  appShell.showAddMediaDialog({
    paths: paths.join('\n'),
    browsePath: currentPath.value || undefined,
  })
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
  // Card/icons grids need standard media view so Item hover/big preview work.
  // Folders list mode uses a custom list row, not itemsStore view 5.
  if (foldersViewMode.value !== 'list') {
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

async function applyLibraryBrowse(data: {
  currentPath?: string | null
  parentPath?: string | null
  breadcrumbs?: Breadcrumb[]
  folders?: FolderBrowseTileModel[]
  media?: MediaItem[]
  coverMediaTypeById?: Record<string, number>
}) {
  currentPath.value = data.currentPath ?? pathFromQuery.value
  writeFoldersPageState({
    path: currentPath.value,
    libraryPath: currentPath.value,
    filesystemPath: currentPath.value || undefined,
  })
  parentPath.value = data.parentPath ?? null
  breadcrumbs.value = Array.isArray(data.breadcrumbs) ? data.breadcrumbs : []
  folders.value = (Array.isArray(data.folders) ? data.folders : []).map((folder) => ({
    ...folder,
    newCount: folder.newCount || 0,
  }))
  media.value = (Array.isArray(data.media) ? data.media : []) as MediaItem[]
  coverMediaTypeById.value = data.coverMediaTypeById || {}
  buildCoverUrls(folders.value)
  syncPlaylist(media.value)
  await reloadFolderTags()
}

async function loadBrowse() {
  if (!appStore.localhost || !appStore.is_app_ready) return

  loading.value = true
  fsError.value = ''
  if (!places.value.length) void loadPlaces()

  try {
    const targetPath = pathFromQuery.value

    if (!targetPath) {
      fsEntries.value = []
      pendingFiles.value = []
      missingMedia.value = []
      fsParentPath.value = null
      fsRootPath.value = null
      fsTruncated.value = false
      try {
        const {data} = await typedApi.folderBrowse({
          path: null,
          mediaTypeId: mediaTypeId.value,
        })
        await applyLibraryBrowse(data)
        if (presenceFilter.value === 'new') {
          folders.value = []
          media.value = []
          pendingFiles.value = []
          syncPlaylist([])
        }
      } catch (error) {
        console.error('Failed to browse library folders', error)
        currentPath.value = null
        parentPath.value = null
        breadcrumbs.value = []
        folders.value = []
        media.value = []
        syncPlaylist([])
      }
      return
    }

  const [libraryResult, diskResult] = await Promise.allSettled([
    typedApi.folderBrowse({
      path: targetPath,
      mediaTypeId: mediaTypeId.value,
    }),
    typedApi.listBrowseDirectory({
      path: targetPath,
      extensions: browseExtensions.value,
      showHidden: showHidden.value,
    }),
  ])

  let libraryFolders: FolderBrowseTileModel[] = []
  let libraryMedia: MediaItem[] = []
  if (libraryResult.status === 'fulfilled') {
    await applyLibraryBrowse(libraryResult.value.data)
    libraryFolders = folders.value
    libraryMedia = media.value
  } else {
    console.error('Failed to browse library folders', libraryResult.reason)
    currentPath.value = targetPath
    parentPath.value = null
    breadcrumbs.value = []
    folders.value = []
    media.value = []
  }

  if (diskResult.status !== 'fulfilled') {
    const err = diskResult.reason as {response?: {data?: {message?: string}}; message?: string}
    fsError.value = err?.response?.data?.message || err?.message || t('folders_browser.browser_load_error')
    fsEntries.value = []
    pendingFiles.value = []
    missingMedia.value = []
    fsParentPath.value = null
    fsRootPath.value = null
    fsTruncated.value = false
    syncPlaylist(media.value)
    await reloadFolderTags()
    return
  }

  const disk = diskResult.value.data
  currentPath.value = disk.currentPath || targetPath
  writeFoldersPageState({
    path: currentPath.value,
    libraryPath: currentPath.value,
    filesystemPath: currentPath.value,
  })
  fsParentPath.value = disk.parentPath
  fsRootPath.value = disk.rootPath
  fsTruncated.value = disk.truncated
  if (disk.parentPath) parentPath.value = disk.parentPath

  const diskFolders: FsBrowseEntry[] = []
  const diskFiles: FsBrowseEntry[] = []
  for (const entry of disk.entries) {
    const fsEntry: FsBrowseEntry = {
      name: entry.name,
      path: entry.path,
      isDirectory: entry.isDirectory,
      size: entry.size,
      mtimeMs: entry.mtimeMs,
      extension: entry.extension,
      inLibrary: entry.inLibrary,
      addable: entry.addable,
      mediaId: entry.mediaId,
    }
    if (entry.isDirectory) diskFolders.push(fsEntry)
    else diskFiles.push(fsEntry)
  }
  fsEntries.value = [...diskFolders, ...diskFiles]

  if (disk.rootPath && disk.currentPath) {
    const separator = disk.rootPath.includes('\\') ? '\\' : '/'
    const relative = disk.currentPath === disk.rootPath
      ? ''
      : disk.currentPath.slice(disk.rootPath.length).replace(/^[/\\]+/, '')
    const parts = relative ? relative.split(/[/\\]/).filter(Boolean) : []
    const items: Breadcrumb[] = []
    let cursor = disk.rootPath
    items.push({
      name: cursor.replace(/[/\\]+$/, '').split(/[/\\]/).filter(Boolean).pop() || cursor,
      path: cursor,
    })
    for (const part of parts) {
      cursor = cursor.endsWith('/') || cursor.endsWith('\\')
        ? `${cursor}${part}`
        : `${cursor}${separator}${part}`
      items.push({name: part, path: cursor})
    }
    breadcrumbs.value = items
  }

  const merged = mergeUnifiedFolderBrowse({
    diskFolders,
    diskFiles,
    libraryFolders,
    libraryMedia,
    presence: presenceFilter.value,
    includeMissing: !disk.truncated,
  })

  folders.value = merged.folders
  const mediaById = new Map(libraryMedia.map((item) => [item.id, item]))
  const indexed: MediaItem[] = []
  const unresolvedIds: number[] = []
  for (const id of merged.mediaIds) {
    const item = mediaById.get(id)
    if (item) indexed.push(item)
    else unresolvedIds.push(id)
  }
  if (unresolvedIds.length) {
    try {
      const basics = await typedApi.getMediaBasics({ids: unresolvedIds})
      indexed.push(...((basics.data.items || []) as MediaItem[]))
    } catch (error) {
      console.error('Failed to load indexed media cards', error)
    }
  }
  media.value = indexed
  pendingFiles.value = merged.pending
  const missingIds = merged.missingMediaIds
  missingMedia.value = missingIds
    .map((id) => mediaById.get(id))
    .filter((item): item is MediaItem => Boolean(item))

  coverMediaTypeById.value = libraryResult.status === 'fulfilled'
    ? libraryResult.value.data.coverMediaTypeById || coverMediaTypeById.value
    : coverMediaTypeById.value
  buildCoverUrls(folders.value)
  syncPlaylist(media.value)
  await reloadFolderTags()
  } finally {
    loading.value = false
  }
}

function toggleFolderSelectFromMenu(folder: FolderBrowseTileModel) {
  if (!itemsStore.isSelect) {
    itemsStore.isSelect = true
  }
  fsSelection.toggleFolder(folder)
}

function folderSelectMenuEntry(
  folder: FolderBrowseTileModel,
  wasSelected: boolean,
): ContextMenuEntry {
  return {
    name: wasSelected ? t('appbar.buttons.unselect') : t('appbar.buttons.select'),
    icon: wasSelected ? 'checkbox-blank-outline' : 'checkbox-marked-outline',
    type: 'item',
    action: () => toggleFolderSelectFromMenu(folder),
  }
}

function onFolderContextMenu(event: MouseEvent, folderPath: string) {
  setFocus({kind: 'folder', path: folderPath})
  const folderName = folderPath.split(/[/\\]/).filter(Boolean).pop() || folderPath
  const folder: FolderBrowseTileModel = {path: folderPath, name: folderName, mediaCount: 0}
  const wasSelected = fsSelection.isSelected(folderPath)
  const contextEntries = [{path: folderPath, name: folderName}]

  const selected = fsSelection.selectedEntries
  if (itemsStore.isSelect && wasSelected && selected.length > 1) {
    const content: ContextMenuEntry[] = [
      {
        name: t('folders_browser.copy_names'),
        type: 'item',
        icon: 'content-copy',
        action: () => { void onCopyNames() },
      },
      {type: 'divider' as const},
      {
        name: t('folders_browser.add_selected'),
        type: 'item',
        icon: 'plus',
        action: () => addSelectedToLibrary(),
      },
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
      folderSelectMenuEntry(folder, wasSelected),
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
    {
      name: t('folders_browser.reveal'),
      type: 'item',
      icon: 'folder-outline',
      action: () => revealPath(folderPath),
    },
    {type: 'divider' as const},
    {
      name: t('folders_browser.copy_selected'),
      type: 'item',
      icon: 'content-copy',
      action: () => { void onCopySelectedTo(contextEntries) },
    },
    {
      name: t('folders_browser.move_selected'),
      type: 'item',
      icon: 'file-move-outline',
      action: () => { void onMoveSelectedTo(contextEntries) },
    },
    {type: 'divider' as const},
    folderSelectMenuEntry(folder, wasSelected),
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
  fsSelection.selectFsFile(entry)
  onFocusPendingFile(entry)

  const selected = fsSelection.selectedEntries
  if (selected.length > 1) {
    const content: ContextMenuEntry[] = [
      {
        name: t('folders_browser.add_selected'),
        type: 'item',
        icon: 'plus',
        action: () => addSelectedToLibrary(),
      },
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
      name: t('folders_browser.add_to_library'),
      type: 'item',
      icon: 'plus',
      action: () => { void ensurePendingAction(entry.path, 'add') },
    },
    {
      name: t('common.editing'),
      type: 'item',
      icon: 'pencil',
      action: () => { void ensurePendingAction(entry.path, 'edit') },
    },
    {
      name: t('common.play'),
      type: 'item',
      icon: 'play',
      action: () => { void ensurePendingAction(entry.path, 'play') },
    },
    {type: 'divider' as const},
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
}

function onFocusPendingFile(entry: FsBrowseEntry) {
  setFocus({
    kind: 'pending',
    path: entry.path,
    name: entry.name,
    size: entry.size,
    extension: entry.extension,
  })
  itemsStore.clearInspectorFocus()
}

function onAddPendingFile(entry: FsBrowseEntry) {
  void ensurePendingAction(entry.path, 'add')
}

function markIngesting(path: string, on: boolean) {
  const next = new Set(ingestingPaths.value)
  if (on) next.add(path)
  else next.delete(path)
  ingestingPaths.value = next
}

async function loadMediaItemById(id: number): Promise<MediaItem | null> {
  try {
    const basics = await typedApi.getMediaBasics({ids: [id]})
    const item = (basics.data.items || [])[0] as MediaItem | undefined
    return item || null
  } catch {
    return null
  }
}

function adoptIndexedFile(filePath: string, item: MediaItem) {
  pendingFiles.value = pendingFiles.value.filter((entry) => entry.path !== filePath)
  if (presenceFilter.value === 'new') {
    syncPlaylist(media.value)
    return
  }
  if (!media.value.some((row) => Number(row.id) === Number(item.id))) {
    media.value = [...media.value, item]
  }
  syncPlaylist(media.value)
}

async function parseTagsForSilentAdd(filePath: string, mediaId: number) {
  if (!tasksStore.mediaAdding.is_parsing) return
  try {
    const parseResponse = await typedApi.parsePathTags({
      paths: [{path: filePath, mediaId}],
    })
    const vals = parseResponse.data || []
    if (vals.length) await typedApi.postTagsInMedia(vals)
  } catch (error) {
    console.error('Failed to parse tags for silent add', error)
  }
}

async function ensureInLibrary(filePath: string): Promise<MediaItem | null> {
  const existing = media.value.find((item) => canonicalizeFolderTagPath(item.path) === canonicalizeFolderTagPath(filePath))
  if (existing) return existing

  const pending = pendingFiles.value.find((entry) => entry.path === filePath)
  if (pending?.mediaId) {
    return loadMediaItemById(pending.mediaId)
  }

  markIngesting(filePath, true)
  try {
    const mediaType = inferMediaTypeFromPaths([filePath], appStore.mediaTypes)
    const response = await typedApi.addMedia({
      path: filePath,
      type: mediaType || undefined,
      is_check_duplicates: Boolean(tasksStore.mediaAdding.is_check_duplicates),
    })
    if (response.status === 202) {
      const duplicateId = Number(response.data?.duplicate?.id)
      const duplicatePath = String(response.data?.duplicate?.path || '')
      setNotification({
        type: 'info',
        title: t('folders_browser.ensure_duplicate'),
      })
      const sameFile = Boolean(duplicatePath)
        && folderBrowsePathKey(duplicatePath) === folderBrowsePathKey(filePath)
      if (sameFile && Number.isFinite(duplicateId) && duplicateId > 0) {
        const item = await loadMediaItemById(duplicateId)
        if (item) adoptIndexedFile(filePath, item)
        return item
      }
      return null
    }
    const createdId = Number(response.data?.id)
    if (!Number.isFinite(createdId) || createdId <= 0) return null
    await parseTagsForSilentAdd(filePath, createdId)
    const item = await loadMediaItemById(createdId)
    if (!item) return null
    adoptIndexedFile(filePath, item)
    return item
  } catch (error) {
    console.error('Failed to add file to library', error)
    setNotification({
      type: 'error',
      title: t('folders_browser.ensure_failed'),
    })
    return null
  } finally {
    markIngesting(filePath, false)
  }
}

async function ensurePendingAction(filePath: string, action: 'add' | 'edit' | 'play') {
  const item = await ensureInLibrary(filePath)
  if (!item) return
  setFocus({kind: 'media', id: Number(item.id)})
  itemsStore.focusForInspector(item)
  if (action === 'edit') {
    const mediaType = findMediaTypeById(appStore.mediaTypes, item.mediaTypeId)
    dialogsStore.editMedia(item, mediaType ?? undefined)
    return
  }
  if (action === 'play') {
    const mediaType = findMediaTypeById(appStore.mediaTypes, item.mediaTypeId)
    const kind = resolveOpenMediaKind(mediaType, {missingAsPlay: true, path: item.path})
    if (kind === 'view-image') {
      itemsStore.viewImage({image: item})
      return
    }
    if (kind === 'preview-text' || kind === 'open-path') {
      openTextMedia(item)
      return
    }
    if (kind === 'play-av') {
      await itemsStore.playVideo({video: item, videos: [item, ...visibleMedia.value], player: 'default'})
    }
  }
}

async function onPendingTagDrop(
  entry: FsBrowseEntry,
  payload: MediaTagDragPayload,
  mode: 'copy' | 'move',
) {
  const item = await ensureInLibrary(entry.path)
  if (!item) return
  setFocus({kind: 'media', id: Number(item.id)})
  itemsStore.focusForInspector(item)
  const result = await transferTagToMedia(payload, Number(item.id), mode)
  if (result.ok) {
    setNotification({
      type: 'success',
      text: mode === 'move'
        ? t('items.tag_moved', {name: payload.name || ''})
        : t('items.tag_copied', {name: payload.name || ''}),
      filePath: item.path,
    })
    return
  }
  if (result.reason === 'already_had') {
    setNotification({
      type: 'info',
      text: t('items.tag_already_on_card', {name: payload.name || ''}),
      filePath: item.path,
    })
  }
}

function onToggleFolderSelect(folder: FolderBrowseTileModel) {
  fsSelection.toggleFolder(folder)
}

function onToggleFsFileSelect(entry: FsBrowseEntry) {
  fsSelection.toggleFsFile(entry)
}

async function onCopyNames() {
  const names = clipboardChips.value.map((chip) => chip.name).filter(Boolean)
  if (!names.length) return
  await copyToClipboard(names.join('\n'), {
    successText: t('folders_browser.copy_names_done', {count: names.length}),
  })
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
        await loadBrowse()
      },
    )
    fsSelection.clearSelection()
  }
  dialogsStore.confirm.show = true
}

async function doFsOperation(
  operation: 'copy' | 'move',
  entriesOverride?: {path: string; name: string}[],
) {
  const entries = entriesOverride ?? fsSelection.selectedEntries.map((e) => ({
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
      await loadBrowse()
    },
  )
  fsSelection.clearSelection()
}

function onCopySelectedTo(entries?: {path: string; name: string}[]) {
  void doFsOperation('copy', entries)
}

function onMoveSelectedTo(entries?: {path: string; name: string}[]) {
  void doFsOperation('move', entries)
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
          await loadBrowse()
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
  () => [pathFromQuery.value, mediaTypeId.value, appStore.is_app_ready, presenceFilter.value] as const,
  () => {
    writeFoldersPageState({presenceFilter: presenceFilter.value})
    void loadBrowse()
  },
  {immediate: true},
)

watch(foldersViewMode, (value) => {
  writeFoldersPageState({viewMode: value, listMode: value === 'list'})
  if (value !== 'list') {
    itemsStore.view = 1
  }
})

watch(showHidden, () => {
  if (currentPath.value) void loadBrowse()
})

watch(uniqueFolderTagChips, (chips) => {
  if (tagFilterId.value != null && !chips.some((chip) => chip.tagId === tagFilterId.value)) {
    tagFilterId.value = null
  }
})

watch(pathFromQuery, (path) => {
  recordFolderHistory(path)
}, {immediate: true})

watch(visibleMedia, (items) => {
  syncPlaylist(items)
})

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  eventBus.on('folders:go-up', goUp)
  eventBus.on('folders:history-back', goHistoryBack)
  eventBus.on('folders:history-forward', goHistoryForward)
  const restoredPath = savedFoldersPageState.path
    || savedFoldersPageState.libraryPath
    || savedFoldersPageState.filesystemPath
    || null
  if (!pathFromQuery.value && restoredPath) {
    // Keep the library-roots entry from the immediate path watch so Back works.
    void router.replace({
      path: '/folders',
      query: {
        path: restoredPath,
        ...(mediaTypeId.value != null ? {mediaTypeId: String(mediaTypeId.value)} : {}),
      },
    })
  }
  eventBus.on('folders:open-path', navigateTo)
  eventBus.on('folders:open-tags', () => {
    if (currentPath.value) {
      currentTagsMenuOpen.value = true
      return
    }
    if (folders.value[0]) openTagsForPath(folders.value[0].path)
  })
  eventBus.on('folders:pending-add', (filePath: string) => {
    void ensurePendingAction(filePath, 'add')
  })
  eventBus.on('folders:pending-edit', (filePath: string) => {
    void ensurePendingAction(filePath, 'edit')
  })
  eventBus.on('folders:pending-play', (filePath: string) => {
    void ensurePendingAction(filePath, 'play')
  })
  if (clipboardEntriesContainerRef.value) {
    resizeObserver = new ResizeObserver(() => {
      recalcClipboardOverflow()
    })
    resizeObserver.observe(clipboardEntriesContainerRef.value)
  }
})

watch(clipboardEntriesContainerRef, (el) => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (!el) return
  resizeObserver = new ResizeObserver(() => {
    recalcClipboardOverflow()
  })
  resizeObserver.observe(el)
  void nextTick().then(recalcClipboardOverflow)
})

watch(() => fsSelection.selectedEntries.length + itemsStore.selection.length, () => {
  void nextTick().then(recalcClipboardOverflow)
})

watch(() => itemsStore.isSelect, (enabled) => {
  if (!enabled) {
    fsSelection.clearSelection()
  }
})

watch(presenceFilter, () => {
  void nextTick().then(recalcClipboardOverflow)
})

onBeforeUnmount(() => {
  eventBus.clearAll()
  clearFocus()
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
})
</script>

<style scoped>
.folders-control-deck :deep(.items-control-deck__surface--card) {
  background:
    radial-gradient(120% 80% at 0% -20%, rgba(var(--v-theme-primary), 0.1), transparent 46%),
    rgb(var(--v-theme-surface));
}

.folders-page__explorer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px var(--deck-pad-x, 14px) 10px;
  border-top: 1px solid rgba(var(--v-theme-primary), 0.1);
  background: rgba(var(--v-theme-primary), 0.035);
}

.folders-page__nav {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.folders-page__nav-cluster {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  padding: 2px;
  border-radius: 12px;
  background: rgba(var(--v-theme-surface), 0.92);
  border: 1px solid rgba(var(--v-theme-primary), 0.14);
  box-shadow: 0 1px 0 rgba(var(--v-theme-on-surface), 0.04);
}

.folders-page__nav-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 28px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: rgb(var(--v-theme-primary));
  cursor: pointer;
  transition: background-color 140ms ease, color 140ms ease;
}

.folders-page__nav-btn .v-icon {
  color: inherit;
  opacity: 1;
}

.folders-page__nav-btn:hover:not(:disabled) {
  background: rgba(var(--v-theme-primary), 0.1);
}

.folders-page__nav-btn:focus-visible {
  outline: 2px solid rgba(var(--v-theme-primary), 0.45);
  outline-offset: -2px;
}

.folders-page__nav-btn:disabled {
  color: rgba(var(--v-theme-on-surface), 0.32);
  opacity: 1;
  cursor: default;
  pointer-events: none;
}

.folders-page__nav-btn--on {
  background: rgba(var(--v-theme-primary), 0.12);
}

.folders-page__nav-divider {
  width: 1px;
  height: 16px;
  margin: 0 2px;
  background: rgba(var(--v-theme-primary), 0.16);
  flex-shrink: 0;
}

.folders-page__path {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: thin;
  padding: 2px;
}

.folders-page__path-sep {
  flex-shrink: 0;
  color: rgba(var(--v-theme-on-surface), 0.32);
}

.folders-page__path-seg {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  max-width: 220px;
  height: 28px;
  margin: 0;
  padding: 0 10px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  transition: background-color 140ms ease, color 140ms ease;
}

.folders-page__path-seg:hover:not(:disabled) {
  background: rgba(var(--v-theme-primary), 0.08);
  color: rgb(var(--v-theme-primary));
}

.folders-page__path-seg:focus-visible {
  outline: 2px solid rgba(var(--v-theme-primary), 0.45);
  outline-offset: 0;
}

.folders-page__path-seg:disabled {
  opacity: 0.55;
  cursor: default;
}

.folders-page__path-seg--current {
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}

.folders-page__path-seg--current:hover:not(:disabled) {
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}

.folders-page__current-tags {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  max-width: 28%;
  overflow-x: auto;
  scrollbar-width: none;
}

.folders-page__tag-pill {
  display: inline-flex;
  align-items: center;
  max-width: 96px;
  height: 20px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(var(--v-theme-primary), 0.16);
  color: inherit;
  font-size: 0.65rem;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.folders-page__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px var(--deck-pad-x, 14px) 12px;
}

.folders-page__search {
  min-width: 80px;
  max-width: 200px;
  flex: 1 1 100px;
}

.folders-page__search :deep(.v-field) {
  --v-input-control-height: 36px;
}

.folders-page__search :deep(.v-field__outline) {
  --v-field-border-opacity: 0.18;
}

.folders-page__search :deep(.v-field) {
  background: rgba(var(--v-theme-on-surface), 0.03);
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

.folders-page__filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  flex: 1 1 220px;
  min-width: 0;
}

.folders-page__chip-rail {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  max-width: 100%;
  overflow-x: auto;
  scrollbar-width: thin;
}

.folders-page__filter-chip {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  height: 28px;
  margin: 0;
  padding: 0 10px;
  border: 1px solid rgba(var(--v-theme-primary), 0.12);
  border-radius: 999px;
  background: rgba(var(--v-theme-surface), 0.8);
  color: rgba(var(--v-theme-on-surface), 0.72);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease;
}

.folders-page__filter-chip:hover {
  border-color: rgba(var(--v-theme-primary), 0.28);
  color: rgb(var(--v-theme-primary));
}

.folders-page__filter-chip--on {
  background: var(--chip-accent, rgb(var(--v-theme-primary)));
  border-color: transparent;
  color: rgb(var(--v-theme-on-primary));
}

.folders-page__filter-chip--on:hover {
  background: var(--chip-accent, rgb(var(--v-theme-primary)));
  color: rgb(var(--v-theme-on-primary));
}

.folders-page__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  flex-shrink: 0;
}

.folders-page__cta-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  margin-left: 6px;
  padding: 0 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.22);
  font-size: 0.65rem;
  font-weight: 700;
  line-height: 1;
}

.folders-page__progress {
  margin: 0;
}

.folders-page__appearance-section {
  border-top: 1px solid rgba(var(--v-theme-primary), 0.12);
  border-bottom: 1px solid rgba(var(--v-theme-primary), 0.12);
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

.folders-page__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 56px 16px 48px;
  text-align: center;
}

.folders-page__empty-orb {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 88px;
  height: 88px;
  color: rgb(var(--v-theme-primary));
}

.folders-page__empty-glow {
  position: absolute;
  inset: 8px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(var(--v-theme-primary), 0.28), transparent 70%);
  filter: blur(2px);
  pointer-events: none;
}

.folders-page__empty-copy {
  max-width: 36rem;
  margin: 0;
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 0.9rem;
  line-height: 1.45;
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
  gap: 5px;
  min-width: 28px;
  height: 28px;
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

.folders-page__mode-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: rgba(var(--v-theme-on-primary), 0.22);
  font-size: 0.625rem;
  font-weight: 700;
  line-height: 1;
}

.folders-page__mode-opt:not(.folders-page__mode-opt--active) .folders-page__mode-badge {
  background: rgba(var(--v-theme-primary), 0.16);
  color: rgb(var(--v-theme-primary));
}

.folders-page__clipboard-entry {
  flex-shrink: 0;
  max-width: 160px;
  overflow: hidden;
}

.folders-page__clipboard-entry :deep(.v-chip__content) {
  min-width: 0;
  overflow: hidden;
}

.folders-page__clipboard-entry-name {
  display: block;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.folders-page__clipboard-entry.chip-bar-entry--overflow-hidden {
  display: none !important;
}

.folders-page__clipboard-entry--more {
  flex-shrink: 0;
  min-width: 2.25rem;
  justify-content: center;
  font-weight: 600;
}

.folders-page__clipboard-entry--more-hidden {
  display: none !important;
}

.folders-page__clipboard-entry--more.chip-bar-entry--more-measure {
  display: inline-flex !important;
  position: absolute;
  visibility: hidden;
  pointer-events: none;
}

.folders-page__queue-bar {
  display: flex;
  align-items: center;
  padding: 2px 0 8px;
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-size: 0.65rem;
  line-height: 1;
}

.folders-page__queue-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 959px) {
  .folders-page__mode-opt span:not(.folders-page__mode-badge) {
    display: none;
  }

  .folders-page__mode-opt {
    padding: 0 8px;
  }

  .folders-page__current-tags {
    display: none;
  }

  /* Media-type chips: icon only; "All" keeps its label (no span). */
  .folders-page__chip-rail:not(.folders-page__chip-rail--tags) .folders-page__filter-chip > span {
    display: none;
  }

  .folders-page__chip-rail:not(.folders-page__chip-rail--tags) .folders-page__filter-chip:has(> .v-icon) {
    padding: 0 8px;
  }
}

/* Phone only: search on its own row; filters + actions stay on the second. */
@media (max-width: 599px) {
  .folders-page__search {
    max-width: none;
    flex: 1 1 100%;
  }

  .folders-page__filters {
    flex: 1 1 0;
    min-width: 0;
  }

  .folders-page__actions {
    margin-left: auto;
    flex-shrink: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .folders-page__nav-btn,
  .folders-page__path-seg,
  .folders-page__filter-chip,
  .folders-page__mode-opt {
    transition: none;
  }
}
</style>

<style>
.folders-page__more-menu {
  min-width: 0 !important;
}

.folders-page__more-menu .v-list {
  padding: 4px !important;
}

.folders-page__more-menu .v-list-item {
  min-height: 32px !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  padding-inline: 8px 10px !important;
}

.folders-page__more-menu .v-list-item__prepend {
  margin-inline-end: 8px !important;
}

.folders-page__more-menu .v-list-item__prepend > .v-icon {
  font-size: 16px !important;
}

.folders-page__more-menu .v-list-item__prepend .v-list-item__spacer {
  width: 8px !important;
}

.folders-page__more-menu .v-list-item-title {
  font-size: 0.75rem !important;
  line-height: 1.2 !important;
}

.folders-page__places-menu .v-list {
  max-height: min(360px, 50vh);
  overflow-y: auto;
}
</style>

