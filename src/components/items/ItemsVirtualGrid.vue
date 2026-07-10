<template>
  <div ref="layoutRef" class="items-virtual-grid" :style="gridStyle">
    <div
      class="virtual-grid-spacer"
      :style="{ height: `${topSpacer}px` }"
      aria-hidden="true"
    />

    <div
      v-for="row in visibleRows"
      :key="row.startIndex"
      :class="gridClasses"
      :style="rowStyle"
      class="virtual-grid-row"
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
      />
    </div>

    <div
      class="virtual-grid-spacer"
      :style="{ height: `${bottomSpacer}px` }"
      aria-hidden="true"
    />
  </div>
</template>

<script setup lang="ts">
import {computed, ref, watch, onBeforeUnmount, type HTMLAttributes} from 'vue'
import Item from '@/components/items/Item.vue'
import {useResponsiveGridLayout} from '@/composable/useResponsiveGridLayout'
import {useVirtualGridWindow} from '@/composable/useVirtualGridWindow'
import {setVisibleItemIds, clearVisibleItemIds} from '@/utils/visibleItemsWindow'
import type {GridLayoutOptions} from '@/utils/gridLayout'
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
  chipsGrid?: boolean
  imageAspectRatio?: number
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
  chipsGrid: false,
})

const layoutRef = ref<HTMLElement | null>(null)
const itemsSource = computed(() => props.items)

const resolvedLayoutOptions = computed<GridLayoutOptions>(() => ({
  size: Number(props.size),
  gapSize: props.gapSize ?? 'default',
  imageGrid: props.imageGrid ?? false,
  wideImage: props.wideImage ?? false,
  lineGrid: props.lineGrid ?? false,
  chipsGrid: props.chipsGrid ?? false,
  imageAspectRatio: props.imageAspectRatio,
  ...props.gridLayoutOptions,
}))

const { gridStyle } = useResponsiveGridLayout(layoutRef, resolvedLayoutOptions)

const layoutOptions = computed(() => ({
  size: Number(props.size),
  gapSize: props.gapSize ?? 'default',
  imageGrid: props.imageGrid ?? false,
  wideImage: props.wideImage ?? false,
  lineGrid: props.lineGrid ?? false,
  chipsGrid: props.chipsGrid ?? false,
  imageAspectRatio: props.imageAspectRatio,
  lockRowHeight: true,
}))

const {
  visibleRows,
  topSpacer,
  bottomSpacer,
  rowHeight,
} = useVirtualGridWindow(itemsSource, layoutRef, layoutOptions)

const rowStyle = computed(() => ({
  minHeight: `${rowHeight.value}px`,
}))

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
}

.virtual-grid-spacer {
  width: 100%;
  pointer-events: none;
}

.virtual-grid-row {
  box-sizing: border-box;
}
</style>
