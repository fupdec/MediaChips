<template>
  <div
    ref="layoutRef"
    class="folders-virtual-grid items-virtual-grid"
    :style="gridStyle"
  >
    <div
      class="virtual-grid-spacer"
      :style="{ height: `${topSpacer}px` }"
      aria-hidden="true"
    />

    <div
      v-for="row in visibleRows"
      :key="row.startIndex"
      class="virtual-grid-row card-grid folders-virtual-grid__row"
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
          @open="emit('open-folder', $event)"
        />
        <div
          v-else
          class="folders-virtual-grid__cell folders-virtual-grid__cell--media item"
          :class="{
            'item--selecting': itemsStore.isSelect,
            'item--inspector-focused': isInspectorFocused(entry.item),
            'item--keyboard-cursor': isKeyboardCursor(entry.item),
          }"
          :data-item-id="entry.item.id"
        >
          <WidgetMediaCard
            fluid
            compact
            :item="entry.item"
            :thumb="mediaThumb(entry.item)"
            :title="mediaTitle(entry.item)"
            @click="onMediaClick(entry.item)"
          />
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
  type FolderBrowseTileModel,
} from '@/components/folders/FolderBrowseTile.vue'
import WidgetMediaCard from '@/components/widgets/WidgetMediaCard.vue'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useResponsiveGridLayout} from '@/composable/useResponsiveGridLayout'
import {useVirtualGridWindow} from '@/composable/useVirtualGridWindow'
import {setVisibleItemIds, clearVisibleItemIds} from '@/utils/visibleItemsWindow'
import {getMediaDeleteAssetFolder} from '@/utils/mediaType'
import {CARD_THUMB_MAX_EDGE, resolveMediaThumbDisplayUrl} from '@/utils/thumbSource'
import {
  getDistributedCardWidth,
  getGridGap,
  type GridLayoutOptions,
} from '@/utils/gridLayout'
import type {MediaType} from '@/types/media'
import type {MediaItem} from '@/types/stores'

/** Caption under the 16:9 preview (filename only). */
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
  reg?: boolean
}>(), {
  folders: () => [],
  media: () => [],
  size: 3,
  gapSize: 'default',
  reg: true,
})

const emit = defineEmits<{
  'open-folder': [path: string]
}>()

const {t} = useI18n()
const appStore = useAppStore()
const itemsStore = useItemsStore()
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

const resolvedLayoutOptions = computed<GridLayoutOptions>(() => ({
  size: 1,
  gapSize: 'compact',
}))

const {gridStyle, containerWidth} = useResponsiveGridLayout(layoutRef, resolvedLayoutOptions)

const folderCardLayout = computed(() => {
  const gapSize = 'compact'
  const size = 1
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
  listGrid: false,
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

function isSelected(item: MediaItem) {
  return itemsStore.selection.includes(item.id)
}

function isInspectorFocused(item: MediaItem) {
  return !itemsStore.isSelect
    && itemsStore.selection.length === 1
    && Number(itemsStore.selection[0]) === Number(item.id)
}

function isKeyboardCursor(item: MediaItem) {
  return itemsStore.isSelect
    && itemsStore.selected_last != null
    && Number(itemsStore.selected_last) === Number(item.id)
}

function onMediaClick(item: MediaItem) {
  if (itemsStore.isSelect) {
    itemsStore.toggleSelect(null, item)
    return
  }
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
</style>
