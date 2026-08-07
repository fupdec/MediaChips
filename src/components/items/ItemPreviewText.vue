<template>
  <div :class="{ 'no-file': !isFileExists }">
    <v-responsive
      v-if="isViewCard || isViewTimeline"
      v-ripple="{ class: 'text-primary' }"
      :aspect-ratio="1"
      class="text-preview-container"
      @click.stop="open"
    >
      <div class="text-preview-container__icon d-flex align-center justify-center">
        <v-icon size="56" color="grey-lighten-1">
          {{ previewable ? 'mdi-file-document-outline' : 'mdi-file-outline' }}
        </v-icon>
      </div>
      <div
        v-if="excerpt"
        class="text-preview-container__excerpt"
        :title="excerpt"
      >
        {{ excerpt }}
      </div>
      <div
        v-if="badge"
        class="text-preview-container__badge"
        :class="{'text-preview-container__badge--previewable': previewable}"
      >
        {{ badge }}
      </div>
    </v-responsive>
  </div>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useItemsStore} from '@/stores/items'
import {openTextMedia} from '@/utils/openTextMedia'
import {
  extensionBadgeLabel,
  isInAppTextPreviewPath,
} from '@/utils/textPreview'
import type {MediaItem} from '@/types/stores'

const props = defineProps<{
  media: MediaItem
  isFileExists?: boolean
}>()

const itemsStore = useItemsStore()

const isViewCard = computed(() =>
  Number(itemsStore.view) === 1
)

const isViewTimeline = computed(() =>
  Number(itemsStore.view) === 2
)

const previewable = computed(() => isInAppTextPreviewPath(props.media?.path))
const badge = computed(() => extensionBadgeLabel(props.media?.path))
const excerpt = computed(() => {
  const value = String((props.media as {textExcerpt?: string | null})?.textExcerpt || '').trim()
  return value
})

const open = () => {
  if (!props.isFileExists || !props.media?.path) return
  openTextMedia(props.media)
}
</script>

<style scoped>
.text-preview-container {
  position: relative;
  background: rgb(120 120 120 / 12%);
  cursor: pointer;
}

.text-preview-container__icon {
  width: 100%;
  height: 100%;
}

.text-preview-container__excerpt {
  position: absolute;
  left: 6px;
  right: 6px;
  top: 6px;
  bottom: 28px;
  overflow: hidden;
  padding: 6px 8px;
  border-radius: 8px;
  background: rgb(0 0 0 / 35%);
  color: rgba(255, 255, 255, 0.92);
  font-size: 11px;
  line-height: 1.35;
  white-space: pre-wrap;
  word-break: break-word;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 8;
  line-clamp: 8;
}

.text-preview-container__badge {
  position: absolute;
  left: 6px;
  bottom: 6px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgb(0 0 0 / 55%);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  line-height: 1.2;
}

.text-preview-container__badge--previewable {
  background: rgb(var(--v-theme-primary));
}
</style>
