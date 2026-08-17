<template>
  <div
    ref="layoutRef"
    class="folders-virtual-grid items-virtual-grid"
    :class="{'folders-virtual-grid--list': list}"
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
      :class="list ? 'folders-virtual-grid__list-row' : 'card-grid folders-virtual-grid__row'"
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
          :list="list"
          @open="emit('open-folder', $event)"
          @contextmenu="(event, path) => emit('folder-contextmenu', event, path)"
        />
        <div
          v-else
          class="folders-virtual-grid__cell folders-virtual-grid__cell--media item"
          :class="{
            'item--selecting': itemsStore.isSelect,
            'item--inspector-focused': isInspectorFocused(entry.item),
            'item--keyboard-cursor': isMediaFocused(entry.item),
            'folders-virtual-grid__cell--list': list,
          }"
          :data-item-id="entry.item.id"
          @contextmenu.prevent.stop="emit('media-contextmenu', $event, entry.item)"
        >
          <WidgetMediaCard
            v-if="!list"
            fluid
            compact
            :item="entry.item"
            :thumb="mediaThumb(entry.item)"
            :title="mediaTitle(entry.item)"
            @click="onMediaClick(entry.item)"
          />
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
              <span
                v-if="entry.item.mediaTypeId"
                class="folder-browse-tile__media-type-badge"
                :title="resolveMediaTypeName(entry.item.mediaTypeId)"
              >
                <v-icon size="12">mdi-{{ mediaTypeIcon(entry.item.mediaTypeId) }}</v-icon>
              </span>
            </div>
            <div class="folder-browse-tile__body">
              <div class="folder-browse-tile__name">
                {{ mediaTitle(entry.item) }}
              </div>
            </div>
          </button>
          <div
            v-if="itemsStore.isSelect"
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
import WidgetMediaCard from '@/components/widgets/WidgetMediaCard.vue'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useFoldersBrowserFocus} from '@/composable/useFoldersBrowserFocus'
import {useResponsiveGridLayout} from '@/composable/useResponsiveGridLayout'
import {useVirtualGridWindow} from '@/composable/useVirtualGridWindow'
import {setVisibleItemIds, clearVisibleItemIds} from '@/utils/visibleItemsWindow'
import {getMediaDeleteAssetFolder} from '@/utils/mediaType'
import {CARD_THUMB_MAX_EDGE, resolveMediaThumbDisplayUrl} from '@/utils/thumbSource'
import {
  getDistributedCardWidth,
  getGridGap,
  LIST_ROW_HEIGHT,
  type GridLayoutOptions,
} from '@/utils/gridLayout'
import type {MediaType} from '@/types/media'
import type {MediaItem} from '@/types/stores'

const WIDGET_CARD_BODY = 22
const CARD_BORDER_Y = 2

type FolderBrowseEntry =
  | {kind: 'folder'; key: string; folder: FolderBrowseTileModel}
  | {kind: 'media'; key: string; item: MediaItem}

const props = withDefaults(defineProps<{
  folders?: FolderBrowseTileModel[]
  media?: MediaItem[]
  size?: number | string
  gapSize?: string
  list?: boolean
  folderTags?: Record<string, FolderBrowseTagChip[]>
  coverUrlByMediaId?: Record<number, string>
  reg?: boolean
}>(), {
  folders: () => [],
  media: () => [],
  size: 3,
  gapSize: 'default',
  list: false,
  folderTags: () => ({}),
  coverUrlByMediaId: () => ({}),
  reg: true,
})

const emit = defineEmits<{
  'open-folder': [path: string]
  'folder-contextmenu': [event: MouseEvent, path: string]
  'media-contextmenu': [event: MouseEvent, item: MediaItem]
}>()

const {t} = useI18n()
const appStore = useAppStore()
const itemsStore = useItemsStore()
const {focused, setFocus} = useFoldersBrowserFocus()
const layoutRef = ref<HTMLElement | null>(null)

const entriesSource = computed((): FolderBrowseEntry[] => {
  const folders = (props.folders || []).map((folder) => ({
    kind: 'folder' as const,
    key: `folder:${folder.path}`,
    folder,
  }))
  const media = (props.media || []).map((item) => ({
    kind: 'media' as const,
    key: `media:${item.id}`,
    item,
  }))
  return [...folders, ...media]
})

const sizeNumber = computed(() => {
  const size = Number(props.size)
  return Number.isFinite(size) && size >= 1 && size <= 6 ? size : 3
})

const resolvedLayoutOptions = computed<GridLayoutOptions>(() => ({
  size: props.list ? 3 : sizeNumber.value,
  gapSize: props.list ? 'compact' : (props.gapSize || 'default'),
  listGrid: props.list,
}))

const {gridStyle, containerWidth} = useResponsiveGridLayout(layoutRef, resolvedLayoutOptions)

const folderCardLayout = computed(() => {
  if (props.list) {
    const listCardHeight = LIST_ROW_HEIGHT[sizeNumber.value] || LIST_ROW_HEIGHT[3]
    return {
      size: sizeNumber.value,
      gapSize: 'compact',
      cardHeight: listCardHeight,
      rowStride: listCardHeight + getGridGap('compact').y,
    }
  }
  const gapSize = props.gapSize || 'default'
  const size = sizeNumber.value
  const width = containerWidth.value || 0
  const cardWidth = width
    ? getDistributedCardWidth(width, {size, gapSize})
    : 150
  const previewHeight = (cardWidth - CARD_BORDER_Y) / (16 / 9)
  const cardHeight = Math.round(previewHeight + WIDGET_CARD_BODY + CARD_BORDER_Y)
  return {
    size,
    gapSize,
    cardHeight,
    rowStride: cardHeight + getGridGap(gapSize).y,
  }
})

const layoutOptions = computed(() => ({
  size: folderCardLayout.value.size,
  gapSize: folderCardLayout.value.gapSize,
  imageGrid: false,
  wideImage: false,
  lineGrid: false,
  listGrid: props.list,
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

const gridContainerStyle = computed(() => {
  const cardHeight = folderCardLayout.value.cardHeight
  const previewWidth = Math.round(cardHeight * 1.17)
  return {
    ...gridStyle.value,
    '--list-card-height': `${cardHeight}px`,
    '--list-preview-width': `${previewWidth}px`,
    '--list-font-size': `${LIST_FONT_SIZES[sizeNumber.value] || LIST_FONT_SIZES[3]}px`,
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
  return !itemsStore.isSelect
    && itemsStore.selection.length === 1
    && Number(itemsStore.selection[0]) === Number(item.id)
}

function isMediaFocused(item: MediaItem) {
  return focused.value?.kind === 'media' && Number(focused.value.id) === Number(item.id)
}

function isFolderFocused(folderPath: string) {
  return focused.value?.kind === 'folder' && focused.value.path === folderPath
}

function onMediaClick(item: MediaItem) {
  if (itemsStore.isSelect) {
    itemsStore.toggleSelect(null, item)
    return
  }
  setFocus({kind: 'media', id: Number(item.id)})
  itemsStore.focusForInspector(item)
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
  align-items: flex-start;
}

.folders-virtual-grid__row.card-grid > .folders-virtual-grid__cell {
  flex: 0 0 var(--card-width, 250px);
  width: var(--card-width, 250px);
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  align-self: flex-start;
  display: flex;
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

.folders-virtual-grid__cell--media.item--inspector-focused,
.folders-virtual-grid__cell--media.item--keyboard-cursor {
  border-radius: 8px;
  outline-offset: 1px;
}

.folders-virtual-grid__cell--media :deep(.home-media-card) {
  width: 100%;
  height: auto;
  min-height: 0;
}

.folders-virtual-grid__cell--media .folder-browse-tile--list {
  height: var(--list-card-height, 48px);
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 0;
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
  width: var(--list-preview-width, 56px);
  min-width: var(--list-preview-width, 56px);
  height: var(--list-card-height, 48px);
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(var(--v-theme-on-surface), 0.06);
  overflow: hidden;
}

.folders-virtual-grid__cell--media .folder-browse-tile--list .folder-browse-tile__cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.folders-virtual-grid__cell--media .folder-browse-tile--list .folder-browse-tile__media-type-badge {
  position: absolute;
  top: 2px;
  left: 2px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  pointer-events: none;
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
  font-weight: 500;
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
</style>
