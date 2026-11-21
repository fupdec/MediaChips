<template>
  <div class="meta-field-toggle-list">
    <div class="meta-field-toggle-list__toolbar">
      <v-chip
        variant="tonal"
        color="primary"
        size="small"
        prepend-icon="mdi-check-circle-outline"
        class="meta-field-toggle-list__count-chip font-weight-medium"
      >
        {{ t('meta.settings.fields_enabled_count', {enabled: rows.length, total: totalCount}) }}
      </v-chip>
      <v-spacer/>
      <v-btn
        size="small"
        variant="flat"
        color="primary"
        rounded="lg"
        prepend-icon="mdi-plus"
        @click="$emit('create-field')"
      >
        {{ t('meta.settings.add_field') }}
      </v-btn>
    </div>

    <section class="meta-field-toggle-list__section">
      <div class="meta-field-toggle-list__section-title">
        {{ t('meta.settings.fields_enabled_title') }}
      </div>

      <draggable
        v-if="rows.length"
        :model-value="rows"
        item-key="id"
        handle=".meta-field-toggle-list__handle"
        :animation="180"
        ghost-class="meta-field-toggle-list__row--ghost"
        class="meta-field-toggle-list__rows"
        @update:model-value="onReorder"
      >
        <template #item="{element}">
          <div
            class="meta-field-toggle-list__row meta-field-toggle-list__row--enabled"
            :class="{'meta-field-toggle-list__row--dim': !element.show}"
          >
            <v-icon
              size="18"
              class="meta-field-toggle-list__handle text-medium-emphasis"
              :title="t('meta.settings.drag_to_reorder')"
            >
              mdi-drag
            </v-icon>
            <v-icon size="18" color="primary" class="meta-field-toggle-list__icon">
              mdi-{{ element.meta?.icon || 'shape' }}
            </v-icon>
            <span class="meta-field-toggle-list__name" :title="typeLabel(element.meta?.type)">{{ element.meta?.name }}</span>

            <v-btn
              class="meta-field-toggle-list__card-toggle"
              size="x-small"
              variant="text"
              rounded="lg"
              :color="element.show ? 'primary' : undefined"
              :prepend-icon="element.show ? 'mdi-eye-outline' : 'mdi-eye-off-outline'"
              :title="element.show ? t('meta.settings.hide_on_card') : t('meta.settings.show_on_card')"
              @click="$emit('toggle-show', element.id)"
            >
              {{ t('meta.settings.on_card_short') }}
            </v-btn>

            <v-switch
              :model-value="true"
              color="primary"
              density="compact"
              hide-details
              inset
              class="meta-field-toggle-list__switch"
              :aria-label="t('meta.settings.click_to_unpin')"
              :title="t('meta.settings.click_to_unpin')"
              @update:model-value="$emit('unpin', element.id)"
            />
          </div>
        </template>
      </draggable>

      <div v-else class="meta-field-toggle-list__empty">
        <v-icon size="18" class="mr-2">mdi-arrow-down</v-icon>
        {{ t('meta.settings.fields_none_enabled') }}
      </div>
    </section>

    <section class="meta-field-toggle-list__section">
      <div class="d-flex align-center ga-3 flex-wrap mb-4">
        <div class="meta-field-toggle-list__section-title mb-0">
          {{ t('meta.settings.fields_available_title') }}
        </div>
        <v-spacer/>
        <v-text-field
          v-if="available.length > 6"
          v-model="searchQuery"
          :placeholder="t('meta.settings.search_fields')"
          prepend-inner-icon="mdi-magnify"
          density="compact"
          variant="outlined"
          rounded="lg"
          hide-details
          clearable
          class="meta-field-toggle-list__search"
        />
      </div>

      <div v-if="groups.length" class="meta-field-toggle-list__groups">
        <div v-for="group in groups" :key="group.type" class="meta-field-toggle-list__group">
          <div class="meta-field-toggle-list__group-label text-caption text-medium-emphasis">
            {{ typeLabel(group.type) }}
          </div>
          <div class="meta-field-toggle-list__chips">
            <button
              v-for="item in group.items"
              :key="item.id"
              type="button"
              class="meta-field-toggle-list__chip"
              :title="String(item.hint || item.name || '')"
              @click="$emit('pin', item)"
            >
              <v-icon size="16" class="meta-field-toggle-list__chip-icon">mdi-{{ item.icon || 'shape' }}</v-icon>
              <span class="meta-field-toggle-list__chip-name">{{ item.name }}</span>
              <v-icon size="14" class="meta-field-toggle-list__chip-plus">mdi-plus</v-icon>
            </button>
          </div>
        </div>
      </div>

      <div v-else class="meta-field-toggle-list__empty">
        <v-icon size="18" class="mr-2">mdi-check-circle-outline</v-icon>
        {{ available.length ? t('meta.settings.no_meta_available') : t('meta.settings.all_meta_pinned') }}
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import draggable from 'vuedraggable'
import {getTextDataType} from '@/services/metaTypeUtils'
import {groupMetaByType} from '@/utils/metaSort'
import type {Meta} from '@/types/metaAssignment'

export interface MetaToggleRow {
  id: number
  meta?: Meta
  show: boolean
}

const props = withDefaults(defineProps<{
  rows?: MetaToggleRow[]
  allMeta?: Meta[]
  excludeIds?: number[]
}>(), {
  rows: () => [],
  allMeta: () => [],
  excludeIds: () => [],
})

const emit = defineEmits<{
  pin: [meta: Meta]
  unpin: [id: number]
  reorder: [ids: number[]]
  'toggle-show': [id: number]
  'create-field': []
}>()

const {t, te} = useI18n()
const searchQuery = ref('')

const typeLabel = (type?: string) => (type ? getTextDataType(type, {te, t}) : '')

const available = computed((): Meta[] => {
  const taken = new Set<number>([...props.rows.map((row) => row.id), ...props.excludeIds])
  return props.allMeta.filter((meta) => !taken.has(meta.id))
})

const groups = computed(() => {
  const query = (searchQuery.value || '').trim().toLowerCase()
  const filtered = query
    ? available.value.filter((meta) => (meta.name || '').toLowerCase().includes(query))
    : available.value
  return Object.entries(groupMetaByType(filtered)).map(([type, items]) => ({type, items}))
})

const totalCount = computed(() => props.rows.length + available.value.length)

const onReorder = (next: MetaToggleRow[]) => {
  emit('reorder', next.map((row) => row.id))
}
</script>
