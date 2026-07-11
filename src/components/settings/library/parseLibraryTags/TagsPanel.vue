<template>
  <v-card variant="outlined" class="panel-card">
    <div class="panel-card__header">
      <div>
        <div class="text-subtitle-2">
          {{ t('settings_labels.library.parse_library_tags_global_tags_title') }}
        </div>
        <div class="text-caption text-medium-emphasis">
          {{ t('settings_labels.library.parse_library_tags_global_tags_hint') }}
        </div>
      </div>
    </div>

    <v-text-field
      :model-value="tagSearch"
      @update:model-value="emit('update:tagSearch', $event ?? '')"
      :placeholder="t('settings_labels.library.parse_library_tags_search_tags')"
      prepend-inner-icon="mdi-magnify"
      density="compact"
      variant="outlined"
      rounded="lg"
      hide-details
      clearable
      class="panel-card__search"
    />

    <div class="panel-card__toolbar">
      <v-btn-toggle
        :model-value="tagSortMode"
        @update:model-value="emit('update:tagSortMode', $event)"
        density="compact"
        mandatory
        divided
        rounded="lg"
        color="primary"
      >
        <v-btn value="count" size="small">
          {{ t('settings_labels.library.parse_library_tags_sort_count') }}
        </v-btn>
        <v-btn value="alphabet" size="small">
          {{ t('settings_labels.library.parse_library_tags_sort_alphabet') }}
        </v-btn>
      </v-btn-toggle>
    </div>

    <div class="panel-card__filters">
      <v-chip
        :color="selectedMetaFilter === null ? 'primary' : undefined"
        :variant="selectedMetaFilter === null ? 'flat' : 'outlined'"
        size="small"
        label
        class="meta-filter-chip"
        @click="emit('update:selectedMetaFilter', null)"
      >
        {{ t('settings_labels.library.parse_library_tags_filter_all') }}
      </v-chip>

      <v-chip
        v-for="meta in parserMetas"
        :key="meta.id"
        :color="selectedMetaFilter === meta.id ? 'primary' : undefined"
        :variant="selectedMetaFilter === meta.id ? 'flat' : 'outlined'"
        size="small"
        label
        class="meta-filter-chip"
        @click="emit('update:selectedMetaFilter', meta.id)"
      >
        <v-icon :icon="`mdi-${meta.icon}`" start size="16"/>
        {{ meta.name }}
      </v-chip>
    </div>

    <v-checkbox
      :model-value="selectAll"
      :indeterminate="selectAllIndeterminate"
      :label="t('settings_labels.library.parse_library_tags_select_all_tags')"
      hide-details
      density="compact"
      class="panel-card__select-all"
      @update:model-value="emit('toggleSelectAll', $event)"
    />

    <div ref="listRef" class="panel-card__list">
      <v-virtual-scroll
        v-if="filteredTags.length > 0"
        :height="listHeight"
        :items="filteredTags"
        item-height="44"
      >
        <template #default="{ item }">
          <div class="global-tag-row">
            <v-checkbox
              :model-value="selectedKeys.includes(item.key)"
              hide-details
              density="compact"
              class="global-tag-row__checkbox"
              @update:model-value="(value) => emit('toggleTag', item.key, value)"
            />
            <v-chip color="primary" size="small" label class="global-tag-row__chip">
              <v-icon :icon="`mdi-${item.metaIcon}`" start size="16"/>
              {{ item.tagName }}
            </v-chip>
            <v-chip size="x-small" variant="tonal" class="global-tag-row__count">
              {{ item.mediaCount }}
            </v-chip>
          </div>
        </template>
      </v-virtual-scroll>

      <div v-else class="panel-card__empty text-caption text-medium-emphasis">
        {{ t('settings_labels.library.parse_library_tags_no_tags_filtered') }}
      </div>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAutoListHeight } from '@/composable/useAutoListHeight'

type TagItem = {
  key: string
  tagName: string
  metaIcon: string
  mediaCount: number
}

type MetaItem = {
  id: number
  name: string
  icon: string
}

defineProps<{
  filteredTags: TagItem[]
  selectedKeys: string[]
  selectAll: boolean
  selectAllIndeterminate: boolean
  tagSearch: string
  tagSortMode: 'count' | 'alphabet'
  selectedMetaFilter: number | null
  parserMetas: MetaItem[]
}>()

const emit = defineEmits<{
  'update:tagSearch': [value: string]
  'update:tagSortMode': [value: 'count' | 'alphabet']
  'update:selectedMetaFilter': [value: number | null]
  toggleTag: [key: string, value: boolean | null]
  toggleSelectAll: [value: boolean | null]
}>()

const { t } = useI18n()

const listRef = ref<HTMLElement | null>(null)
const { listHeight } = useAutoListHeight(listRef)
</script>

<style scoped lang="scss">
.panel-card {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 12px;
}

.panel-card__header {
  margin-bottom: 12px;
}

.panel-card__search {
  flex: 0 0 auto;
  margin-bottom: 8px;
}

.panel-card__toolbar {
  flex: 0 0 auto;
  margin-bottom: 10px;
}

.panel-card__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.panel-card__select-all {
  flex: 0 0 auto;
  margin-bottom: 4px;
}

.panel-card__list {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.panel-card__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 16px;
  text-align: center;
}

.meta-filter-chip {
  cursor: pointer;
}

.global-tag-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 4px;
}

.global-tag-row__checkbox {
  flex: 0 0 auto;
}

.global-tag-row__chip {
  min-width: 0;
}

.global-tag-row__count {
  margin-left: auto;
  flex: 0 0 auto;
}
</style>
