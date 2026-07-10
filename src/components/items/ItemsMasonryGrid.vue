<template>
  <div
    ref="layoutRef"
    :class="[gridClasses, { 'items-masonry-grid--virtual': virtual }]"
    :style="rootStyle"
    class="items-masonry-grid masonry-grid"
  >
    <div
      v-if="virtual"
      class="masonry-virtual-surface"
      :style="{ height: `${totalHeight}px` }"
    >
      <div
        v-for="position in visibleItems"
        :key="position.item.id"
        :style="itemStyle(position)"
        class="masonry-virtual-item"
      >
        <Item
          :type="itemsType"
          :item="position.item"
          :meta="meta"
          :media-type="mediaType"
          :reg="reg"
          :x="position.index"
        />
      </div>
    </div>

    <template v-else>
      <div
        v-for="(column, colIndex) in columns"
        :key="colIndex"
        :style="columnStyle"
        class="masonry-column"
      >
        <Item
          v-for="{ item, index } in column.items"
          :key="item.id"
          :type="itemsType"
          :item="item"
          :meta="meta"
          :media-type="mediaType"
          :reg="reg"
          :x="index"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import {computed, ref, onMounted, onBeforeUnmount, watch, type HTMLAttributes} from 'vue'
import Item from '@/components/items/Item.vue'
import {useResponsiveGridLayout} from '@/composable/useResponsiveGridLayout'
import {useVirtualMasonryWindow} from '@/composable/useVirtualMasonryWindow'
import {setVisibleItemIds, clearVisibleItemIds} from '@/utils/visibleItemsWindow'
import {
  estimateMasonryItemHeight,
  getDistributedCardWidth,
  getGridGap,
  getLayoutMetrics,
  getTargetCardWidth,
  packMasonryColumns,
  type GridLayoutOptions,
} from '@/utils/gridLayout'
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
  virtual?: boolean
}>(), {
  items: () => [],
  itemsType: 'media',
  meta: null,
  mediaType: null,
  reg: true,
  size: 3,
  view: 3,
  gapSize: 'default',
  gridClasses: undefined,
  gridLayoutOptions: undefined,
  virtual: false,
})

const layoutRef = ref<HTMLElement | null>(null)
const containerWidth = ref(0)
const columnCount = ref(1)
const itemsSource = computed(() => props.items)
const virtualEnabled = computed(() => props.virtual)

const resolvedLayoutOptions = computed<GridLayoutOptions>(() => ({
  size: Number(props.size),
  gapSize: props.gapSize ?? 'xs',
  imageGrid: true,
  containerWidth: containerWidth.value,
  ...props.gridLayoutOptions,
}))

const { gridStyle } = useResponsiveGridLayout(layoutRef, resolvedLayoutOptions)

const layoutOptions = computed(() => ({
  size: Number(props.size),
  gapSize: props.gapSize ?? 'xs',
}))

const {
  visibleItems,
  totalHeight,
  itemStyle,
} = useVirtualMasonryWindow(itemsSource, layoutRef, layoutOptions, virtualEnabled)

watch(
  visibleItems,
  (positions) => {
    if (!props.virtual) return
    setVisibleItemIds(positions.map((position) => position.item.id))
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (props.virtual) {
    clearVisibleItemIds()
  }
})

const gap = computed(() => getGridGap(props.gapSize ?? 'xs'))

const colWidth = computed(() => {
  const width = containerWidth.value
  const options = {
    size: Number(props.size),
    gapSize: props.gapSize ?? 'xs',
    imageGrid: true,
  }

  if (!width) return getTargetCardWidth(options)

  return getDistributedCardWidth(width, options)
})

const effectiveColumnCount = computed(() => {
  const count = props.items?.length || 0
  return Math.min(columnCount.value, Math.max(1, count))
})

const columns = computed(() => {
  if (props.virtual) return []

  const items = props.items || []
  const width = colWidth.value

  return packMasonryColumns(
    items,
    effectiveColumnCount.value,
    (item) => estimateMasonryItemHeight(item, width),
    width,
    gap.value.y,
  )
})

const rootStyle = computed(() => ({
  ...gridStyle.value,
  ...(props.virtual ? {} : { columnGap: `${gap.value.x}px` }),
}))

const columnStyle = computed(() => ({
  rowGap: `${gap.value.y}px`,
}))

let resizeObserver: ResizeObserver | null = null

const measureLayout = () => {
  const layoutEl = layoutRef.value
  if (!layoutEl) return

  containerWidth.value = layoutEl.clientWidth

  const options = {
    size: Number(props.size),
    gapSize: props.gapSize ?? 'xs',
    imageGrid: true,
    containerWidth: layoutEl.clientWidth,
  }
  const metrics = getLayoutMetrics(layoutEl.clientWidth, options)

  columnCount.value = metrics.columnCount
}

onMounted(() => {
  if (props.virtual) return

  measureLayout()

  if (layoutRef.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      measureLayout()
    })
    resizeObserver.observe(layoutRef.value)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})
</script>

<style scoped>
.items-masonry-grid {
  display: flex;
  align-items: flex-start;
  width: 100%;
}

.items-masonry-grid--virtual {
  display: block;
}

.masonry-virtual-surface {
  position: relative;
  width: 100%;
}

.masonry-virtual-item {
  position: absolute;
}

.masonry-column {
  flex: 0 0 var(--card-width, 220px);
  width: var(--card-width, 220px);
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.items-masonry-grid :deep(.item.item-media.item-view-3) {
  content-visibility: visible;
  contain-intrinsic-size: unset;
}

.items-masonry-grid :deep(.item:not(.item-view-3)) {
  content-visibility: auto;
  contain-intrinsic-size: auto 180px;
}
</style>
