<template>
  <div
    v-show="hover.show && !contextMenuVisible"
    :class="['hover-image', { 'hover-image--item-card': isItemCardHover }]"
    :style="style"
  >
    <TagHoverCard
      v-if="isTagHover"
      :meta-id="hover.metaId!"
      :tag-id="hover.tagId!"
      :label="hover.label"
      :image-aspect-ratio="hover.imageAspectRatio"
      @preview-size="onCardPreviewSize"
    />

    <MediaHoverCard
      v-else-if="isMediaHover"
      :media-type-id="hover.metaId!"
      :media-id="hover.tagId!"
      :label="hover.label"
      :width="hover.mediaWidth"
      :height="hover.mediaHeight"
      :is-video="hover.isVideo"
      @preview-size="onCardPreviewSize"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import MediaHoverCard from '@/components/items/MediaHoverCard.vue'
import TagHoverCard from '@/components/tags/TagHoverCard.vue'
import { useAppStore } from '@/stores/app'
import { useContextMenu } from '@/stores/contextMenu'
import { HOVER_CARD_WIDTH } from '@/services/hoverService'

const appStore = useAppStore()
const contextMenuStore = useContextMenu()
const hover = appStore.hover

const contextMenuVisible = computed(
  () => contextMenuStore.show,
)

const isTagHover = computed(() =>
  hover.show && hover.data_type === 'tag' && hover.metaId != null && hover.tagId != null,
)

const isMediaHover = computed(() =>
  hover.show && hover.data_type === 'media' && hover.metaId != null && hover.tagId != null,
)

const isItemCardHover = computed(() => isTagHover.value || isMediaHover.value)

const style = computed(() => ({
  top: `${hover.y + 30}px`,
  left: `${hover.x + 30}px`,
  width: isItemCardHover.value
    ? `${HOVER_CARD_WIDTH}px`
    : `${hover.previewWidth || 180}px`,
  '--hover-media-height': `${hover.previewHeight || 180}px`,
}))

function onCardPreviewSize(size: { previewWidth: number; previewHeight: number }) {
  hover.previewWidth = size.previewWidth
  hover.previewHeight = size.previewHeight
}
</script>
