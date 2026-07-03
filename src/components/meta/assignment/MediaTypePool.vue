<template>
  <div class="media-type-pool">
    <div class="text-caption text-medium-emphasis mb-2">
      {{ t('meta.settings.available_media_types') }}
    </div>

    <div v-if="availableItems.length" class="media-type-pool__grid">
      <draggable
        :list="availableItems"
        item-key="id"
        v-bind="dragOptions"
        class="media-type-pool__draggable"
      >
        <template #item="{element}">
          <MediaTypePreviewCard
            :media-type="element"
            :is-pinned="false"
            :highlight-meta="highlightMeta"
            :show-unpin="false"
            class="media-type-pool__card"
            @click="$emit('select', element)"
          />
        </template>
      </draggable>
    </div>

    <div v-else class="media-type-pool__empty text-center py-4">
      <v-icon size="40" class="mb-2 text-medium-emphasis">{{ emptyIcon }}</v-icon>
      <div class="text-body-2 text-medium-emphasis">{{ emptyText }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import draggable from 'vuedraggable'
import MediaTypePreviewCard from './MediaTypePreviewCard.vue'
import type {MediaType, Meta} from '@/types/metaAssignment'

const props = withDefaults(defineProps<{
  items?: MediaType[]
  excludeIds?: Array<number | string>
  highlightMeta?: Meta | null
  dragGroup?: string
  emptyIcon?: string
  emptyText?: string
}>(), {
  items: () => [],
  excludeIds: () => [],
  highlightMeta: null,
  dragGroup: 'media-type-assign',
  emptyIcon: 'mdi-database-check',
  emptyText: '',
})

defineEmits<{
  select: [mediaType: MediaType]
}>()

const {t} = useI18n()

const dragOptions = computed(() => ({
  animation: 180,
  group: {name: props.dragGroup, pull: 'clone', put: false},
  sort: false,
  ghostClass: 'media-type-preview-card--ghost',
}))

const availableItems = computed(() => {
  const exclude = new Set(props.excludeIds)
  return props.items.filter((item) => !exclude.has(item.id))
})
</script>
