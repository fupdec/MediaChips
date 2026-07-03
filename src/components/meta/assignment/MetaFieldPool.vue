<template>
  <div class="meta-field-pool">
    <v-text-field
      v-if="searchable"
      v-model="searchQuery"
      :placeholder="t('meta.settings.search_fields')"
      prepend-inner-icon="mdi-magnify"
      density="compact"
      variant="outlined"
      rounded="lg"
      hide-details
      clearable
      class="meta-field-pool__search mb-3"
    />

    <div v-if="draggable && filteredFlatItems.length" class="meta-field-pool__draggable-wrap">
      <draggable
        :list="filteredFlatItems"
        item-key="id"
        v-bind="dragOptions"
        class="meta-field-pool__items"
      >
        <template #item="{element}">
          <v-chip
            variant="outlined"
            :size="compact ? 'x-small' : 'small'"
            class="meta-field-pool__chip meta-field-pool__chip--draggable"
            :disabled="element.disabled"
            :title="element.hint || element.name"
            @dblclick.stop="!element.disabled && $emit('select', element)"
            @click.stop="!element.disabled && $emit('select', element)"
          >
            <v-icon size="16" start>mdi-{{ element.icon }}</v-icon>
            {{ element.name }}
          </v-chip>
        </template>
      </draggable>
    </div>

    <div v-else-if="groupedItems.length" class="meta-field-pool__groups">
      <div v-for="group in groupedItems" :key="group.type" class="meta-field-pool__group">
        <div class="meta-field-pool__group-label text-caption text-medium-emphasis mb-1">
          <v-icon size="14" start>{{ getIconDataType(group.type) }}</v-icon>
          {{ formatDataType(group.type) }}
        </div>
        <div class="meta-field-pool__items">
          <v-chip
            v-for="item in group.items"
            :key="item.id"
            variant="outlined"
            :size="compact ? 'x-small' : 'small'"
            class="meta-field-pool__chip"
            :disabled="item.disabled"
            :title="item.hint || item.name"
            @dblclick.stop="!item.disabled && $emit('select', item)"
            @click.stop="!item.disabled && $emit('select', item)"
          >
            <v-icon size="16" start>mdi-{{ item.icon }}</v-icon>
            {{ item.name }}
          </v-chip>
        </div>
      </div>
    </div>

    <div v-else class="meta-field-pool__empty text-center py-4">
      <v-icon size="40" class="mb-2 text-medium-emphasis">{{ emptyIcon }}</v-icon>
      <div class="text-body-2 text-medium-emphasis">{{ emptyText }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import draggable from 'vuedraggable'
import {getIconDataType, getTextDataType} from '@/services/metaTypeUtils'
import {groupMetaByType} from '@/utils/metaSort'
import type {MetaFieldPoolItem} from '@/types/metaAssignment'

const props = withDefaults(defineProps<{
  items?: MetaFieldPoolItem[]
  excludeIds?: Array<number | string>
  disabledIds?: Array<number | string>
  compact?: boolean
  searchable?: boolean
  draggable?: boolean
  dragGroup?: string
  emptyIcon?: string
  emptyText?: string
}>(), {
  items: () => [],
  excludeIds: () => [],
  disabledIds: () => [],
  compact: false,
  searchable: true,
  draggable: true,
  dragGroup: 'meta-fields-assign',
  emptyIcon: 'mdi-database-check',
  emptyText: '',
})

defineEmits<{
  select: [item: MetaFieldPoolItem]
}>()

const {te, t} = useI18n()
const searchQuery = ref('')
const formatDataType = (type: string) => getTextDataType(type, {te, t})

const dragOptions = computed(() => ({
  animation: 180,
  group: {name: props.dragGroup, pull: 'clone', put: false},
  sort: false,
  ghostClass: 'meta-field-pool__chip--ghost',
}))

const availableItems = computed((): MetaFieldPoolItem[] => {
  const exclude = new Set(props.excludeIds)
  const disabled = new Set(props.disabledIds)
  return props.items
    .filter((item) => !exclude.has(item.id))
    .map((item) => ({
      ...item,
      disabled: disabled.has(item.id),
    }))
})

const matchesSearch = (item: MetaFieldPoolItem) => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return true
  return (item.name || '').toLowerCase().includes(query)
}

const filteredFlatItems = computed(() =>
  availableItems.value.filter(matchesSearch)
)

const groupedItems = computed(() =>
  Object.entries(groupMetaByType(availableItems.value.filter(matchesSearch))).map(([type, groupItems]) => ({
    type,
    items: groupItems,
  }))
)
</script>
