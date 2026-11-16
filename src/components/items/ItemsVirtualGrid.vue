<template>
  <div
    ref="layoutRef"
    class="items-virtual-grid"
    :class="{ 'list-grid': listGrid }"
    :style="rootStyle"
    :data-row-height="rowHeight"
    :data-column-count="columnCount"
    :data-total-height="totalGridHeight"
    :data-total-count="totalCount"
    :data-start-top="dataStartTop"
    :data-end-top="dataEndTop"
    :data-window-start="windowStart"
    :data-loaded-count="items.length"
  >
    <div
      class="virtual-grid-spacer"
      :style="{ height: `${topSpacer}px` }"
      aria-hidden="true"
    />

    <div
      v-for="row in visibleRows"
      :key="row.index"
      :class="[gridClasses, { 'virtual-grid-row--natural': !lockRowHeight }]"
      :style="styleForRow(row)"
      class="virtual-grid-row"
      :data-row-index="row.index"
    >
      <Item
        v-for="(item, idx) in row.items"
        :key="item.id"
        :type="itemsType"
        :item="item"
        :meta="meta"
        :media-type="mediaType"
        :reg="reg"
        :x="row.startIndex + idx"
        eager-preview
      />
    </div>

    <div
      class="virtual-grid-spacer virtual-grid-spacer--tail"
      :style="{ height: `${bottomSpacer}px` }"
      aria-hidden="true"
    />

    <!-- Anchors load-more at the end of loaded data, not the filtered phantom tail. -->
    <div
      class="virtual-grid-data-end"
      :style="{ top: `${dataEndTop}px` }"
    >
      <slot name="after-data" />
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed, ref, watch, onBeforeUnmount, type HTMLAttributes} from 'vue'
import Item from '@/components/items/Item.vue'
import {useResponsiveGridLayout} from '@/composable/useResponsiveGridLayout'
import {useVirtualGridWindow} from '@/composable/useVirtualGridWindow'
import {setVisibleItemIds, clearVisibleItemIds} from '@/utils/visibleItemsWindow'
import {getGridGap, type GridLayoutOptions} from '@/utils/gridLayout'
import type {MediaType} from '@/types/media'
import type {MediaItem, Meta} from '@/types/stores'

const props = withDefaults(defineProps<{
  items?: MediaItem[]
  itemsType?: 'media' | 'tag'
  meta?: Meta | null
  mediaType?: MediaType | null
  reg?: boolean
  size?: number | string
  view?: number | string
  gapSize?: string
  gridClasses?: HTMLAttributes['class']
  gridLayoutOptions?: GridLayoutOptions
  imageGrid?: boolean
  wideImage?: boolean
  lineGrid?: boolean
  listGrid?: boolean
  chipsGrid?: boolean
  imageAspectRatio?: number
  /** Absolute index of items[0] in the full filtered list. */
  windowStart?: number
  /** Full filtered list length for scrollbar extent. */
  totalCount?: number
}>(), {
  items: () => [],
  itemsType: 'media',
  meta: null,
  mediaType: null,
  reg: true,
  size: 3,
  view: 1,
  gapSize: 'default',
  gridClasses: undefined,
  gridLayoutOptions: undefined,
  imageGrid: false,
  wideImage: false,
  lineGrid: false,
  listGrid: false,
  chipsGrid: false,
  windowStart: 0,
  totalCount: 0,
})

const layoutRef = ref<HTMLElement | null>(null)
const itemsSource = computed(() => props.items)

const resolvedLayoutOptions = computed<GridLayoutOptions>(() => ({
  size: Number(props.size),
  gapSize: props.gapSize ?? 'default',
  imageGrid: props.imageGrid ?? false,
  wideImage: props.wideImage ?? false,
  lineGrid: props.lineGrid ?? false,
  listGrid: props.listGrid ?? false,
  chipsGrid: props.chipsGrid ?? false,
  imageAspectRatio: props.imageAspectRatio,
  ...props.gridLayoutOptions,
}))

const { gridStyle } = useResponsiveGridLayout(layoutRef, resolvedLayoutOptions)

/** Minimalism / chips: fixed stride. Cards + timeline: measure natural height. */
const lockRowHeight = computed(() => (
  Boolean(resolvedLayoutOptions.value.imageOnly)
  || Boolean(props.chipsGrid || resolvedLayoutOptions.value.chipsGrid)
))

const layoutOptions = computed(() => ({
  size: Number(props.size),
  gapSize: props.gapSize ?? 'default',
  imageGrid: props.imageGrid ?? false,
  wideImage: props.wideImage ?? false,
  lineGrid: props.lineGrid ?? false,
  listGrid: props.listGrid ?? false,
  chipsGrid: props.chipsGrid ?? false,
  imageOnly: Boolean(resolvedLayoutOptions.value.imageOnly),
  // Image cards use a fixed 16:9 estimate so locked row heights stay jump-free.
  imageAspectRatio: props.imageAspectRatio
    ?? resolvedLayoutOptions.value.imageAspectRatio
    ?? (props.imageGrid ? 16 / 9 : undefined),
  lockRowHeight: lockRowHeight.value,
  windowStart: Number(props.windowStart) || 0,
  totalCount: Number(props.totalCount) || 0,
}))

const {
  visibleRows,
  topSpacer,
  bottomSpacer,
  dataStartTop,
  dataEndTop,
  totalGridHeight,
  rowHeight,
  columnCount,
} = useVirtualGridWindow(itemsSource, layoutRef, layoutOptions)

const windowStart = computed(() => Number(props.windowStart) || 0)

const rootStyle = computed(() => ({
  ...gridStyle.value,
  position: 'relative' as const,
  minHeight: `${totalGridHeight.value}px`,
}))

const styleForRow = (row: { contentMinHeight?: number }) => {
  if (lockRowHeight.value) {
    const gapY = getGridGap(props.gapSize).y
    const contentHeight = Math.max(1, rowHeight.value - gapY)
    return {
      height: `${contentHeight}px`,
      minHeight: `${contentHeight}px`,
    }
  }
  // Natural cards/timeline: prior measured height avoids collapse→grow on remount.
  if (row.contentMinHeight != null && row.contentMinHeight > 0) {
    return { minHeight: `${row.contentMinHeight}px` }
  }
  return undefined
}

watch(
  visibleRows,
  (rows) => {
    setVisibleItemIds(rows.flatMap((row) => row.items.map((item) => item.id)))
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  clearVisibleItemIds()
})
</script>

<style scoped>
.items-virtual-grid {
  width: 100%;
  overflow-anchor: none;
}

.virtual-grid-spacer {
  width: 100%;
  pointer-events: none;
}

.virtual-grid-row {
  box-sizing: border-box;
  overflow-anchor: none;
}

/* Equal-height rules: item.scss (.virtual-grid-row--natural.card-grid). */

.virtual-grid-data-end {
  position: absolute;
  left: 0;
  width: 100%;
  z-index: 1;
}
</style>
