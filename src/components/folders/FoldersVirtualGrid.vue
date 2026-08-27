<template>
  <div
    ref="layoutRef"
    class="folders-virtual-grid items-virtual-grid"
    :class="{
      'folders-virtual-grid--list': isList,
      'folders-virtual-grid--icons': isIcons,
    }"
    :style="gridContainerStyle"
  >
    <div
      class="virtual-grid-spacer"
      :style="{ height: `${topSpacer}px` }"
      aria-hidden="true"
    />

    <div
      v-for="row in visibleRows"
      :key="row.startIndex"
      class="virtual-grid-row"
      :class="isList ? 'folders-virtual-grid__list-row' : 'card-grid folders-virtual-grid__row'"
      :style="rowStyle"
    >
      <template
        v-for="entry in row.items"
        :key="entry.key"
      >
        <FolderBrowseTile
          v-if="entry.kind === 'folder'"
          class="folders-virtual-grid__cell folders-virtual-grid__cell--folder"
          :folder="entry.folder"
          :cover-urls="coverUrlsFor(entry.folder)"
          :tags="tagsFor(entry.folder.path)"
          :focused="isFolderFocused(entry.folder.path)"
          :list="isList"
          :icons="isIcons"
          :compact="isFilesystemCompact"
          :select-mode="selectMode"
          :selected="isFolderSelected(entry.folder.path)"
          @open="emit('open-folder', $event)"
          @contextmenu="(event, path) => emit('folder-contextmenu', event, path)"
          @toggle-select="emit('toggle-folder-select', $event)"
        />
        <div
          v-else-if="entry.kind === 'fs-file'"
          class="folders-virtual-grid__cell folders-virtual-grid__cell--pending"
          :class="{
            'folders-virtual-grid__cell--list': isList,
            'folders-virtual-grid__cell--icons': isIcons,
          }"
        >
          <FolderPendingTile
            :entry="entry.entry"
            :list="isList"
            :icons="isIcons"
            :select-mode="selectMode"
            :selected="isFsFileSelected(entry.entry.path)"
            :focused="isPendingFocused(entry.entry.path)"
            :ingesting="isIngesting(entry.entry.path)"
            @contextmenu="(event, e) => emit('fsfile-contextmenu', event, e)"
            @toggle-select="emit('toggle-fsfile-select', $event)"
            @add="emit('add-fsfile', $event)"
            @focus="emit('focus-fsfile', $event)"
            @tag-drop="(entry, payload, mode) => emit('tag-drop', entry, payload, mode)"
          />
        </div>
        <div
          v-else-if="entry.kind === 'missing'"
          class="folders-virtual-grid__cell folders-virtual-grid__cell--missing"
          :class="{'folders-virtual-grid__cell--list': isList}"
          :data-item-id="entry.item.id"
          @contextmenu.prevent.stop="emit('media-contextmenu', $event, entry.item)"
        >
          <button
            type="button"
            class="folder-missing-row"
            @click="onMediaClick(entry.item)"
          >
            <v-icon size="18" color="error" icon="mdi-file-alert-outline"/>
            <span class="folder-missing-row__name">{{ mediaTitle(entry.item) }}</span>
            <span class="folder-missing-row__chip">{{ t('folders_browser.missing_on_disk') }}</span>
          </button>
        </div>
        <div
          v-else
          class="folders-virtual-grid__cell folders-virtual-grid__cell--media"
          :class="{
            item: !isCards,
            'item--selecting': selectMode,
            'item--inspector-focused': isInspectorFocused(entry.item),
            'item--keyboard-cursor': isMediaFocused(entry.item),
            'folders-virtual-grid__cell--list': isList,
            'folders-virtual-grid__cell--icons': isIcons,
          }"
          :data-item-id="entry.item.id"
          @contextmenu.prevent.stop="onMediaCellContextMenu($event, entry.item)"
        >
          <Item
            v-if="isCards"
            class="folders-virtual-grid__media-item"
            type="media"
            :item="entry.item"
            :media-type="resolveMediaType(entry.item.mediaTypeId)"
            :reg="reg"
            prefer-filename
            eager-preview
          />
          <button
            v-else-if="isIcons"
            type="button"
            class="folder-browse-tile folder-browse-tile--icons"
            @click="onMediaClick(entry.item)"
            :data-item-id="entry.item.id"
          >
            <div
              class="folder-browse-tile__preview"
              :class="{'folder-browse-tile__preview--media-thumb': Boolean(mediaThumb(entry.item))}"
            >
              <img
                v-if="mediaThumb(entry.item)"
                :src="mediaThumb(entry.item) || undefined"
                alt=""
                class="folder-browse-tile__cover folder-browse-tile__cover--icons"
                :style="mediaIconThumbStyle(entry.item)"
              >
              <v-icon
                v-else
                :icon="`mdi-${mediaTypeIcon(entry.item.mediaTypeId)}`"
                :size="'var(--folder-icon-size, 88px)'"
                color="primary"
              />
            </div>
            <div class="folder-browse-tile__body">
              <div class="folder-browse-tile__name">
                {{ mediaTitle(entry.item) }}
              </div>
              <div
                v-if="mediaSecondary(entry.item)"
                class="folder-browse-tile__meta folder-browse-tile__meta--icons"
              >
                <span class="folder-browse-tile__objects">
                  {{ mediaSecondary(entry.item) }}
                </span>
              </div>
            </div>
          </button>
          <button
            v-else
            type="button"
            class="folder-browse-tile folder-browse-tile--list"
            @click="onMediaClick(entry.item)"
            :data-item-id="entry.item.id"
          >
            <div class="folder-browse-tile__preview">
              <img
                v-if="mediaThumb(entry.item)"
                :src="mediaThumb(entry.item) || undefined"
                alt=""
                class="folder-browse-tile__cover"
              >
              <v-icon
                v-else
                icon="mdi-file-video-outline"
                :size="20"
                color="primary"
              />
            </div>
            <div class="folder-browse-tile__body">
              <div class="folder-browse-tile__name">
                {{ mediaTitle(entry.item) }}
              </div>
              <div
                v-if="entry.item.mediaTypeId"
                class="folder-browse-tile__meta"
              >
                <span
                  class="folder-browse-tile__media-type"
                  :title="resolveMediaTypeName(entry.item.mediaTypeId)"
                >
                  <v-icon size="14">mdi-{{ mediaTypeIcon(entry.item.mediaTypeId) }}</v-icon>
                </span>
              </div>
            </div>
          </button>
          <div
            v-if="!isCards && selectMode"
            class="item-select-overlay"
            :class="{ 'item-select-overlay--selected': isSelected(entry.item) }"
            @click.stop="toggleSelect(entry.item, $event)"
          >
            <button
              type="button"
              class="item-select-btn"
              :class="{'item-select-btn--on': isSelected(entry.item)}"
              :aria-pressed="isSelected(entry.item)"
              :aria-label="isSelected(entry.item)
                ? t('appbar.buttons.unselect')
                : t('appbar.buttons.select')"
              tabindex="-1"
            >
              <v-icon
                size="18"
                :icon="isSelected(entry.item) ? 'mdi-check' : 'mdi-plus'"
              />
            </button>
          </div>
        </div>
      </template>
    </div>

    <div
      class="virtual-grid-spacer"
      :style="{ height: `${bottomSpacer}px` }"
      aria-hidden="true"
    />
  </div>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from 'vue'
import path from 'path-browserify'
import {useI18n} from 'vue-i18n'
import FolderBrowseTile, {
  type FolderBrowseTagChip,
  type FolderBrowseTileModel,
} from '@/components/folders/FolderBrowseTile.vue'
import type {FsBrowseEntry} from '@/components/folders/FsBrowseEntry'
import FolderPendingTile from '@/components/folders/FolderPendingTile.vue'
import Item from '@/components/items/Item.vue'
import type {MediaTagDragPayload} from '@/utils/mediaTagDrag'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useFoldersBrowserFocus} from '@/composable/useFoldersBrowserFocus'
import {useResponsiveGridLayout} from '@/composable/useResponsiveGridLayout'
import {useVirtualGridWindow} from '@/composable/useVirtualGridWindow'
import {setVisibleItemIds, clearVisibleItemIds} from '@/utils/visibleItemsWindow'
import {getMediaDeleteAssetFolder, isVideoMediaType, isImageMediaType} from '@/utils/mediaType'
import {CARD_THUMB_MAX_EDGE, resolveMediaThumbDisplayUrl} from '@/utils/thumbSource'
import {getReadableDuration} from '@/services/formatUtils'
import {
  estimateRowHeight,
  getCardDescriptionHeight,
  getGridGap,
  LIST_ROW_HEIGHT,
  type GridLayoutOptions,
} from '@/utils/gridLayout'
import type {MediaType} from '@/types/media'
import type {MediaItem} from '@/types/stores'

export type FoldersViewMode = 'cards' | 'icons' | 'list'

type FolderBrowseEntry =
  | {kind: 'folder'; key: string; folder: FolderBrowseTileModel}
  | {kind: 'media'; key: string; item: MediaItem}
  | {kind: 'fs-file'; key: string; entry: FsBrowseEntry}
  | {kind: 'missing'; key: string; item: MediaItem}

const ICON_ROW_HEIGHT: Record<number, number> = {
  1: 128,
  2: 144,
  3: 160,
  4: 176,
  5: 196,
  6: 216,
}

const ICON_GLYPH_SIZE: Record<number, number> = {
  1: 64,
  2: 72,
  3: 88,
  4: 104,
  5: 120,
  6: 136,
}

const props = withDefaults(defineProps<{
  folders?: FolderBrowseTileModel[]
  media?: MediaItem[]
  fsFiles?: FsBrowseEntry[]
  missingMedia?: MediaItem[]
  browseMode?: 'library' | 'filesystem' | 'unified'
  ingestingPaths?: Set<string>
  size?: number | string
  gapSize?: string
  viewMode?: FoldersViewMode
  /** @deprecated use viewMode */
  list?: boolean
  folderTags?: Record<string, FolderBrowseTagChip[]>
  coverUrlByMediaId?: Record<number, string>
  reg?: boolean
  selectMode?: boolean
  selectedFolderPaths?: Set<string>
  selectedFsFilePaths?: Set<string>
}>(), {
  folders: () => [],
  media: () => [],
  fsFiles: () => [],
  missingMedia: () => [],
  browseMode: 'unified',
  ingestingPaths: () => new Set<string>(),
  size: 3,
  gapSize: 'default',
  viewMode: undefined,
  list: false,
  folderTags: () => ({}),
  coverUrlByMediaId: () => ({}),
  reg: true,
  selectMode: false,
  selectedFolderPaths: () => new Set(),
  selectedFsFilePaths: () => new Set(),
})

const emit = defineEmits<{
  'open-folder': [path: string]
  'folder-contextmenu': [event: MouseEvent, path: string]
  'media-contextmenu': [event: MouseEvent, item: MediaItem]
  'toggle-folder-select': [folder: FolderBrowseTileModel]
  'fsfile-contextmenu': [event: MouseEvent, entry: FsBrowseEntry]
  'toggle-fsfile-select': [entry: FsBrowseEntry]
  'add-fsfile': [entry: FsBrowseEntry]
  'focus-fsfile': [entry: FsBrowseEntry]
  'tag-drop': [entry: FsBrowseEntry, payload: MediaTagDragPayload, mode: 'copy' | 'move']
}>()

const {t} = useI18n()
const appStore = useAppStore()
const itemsStore = useItemsStore()
const {focused, setFocus} = useFoldersBrowserFocus()
const layoutRef = ref<HTMLElement | null>(null)

const resolvedViewMode = computed<FoldersViewMode>(() => {
  if (props.viewMode === 'cards' || props.viewMode === 'icons' || props.viewMode === 'list') {
    return props.viewMode
  }
  return props.list ? 'list' : 'cards'
})
const isList = computed(() => resolvedViewMode.value === 'list')
const isIcons = computed(() => resolvedViewMode.value === 'icons')
const isCards = computed(() => resolvedViewMode.value === 'cards')
const isFilesystemCompact = computed(() => false)

const entriesSource = computed((): FolderBrowseEntry[] => {
  const folders = (props.folders || []).map((folder) => ({
    kind: 'folder' as const,
    key: `folder:${folder.path}`,
    folder,
  }))
  const media = (props.media || []).map((item) => ({
    kind: 'media' as const,
    key: `file:${String(item.path || item.id)}`,
    item,
  }))
  const fsFiles = (props.fsFiles || []).map((entry) => ({
    kind: 'fs-file' as const,
    key: `file:${entry.path}`,
    entry,
  }))
  const missing = (props.missingMedia || []).map((item) => ({
    kind: 'missing' as const,
    key: `missing:${item.id}`,
    item,
  }))
  return [...folders, ...media, ...fsFiles, ...missing]
})

const sizeNumber = computed(() => {
  const size = Number(props.size)
  return Number.isFinite(size) && size >= 1 && size <= 6 ? size : 3
})

const resolvedLayoutOptions = computed<GridLayoutOptions>(() => ({
  size: isList.value ? 3 : sizeNumber.value,
  gapSize: isList.value ? 'compact' : (props.gapSize || 'default'),
  listGrid: isList.value,
}))

const {gridStyle, containerWidth} = useResponsiveGridLayout(layoutRef, resolvedLayoutOptions)

const folderCardLayout = computed(() => {
  const size = sizeNumber.value
  if (isList.value) {
    const listCardHeight = LIST_ROW_HEIGHT[size] || LIST_ROW_HEIGHT[3]
    return {
      size,
      gapSize: 'compact' as const,
      cardHeight: listCardHeight,
      rowStride: listCardHeight + getGridGap('compact').y,
    }
  }
  const gapSize = props.gapSize || 'default'
  const width = containerWidth.value || 0
  if (isIcons.value) {
    const iconHeight = ICON_ROW_HEIGHT[size] || ICON_ROW_HEIGHT[3]
    return {
      size,
      gapSize,
      cardHeight: iconHeight,
      rowStride: iconHeight + getGridGap(gapSize).y,
    }
  }

  const rowStride = estimateRowHeight({
    size,
    gapSize,
    containerWidth: width,
    imageAspectRatio: 16 / 9,
  })
  const cardHeight = Math.max(
    1,
    rowStride - getGridGap(gapSize).y,
  )
  return {
    size,
    gapSize,
    cardHeight,
    rowStride,
  }
})

const layoutOptions = computed(() => ({
  size: folderCardLayout.value.size,
  gapSize: folderCardLayout.value.gapSize,
  imageGrid: false,
  wideImage: false,
  lineGrid: false,
  listGrid: isList.value,
  chipsGrid: false,
  lockRowHeight: true,
  rowHeightOverride: folderCardLayout.value.rowStride,
}))

const {
  visibleRows,
  topSpacer,
  bottomSpacer,
} = useVirtualGridWindow(entriesSource, layoutRef, layoutOptions)

const rowStyle = computed(() => ({
  minHeight: `${folderCardLayout.value.cardHeight}px`,
}))

const LIST_FONT_SIZES: Record<number, number> = { 1: 12, 2: 12.5, 3: 13, 4: 14, 5: 15, 6: 16 }
const CARD_FONT_SIZES: Record<number, string> = {
  1: '0.78rem',
  2: '0.9rem',
  3: '1rem',
  4: '1.08rem',
  5: '1.16rem',
  6: '1.24rem',
}

const gridContainerStyle = computed(() => {
  const cardHeight = folderCardLayout.value.cardHeight
  const previewWidth = Math.round(cardHeight * 1.17)
  const bodyMin = isList.value || isIcons.value
    ? 0
    : getCardDescriptionHeight(sizeNumber.value)
  return {
    ...gridStyle.value,
    '--list-card-height': `${cardHeight}px`,
    '--list-preview-width': `${previewWidth}px`,
    '--list-font-size': `${LIST_FONT_SIZES[sizeNumber.value] || LIST_FONT_SIZES[3]}px`,
    '--folder-card-body-min': `${bodyMin}px`,
    '--folder-card-font-size': CARD_FONT_SIZES[sizeNumber.value] || CARD_FONT_SIZES[3],
    '--folder-icon-size': `${ICON_GLYPH_SIZE[sizeNumber.value] || ICON_GLYPH_SIZE[3]}px`,
  }
})

watch(
  visibleRows,
  (rows) => {
    setVisibleItemIds(rows.flatMap((row) =>
      row.items
        .filter((entry): entry is Extract<FolderBrowseEntry, {kind: 'media'}> => entry.kind === 'media')
        .map((entry) => entry.item.id),
    ))
  },
  {immediate: true},
)

onBeforeUnmount(() => {
  clearVisibleItemIds()
})

function resolveMediaType(id: number | null | undefined): MediaType | null {
  if (id == null) return null
  return (appStore.mediaTypes || []).find((item) => Number(item.id) === Number(id)) || null
}

function mediaTitle(item: MediaItem) {
  if (item.basename) return String(item.basename)
  if (item.path) return path.basename(String(item.path))
  return item.name || ''
}

function resolveMediaTypeName(mediaTypeId: number | null | undefined): string {
  const mt = resolveMediaType(mediaTypeId)
  return mt?.name || ''
}

function mediaTypeIcon(mediaTypeId: number | null | undefined): string {
  const mt = resolveMediaType(mediaTypeId)
  return mt?.icon || 'file-video-outline'
}

function mediaSecondary(item: MediaItem) {
  const mt = resolveMediaType(item.mediaTypeId)
  if (isVideoMediaType(mt) && Number(item.duration) > 0) {
    return getReadableDuration(Number(item.duration))
  }
  if (isImageMediaType(mt) && Number(item.width) > 0 && Number(item.height) > 0) {
    return `${item.width} × ${item.height}`
  }
  if (Number(item.duration) > 0) {
    return getReadableDuration(Number(item.duration))
  }
  return ''
}

function mediaIconThumbStyle(item: MediaItem) {
  const width = Number(item.width) || 0
  const height = Number(item.height) || 0
  if (width <= 0 || height <= 0) return undefined
  return {aspectRatio: `${width} / ${height}`}
}

function mediaThumb(item: MediaItem) {
  const folder = getMediaDeleteAssetFolder(resolveMediaType(item.mediaTypeId)) || 'videos'
  return resolveMediaThumbDisplayUrl(
    appStore.mediaPath,
    folder,
    item.id,
    'thumbs',
    {maxEdge: CARD_THUMB_MAX_EDGE},
  )
}

function coverUrlsFor(folder: FolderBrowseTileModel) {
  return (folder.coverMediaIds || [])
    .map((id) => props.coverUrlByMediaId[id])
    .filter((url): url is string => Boolean(url))
}

function tagsFor(folderPath: string) {
  return props.folderTags[folderPath] || []
}

function isSelected(item: MediaItem) {
  return itemsStore.selection.includes(item.id)
}

function isInspectorFocused(item: MediaItem) {
  return !props.selectMode
    && itemsStore.selection.length === 1
    && Number(itemsStore.selection[0]) === Number(item.id)
}

function isMediaFocused(item: MediaItem) {
  if (props.selectMode) {
    return itemsStore.selected_last != null
      && Number(itemsStore.selected_last) === Number(item.id)
  }
  return focused.value?.kind === 'media' && Number(focused.value.id) === Number(item.id)
}

function isFolderFocused(folderPath: string) {
  return focused.value?.kind === 'folder' && focused.value.path === folderPath
}

function isFolderSelected(folderPath: string) {
  return (props.selectedFolderPaths || new Set()).has(folderPath)
}

function isPendingFocused(entryPath: string) {
  return focused.value?.kind === 'pending' && focused.value.path === entryPath
}

function isIngesting(entryPath: string) {
  return (props.ingestingPaths || new Set()).has(entryPath)
}

function isFsFileSelected(entryPath: string) {
  return (props.selectedFsFilePaths || new Set()).has(entryPath)
}

function onMediaClick(item: MediaItem) {
  if (props.selectMode) {
    itemsStore.toggleSelect(null, item)
    return
  }
  setFocus({kind: 'media', id: Number(item.id)})
  itemsStore.focusForInspector(item)
}

function onMediaCellContextMenu(event: MouseEvent, item: MediaItem) {
  // Card mode: Item handles its own media context menu.
  if (isCards.value) return
  emit('media-contextmenu', event, item)
}

function toggleSelect(item: MediaItem, event: MouseEvent) {
  itemsStore.toggleSelect(event, item)
}
</script>

<style scoped>
.folders-virtual-grid {
  width: 100%;
}

.virtual-grid-spacer {
  width: 100%;
  pointer-events: none;
}

.virtual-grid-row {
  box-sizing: border-box;
}

.folders-virtual-grid__row.card-grid {
  align-items: stretch;
}

.folders-virtual-grid__row.card-grid > .folders-virtual-grid__cell {
  flex: 0 0 var(--card-width, 250px);
  width: var(--card-width, 250px);
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  align-self: stretch;
  display: flex;
}

.folders-virtual-grid__cell--folder {
  width: 100%;
}

.folders-virtual-grid__cell--folder :deep(.folder-browse-tile-wrapper) {
  width: 100%;
  height: 100%;
}

.folders-virtual-grid__cell--folder :deep(.folder-browse-tile:not(.folder-browse-tile--list):not(.folder-browse-tile--compact):not(.folder-browse-tile--icons)) {
  height: 100%;
}

.folders-virtual-grid__list-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.folders-virtual-grid__list-row > .folders-virtual-grid__cell {
  width: 100%;
}

.folders-virtual-grid__cell--media {
  position: relative;
}

.folders-virtual-grid__media-item {
  width: 100%;
  min-width: 0;
}

.folders-virtual-grid__cell--media.item--inspector-focused,
.folders-virtual-grid__cell--media.item--keyboard-cursor {
  border-radius: 17px;
  outline-offset: 1px;
}

.folders-virtual-grid__cell--media.folders-virtual-grid__cell--list.item--inspector-focused,
.folders-virtual-grid__cell--media.folders-virtual-grid__cell--list.item--keyboard-cursor {
  outline: none;
}

.folders-virtual-grid__cell--media.folders-virtual-grid__cell--list.item--inspector-focused .folder-browse-tile--list,
.folders-virtual-grid__cell--media.folders-virtual-grid__cell--list.item--keyboard-cursor .folder-browse-tile--list {
  border-color: rgb(var(--v-theme-primary));
  box-shadow: 0 0 0 2px rgba(var(--v-theme-primary), 0.25);
}

.folders-virtual-grid__cell--media.folders-virtual-grid__cell--list.item--selecting {
  overflow: hidden;
  border-radius: 8px;
}

.folders-virtual-grid__cell--media.folders-virtual-grid__cell--icons.item--selecting {
  overflow: visible;
}

.folders-virtual-grid__cell--media.folders-virtual-grid__cell--icons.item--inspector-focused,
.folders-virtual-grid__cell--media.folders-virtual-grid__cell--icons.item--keyboard-cursor {
  outline: none;
  border-radius: 12px;
  background: rgba(var(--v-theme-primary), 0.1);
  box-shadow: inset 0 0 0 2px rgba(var(--v-theme-primary), 0.45);
}

.folders-virtual-grid__cell--media.folders-virtual-grid__cell--list .item-select-overlay {
  border-radius: 8px;
}

.folders-virtual-grid__cell--media.folders-virtual-grid__cell--icons :deep(.item-select-overlay) {
  border-radius: 12px;
}

.folders-virtual-grid__cell--media :deep(.item) {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.folders-virtual-grid__cell--media :deep(.item_wrapper) {
  height: 100%;
}

.folders-virtual-grid__cell--media .folder-browse-tile--list {
  height: var(--list-card-height, 48px);
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 0 10px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 8px;
  background: rgb(var(--v-theme-surface));
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-align: left;
  overflow: hidden;
  display: flex;
  flex-direction: row;
  align-items: center;
  transition: border-color 180ms ease, box-shadow 180ms ease;
}

.folders-virtual-grid__cell--media .folder-browse-tile--list:hover,
.folders-virtual-grid__cell--media .folder-browse-tile--list:focus-visible {
  border-color: rgb(var(--v-theme-primary));
  outline: none;
}

.folders-virtual-grid__cell--media .folder-browse-tile--list .folder-browse-tile__preview {
  position: relative;
  flex: 0 0 auto;
  width: 28px;
  min-width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  overflow: hidden;
  border-radius: 4px;
}

.folders-virtual-grid__cell--media .folder-browse-tile--list .folder-browse-tile__cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.folders-virtual-grid__cell--media .folder-browse-tile--list .folder-browse-tile__body {
  box-sizing: border-box;
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 10px;
}

.folders-virtual-grid__cell--media .folder-browse-tile--list .folder-browse-tile__name {
  font-family: inherit;
  font-size: var(--list-font-size, 13px);
  font-weight: 400;
  line-height: 16px;
  color: inherit;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.folders-virtual-grid__cell--media .folder-browse-tile--list .folder-browse-tile__meta {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  margin-top: 0;
  flex: 0 1 auto;
  overflow: hidden;
}

.folders-virtual-grid__cell--media .folder-browse-tile--list .folder-browse-tile__count {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.folders-virtual-grid__cell--media .folder-browse-tile--list .folder-browse-tile__media-type {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  color: rgba(var(--v-theme-on-surface), 0.5);
  line-height: 1;
}

.folders-virtual-grid__cell--fs-file {
  position: relative;
}

.folders-virtual-grid__cell--pending,
.folders-virtual-grid__cell--missing {
  position: relative;
  width: 100%;
}

.folder-missing-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: var(--list-card-height, 48px);
  padding: 0 12px;
  border: 1px solid rgba(var(--v-theme-error), 0.35);
  border-radius: 8px;
  background: rgba(var(--v-theme-error), 0.06);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.folder-missing-row__name {
  flex: 1;
  min-width: 0;
  font-size: var(--list-font-size, 13px);
  font-weight: 400;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.folder-missing-row__chip {
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 600;
  color: rgb(var(--v-theme-error));
}

.folders-virtual-grid__cell--fs-file.folders-virtual-grid__cell--list {
  width: 100%;
}

.folders-virtual-grid__cell--media .folder-browse-tile--icons {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  height: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 10px 8px 12px;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-align: center;
  overflow: visible;
  transition: background-color 160ms ease;
}

.folders-virtual-grid__cell--media .folder-browse-tile--icons:hover,
.folders-virtual-grid__cell--media .folder-browse-tile--icons:focus-visible {
  background: rgba(var(--v-theme-primary), 0.06);
  outline: none;
}

.folders-virtual-grid__cell--media .folder-browse-tile--icons .folder-browse-tile__preview {
  position: relative;
  flex: 0 0 auto;
  width: var(--folder-icon-size, 88px);
  height: var(--folder-icon-size, 88px);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: transparent;
  overflow: visible;
}

.folders-virtual-grid__cell--media .folder-browse-tile--icons .folder-browse-tile__preview--media-thumb {
  width: fit-content;
  height: fit-content;
  max-width: var(--folder-icon-size, 88px);
  max-height: var(--folder-icon-size, 88px);
}

.folders-virtual-grid__cell--media .folder-browse-tile--icons .folder-browse-tile__cover--icons {
  display: block;
  width: auto;
  height: auto;
  max-width: var(--folder-icon-size, 88px);
  max-height: var(--folder-icon-size, 88px);
  object-fit: contain;
  border-radius: 6px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.18);
}

.folders-virtual-grid__cell--media .folder-browse-tile--icons .folder-browse-tile__body {
  flex: 0 0 auto;
  width: 100%;
  min-width: 0;
  min-height: 0;
  padding: 8px 2px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.folders-virtual-grid__cell--media .folder-browse-tile--icons .folder-browse-tile__name {
  width: 100%;
  font-size: 0.82em;
  font-weight: 500;
  line-height: 1.25;
  color: inherit;
  text-align: center;
  white-space: normal;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

.folders-virtual-grid__cell--media .folder-browse-tile--icons .folder-browse-tile__meta--icons {
  display: flex;
  justify-content: center;
  width: 100%;
}

.folders-virtual-grid__cell--media .folder-browse-tile--icons .folder-browse-tile__objects {
  font-size: 0.72em;
  font-weight: 500;
  line-height: 1.2;
  color: rgb(var(--v-theme-primary));
  opacity: 0.85;
  white-space: nowrap;
}

.folders-virtual-grid--icons .folders-virtual-grid__cell--folder :deep(.folder-browse-tile--icons) {
  height: 100%;
}
</style>
