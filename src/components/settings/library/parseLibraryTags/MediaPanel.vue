<template>
  <v-card variant="outlined" class="panel-card">
    <div class="panel-card__header">
      <div class="text-subtitle-2">
        {{ t('settings_labels.library.parse_library_tags_media_list_title') }}
      </div>
    </div>

    <v-text-field
      :model-value="mediaSearch"
      @update:model-value="emit('update:mediaSearch', $event ?? '')"
      :placeholder="t('settings_labels.library.parse_library_tags_search_media')"
      prepend-inner-icon="mdi-magnify"
      density="compact"
      variant="outlined"
      rounded="lg"
      hide-details
      clearable
      class="panel-card__search"
    />

    <v-checkbox
      :model-value="selectAllMedia"
      :label="t('settings_labels.library.parse_library_tags_select_all')"
      hide-details
      density="compact"
      class="panel-card__select-all"
      @update:model-value="emit('toggleSelectAll', $event)"
    />

    <div ref="listRef" class="panel-card__list">
      <v-virtual-scroll
        v-if="items.length > 0"
        :height="listHeight"
        :items="items"
        item-height="76"
      >
        <template #default="{ item }">
          <div class="preview-row">
            <v-checkbox
              :model-value="selectedIds.includes(item.mediaId)"
              hide-details
              density="compact"
              class="preview-row__checkbox"
              @update:model-value="(value) => emit('toggleMedia', item.mediaId, value)"
            />

            <div class="preview-row__content">
              <div
                class="text-caption text-medium-emphasis preview-row__path"
                :title="item.path"
              >
                {{ formatMediaPath(item.path) }}
              </div>

              <div class="d-flex flex-wrap ga-1">
                <v-chip
                  v-for="tag in item.tags"
                  :key="`${item.mediaId}-${tag.metaId}-${tag.tagId}`"
                  color="primary"
                  variant="tonal"
                  size="x-small"
                  label
                >
                  <v-icon :icon="`mdi-${metaIcon(tag.metaId)}`" start size="14"/>
                  {{ tag.tagName }}
                </v-chip>
              </div>
            </div>
          </div>
        </template>
      </v-virtual-scroll>

      <div v-else class="panel-card__empty text-caption text-medium-emphasis">
        {{ t('settings_labels.library.parse_library_tags_no_media_filtered') }}
      </div>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAutoListHeight } from '@/composable/useAutoListHeight'
import type { ParseLibraryTagsPreviewItem } from '@/types/settings'

defineProps<{
  items: ParseLibraryTagsPreviewItem[]
  selectedIds: number[]
  selectAllMedia: boolean
  mediaSearch: string
  metaIcon: (metaId: number) => string
}>()

const emit = defineEmits<{
  'update:mediaSearch': [value: string]
  toggleMedia: [mediaId: number, value: boolean | null]
  toggleSelectAll: [value: boolean | null]
}>()

const { t } = useI18n()

const listRef = ref<HTMLElement | null>(null)
const { listHeight } = useAutoListHeight(listRef)

const formatMediaPath = (path: string) => {
  const parts = String(path || '').replace(/\\/g, '/').split('/').filter(Boolean)
  if (parts.length <= 2) return path
  return `…/${parts.slice(-2).join('/')}`
}
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

.preview-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-height: 76px;
  padding: 8px 4px;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.preview-row__checkbox {
  flex: 0 0 auto;
  margin-top: -2px;
}

.preview-row__content {
  min-width: 0;
  flex: 1 1 auto;
}

.preview-row__path {
  word-break: break-all;
  margin-bottom: 6px;
  user-select: text;
}
</style>
