<template>
  <div class="meta-to-meta-board meta-field-board">
    <MetaFieldToggleList
      class="meta-field-board__list"
      :rows="rows"
      :all-meta="allMeta"
      :exclude-ids="excludedIds"
      @pin="$emit('pin', $event)"
      @unpin="onUnpin"
      @reorder="onReorder"
      @toggle-show="onToggleShow"
      @create-field="$emit('create-field')"
    />

    <MetaCardPreview
      class="meta-field-board__preview"
      :icon="parentMeta.icon || 'tag-multiple'"
      :title="t('meta.settings.tag_card_preview_sample_name')"
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
import type {Meta, PinnedChildMetaAssignment} from '@/types/metaAssignment'

const props = withDefaults(defineProps<{
  parentMeta: Meta
  pinnedItems?: PinnedChildMetaAssignment[]
  allMeta?: Meta[]
}>(), {
  pinnedItems: () => [],
  allMeta: () => [],
})

const emit = defineEmits<{
  pin: [meta: Meta]
  unpin: [item: PinnedChildMetaAssignment]
  reorder: [items: PinnedChildMetaAssignment[]]
  'toggle-show': [item: PinnedChildMetaAssignment]
  'create-field': []
}>()

const {t} = useI18n()

// A field can't be pinned to itself.
const excludedIds = computed(() => (props.parentMeta?.id ? [props.parentMeta.id] : []))

const isShown = (item: PinnedChildMetaAssignment) => !(item.show === 0 || item.show === false)

const rows = computed((): MetaToggleRow[] =>
  props.pinnedItems.map((item) => ({id: item.pinnedMetaId, meta: item.meta, show: isShown(item)}))
)

const previewFields = computed(() =>
  rows.value.map((row) => ({id: row.id, icon: row.meta?.icon, name: row.meta?.name, type: row.meta?.type, hidden: !row.show}))
)

const findItem = (pinnedMetaId: number) =>
  props.pinnedItems.find((item) => item.pinnedMetaId === pinnedMetaId)

const onUnpin = (pinnedMetaId: number) => {
  const item = findItem(pinnedMetaId)
  if (item) emit('unpin', item)
}

const onToggleShow = (pinnedMetaId: number) => {
  const item = findItem(pinnedMetaId)
  if (item) emit('toggle-show', item)
}

const onReorder = (ids: number[]) => {
  const byId = new Map(props.pinnedItems.map((item) => [item.pinnedMetaId, item]))
  const next = ids
    .map((id) => byId.get(id))
    .filter((item): item is PinnedChildMetaAssignment => !!item)
  emit('reorder', next)
}
</script>
