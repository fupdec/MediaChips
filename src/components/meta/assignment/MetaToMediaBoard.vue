<template>
  <div class="meta-to-media-board">
    <div class="meta-assignment-board">
      <aside class="meta-assignment-board__pool">
        <div class="text-caption text-medium-emphasis mb-3">
          <v-icon size="14" start>mdi-drag</v-icon>
          {{ poolHint }}
        </div>

        <MediaTypePool
          v-if="mode === 'from-meta'"
          :items="allMediaTypes"
          :exclude-ids="pinnedMediaTypeIds"
          :highlight-meta="anchorMeta"
          drag-group="media-type-assign"
          :empty-text="t('meta.settings.all_media_types_pinned')"
          @select="requestPin"
        />

        <MetaFieldPool
          v-else
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
          {{ targetTitle }}
        </div>

        <template v-if="mode === 'from-meta'">
          <draggable
            v-if="pinnedMediaCards.length"
            :model-value="pinnedMediaCards"
            item-key="id"
            v-bind="mediaDragOptions"
            class="meta-to-media-board__pinned-grid"
            @update:model-value="onPinnedMediaChange"
          >
            <template #item="{element}">
              <MediaTypePreviewCard
                :media-type="element"
                :is-pinned="true"
                :highlight-meta="anchorMeta"
                :show-unpin="true"
                @unpin="requestUnpin(element)"
              />
            </template>
          </draggable>

          <div v-else class="meta-assignment-board__drop-zone">
            <v-icon size="32" class="mb-2 text-medium-emphasis">mdi-file-move-outline</v-icon>
            <div class="text-body-2 text-medium-emphasis">{{ t('meta.settings.drop_media_type_here') }}</div>
          </div>
        </template>

        <template v-else>
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

          <div v-if="hasPinnedItems" class="text-caption text-medium-emphasis mt-3">
            <v-icon size="14" start>mdi-drag</v-icon>
            {{ t('meta.settings.drag_to_reorder_or_unpin') }}
          </div>
        </template>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import draggable from 'vuedraggable'
import {useAppStore} from '@/stores/app'
import MediaTypePreviewCard from './MediaTypePreviewCard.vue'
import MediaTypePool from './MediaTypePool.vue'
import MetaFieldPool from './MetaFieldPool.vue'
import type {
  MediaType,
  Meta,
  MetaAssignmentMode,
  MetaInMediaTypeAssignment,
  MetaInMediaTypeRow,
} from '@/types/metaAssignment'

const props = withDefaults(defineProps<{
  mode?: MetaAssignmentMode
  anchorMeta?: Meta | null
  anchorMediaType?: MediaType | null
  pinnedMedia?: MetaInMediaTypeAssignment[]
  pinnedItems?: MetaInMediaTypeRow[]
  allMeta?: Meta[]
}>(), {
  mode: 'from-meta',
  anchorMeta: null,
  anchorMediaType: null,
  pinnedMedia: () => [],
  pinnedItems: () => [],
  allMeta: () => [],
})

const emit = defineEmits<{
  'pin-media': [mediaType: MediaType]
  'unpin-media': [mediaType: MediaType]
  'pin-meta': [meta: Meta]
  'unpin-meta': [item: MetaInMediaTypeRow]
  reorder: [items: MetaInMediaTypeRow[]]
  'toggle-show': [item: MetaInMediaTypeRow]
}>()

const {t} = useI18n()
const allMediaTypes = computed(() => useAppStore().mediaTypes || [])

const mediaDragOptions = {
  animation: 180,
  group: {name: 'media-type-assign', pull: true, put: true},
  ghostClass: 'media-type-preview-card--ghost',
}

const pinnedMediaTypeIds = computed(() => props.pinnedMedia.map((i) => i.mediaTypeId))
const pinnedMetaIds = computed(() => props.pinnedItems.map((i) => i.metaId))

const pinnedMediaCards = computed(() =>
  props.pinnedMedia
    .map((row) => row.mediaType || allMediaTypes.value.find((mt) => mt.id === row.mediaTypeId))
    .filter((mediaType): mediaType is MediaType => mediaType != null)
)

const poolHint = computed(() =>
  props.mode === 'from-meta'
    ? t('meta.settings.assignment_media_drag_hint')
    : t('meta.settings.assignment_fields_drag_hint')
)

const targetTitle = computed(() =>
  props.mode === 'from-meta'
    ? t('meta.settings.pinned_media_types')
    : t('meta.settings.pinned_fields')
)

const hasPinnedItems = computed(() =>
  props.mode === 'from-meta'
    ? pinnedMediaCards.value.length > 0
    : props.pinnedItems.length > 0
)

const findAddedMeta = (next: MetaInMediaTypeRow[], prev: MetaInMediaTypeRow[]) => {
  const prevIds = new Set(prev.map((item) => item.metaId))
  return next.find((item) => !prevIds.has(item.metaId))
}

const findRemovedMeta = (next: MetaInMediaTypeRow[], prev: MetaInMediaTypeRow[]) => {
  const nextIds = new Set(next.map((item) => item.metaId))
  return prev.find((item) => !nextIds.has(item.metaId))
}

const findAddedMediaType = (next: MediaType[], prev: MediaType[]) => {
  const prevIds = new Set(prev.map((item) => item.id))
  return next.find((item) => !prevIds.has(item.id))
}

const findRemovedMediaType = (next: MediaType[], prev: MediaType[]) => {
  const nextIds = new Set(next.map((item) => item.id))
  return prev.find((item) => !nextIds.has(item.id))
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

const onPinnedMediaChange = (next: MediaType[]) => {
  const prev = pinnedMediaCards.value

  if (next.length > prev.length) {
    const added = findAddedMediaType(next, prev)
    if (added) emit('pin-media', added)
    return
  }

  if (next.length < prev.length) {
    const removed = findRemovedMediaType(next, prev)
    if (removed) emit('unpin-media', removed)
    return
  }
}

const requestPin = (mediaType: MediaType) => emit('pin-media', mediaType)
const requestUnpin = (mediaType: MediaType) => emit('unpin-media', mediaType)
const requestPinMeta = (meta: Meta) => emit('pin-meta', meta)
const requestUnpinMeta = (item?: MetaInMediaTypeRow) => {
  if (item) emit('unpin-meta', item)
}
</script>
