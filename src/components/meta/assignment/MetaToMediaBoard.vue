<template>
  <div class="meta-to-media-board meta-field-board">
    <MetaFieldToggleList
      class="meta-field-board__list"
      :rows="rows"
      :all-meta="allMeta"
      @pin="$emit('pin-meta', $event)"
      @unpin="onUnpin"
      @reorder="onReorder"
      @toggle-show="onToggleShow"
      @create-field="$emit('create-field')"
    />

    <MetaCardPreview
      class="meta-field-board__preview"
      :icon="anchorMediaType?.icon || 'folder'"
      :title="t('meta.settings.media_card_preview_sample_name')"
      :fields="previewFields"
    />
  </div>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import MetaFieldToggleList from './MetaFieldToggleList.vue'
import type {MetaToggleRow} from './MetaFieldToggleList.vue'
import MetaCardPreview from './MetaCardPreview.vue'
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
  'create-field': []
}>()

const {t} = useI18n()

const isShown = (item: MetaInMediaTypeRow) => !(item.show === 0 || item.show === false)

const rows = computed((): MetaToggleRow[] =>
  props.pinnedItems.map((item) => ({id: item.metaId, meta: item.meta, show: isShown(item)}))
)

const previewFields = computed(() =>
  rows.value.map((row) => ({id: row.id, icon: row.meta?.icon, name: row.meta?.name, type: row.meta?.type, hidden: !row.show}))
)

const findItem = (metaId: number) => props.pinnedItems.find((item) => item.metaId === metaId)

const onUnpin = (metaId: number) => {
  const item = findItem(metaId)
  if (item) emit('unpin-meta', item)
}

const onToggleShow = (metaId: number) => {
  const item = findItem(metaId)
  if (item) emit('toggle-show', item)
}

const onReorder = (ids: number[]) => {
  const byId = new Map(props.pinnedItems.map((item) => [item.metaId, item]))
  const next = ids.map((id) => byId.get(id)).filter((item): item is MetaInMediaTypeRow => !!item)
  emit('reorder', next)
}
</script>
