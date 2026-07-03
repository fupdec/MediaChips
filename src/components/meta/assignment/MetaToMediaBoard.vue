<template>
  <div class="meta-to-media-board">
    <div class="meta-assignment-board">
      <aside class="meta-assignment-board__pool">
        <div class="text-caption text-medium-emphasis mb-3">
          <v-icon size="14" start>mdi-drag</v-icon>
          {{ t('meta.settings.assignment_fields_drag_hint') }}
        </div>

        <MetaFieldPool
          :items="allMeta"
          :exclude-ids="pinnedMetaIds"
          drag-group="meta-fields-assign"
          :compact="true"
          :empty-text="t('meta.settings.all_meta_pinned')"
          @select="requestPinMeta"
        />
      </aside>

      <main class="meta-assignment-board__target">
        <div class="meta-assignment-board__target-header text-caption text-medium-emphasis mb-2">
          {{ t('meta.settings.pinned_fields') }}
        </div>

        <MediaTypePreviewCard
          v-if="anchorMediaType"
          :media-type="anchorMediaType"
          :is-pinned="true"
          hero
          editable
          :pinned-items="pinnedItems"
          :show-visibility-toggle="true"
          drag-group="meta-fields-assign"
          @items-change="onPinnedMetaChange"
          @unpin="requestUnpinMeta"
          @toggle-show="$emit('toggle-show', $event)"
        />

        <div v-if="pinnedItems.length" class="text-caption text-medium-emphasis mt-3">
          <v-icon size="14" start>mdi-drag</v-icon>
          {{ t('meta.settings.drag_to_reorder_or_unpin') }}
        </div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import MediaTypePreviewCard from './MediaTypePreviewCard.vue'
import MetaFieldPool from './MetaFieldPool.vue'
import type {
  MediaType,
  Meta,
  MetaInMediaTypeRow,
} from '@/types/metaAssignment'

const props = withDefaults(defineProps<{
  anchorMediaType?: MediaType | null
  pinnedItems?: MetaInMediaTypeRow[]
  allMeta?: Meta[]
}>(), {
  anchorMediaType: null,
  pinnedItems: () => [],
  allMeta: () => [],
})

const emit = defineEmits<{
  'pin-meta': [meta: Meta]
  'unpin-meta': [item: MetaInMediaTypeRow]
  reorder: [items: MetaInMediaTypeRow[]]
  'toggle-show': [item: MetaInMediaTypeRow]
}>()

const {t} = useI18n()

const pinnedMetaIds = computed(() => props.pinnedItems.map((i) => i.metaId))

const findAddedMeta = (next: MetaInMediaTypeRow[], prev: MetaInMediaTypeRow[]) => {
  const prevIds = new Set(prev.map((item) => item.metaId))
  return next.find((item) => !prevIds.has(item.metaId))
}

const findRemovedMeta = (next: MetaInMediaTypeRow[], prev: MetaInMediaTypeRow[]) => {
  const nextIds = new Set(next.map((item) => item.metaId))
  return prev.find((item) => !nextIds.has(item.metaId))
}

const onPinnedMetaChange = (next: MetaInMediaTypeRow[]) => {
  const prev = props.pinnedItems

  if (next.length > prev.length) {
    const added = findAddedMeta(next, prev)
    if (added?.metaId) {
      emit('reorder', next)
      return
    }
    if (added) {
      emit('pin-meta', added as unknown as Meta)
    }
    return
  }

  if (next.length < prev.length) {
    const removed = findRemovedMeta(next, prev)
    if (removed) emit('unpin-meta', removed)
    return
  }

  emit('reorder', next)
}

const requestPinMeta = (meta: Meta) => emit('pin-meta', meta)
const requestUnpinMeta = (item?: MetaInMediaTypeRow) => {
  if (item) emit('unpin-meta', item)
}
</script>
