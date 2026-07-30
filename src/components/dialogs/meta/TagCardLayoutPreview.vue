<template>
  <div class="tag-card-layout-preview">
    <div
      class="tag-card-layout-preview__card"
      :style="cardTintStyle"
    >
      <div
        class="tag-card-layout-preview__thumb"
        :style="{aspectRatio: String(aspectRatio)}"
      >
        <v-icon size="40" color="primary">mdi-{{ meta.icon || 'account' }}</v-icon>
      </div>

      <div class="tag-card-layout-preview__body">
        <div class="tag-card-layout-preview__title text-truncate">
          {{ t('meta.settings.tag_card_preview_sample_name') }}
        </div>

        <div v-if="visibleFields.length" class="nested-tags tag-card-layout-preview__fields">
          <template v-if="groupChips">
            <div
              v-for="field in visibleFields"
              :key="field.pinnedMetaId"
              class="category"
            >
              <div class="category-name d-flex align-center ga-1">
                <v-icon size="14">mdi-{{ field.meta?.icon || 'shape' }}</v-icon>
                <span>{{ field.meta?.name }}</span>
              </div>
              <v-chip
                v-for="(sample, index) in demoValues(field)"
                :key="`${field.pinnedMetaId}_${index}`"
                size="x-small"
                :label="chipLabel"
                :variant="chipVariant"
                :prepend-icon="field.meta?.type === 'array' ? undefined : `mdi-${field.meta?.icon || 'shape'}`"
                :text="sample"
              />
            </div>
          </template>

          <template v-else>
            <template v-for="field in visibleFields" :key="field.pinnedMetaId">
              <v-chip
                v-for="(sample, index) in demoValues(field)"
                :key="`${field.pinnedMetaId}_${index}`"
                size="x-small"
                :label="chipLabel"
                :variant="chipVariant"
                :prepend-icon="`mdi-${field.meta?.icon || 'shape'}`"
                :text="sample"
                :title="field.meta?.name"
              />
            </template>
          </template>
        </div>

        <div
          v-else
          class="text-caption text-medium-emphasis mt-1"
        >
          {{ t('meta.settings.tag_card_preview_no_visible_fields') }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {useSettingsStore} from '@/stores/settings'
import type {Meta} from '@/types/stores'
import type {PinnedChildMetaAssignment} from '@/types/metaAssignment'

const props = defineProps<{
  meta: Meta
  fields: PinnedChildMetaAssignment[]
}>()

const {t} = useI18n()
const settingsStore = useSettingsStore()

const groupChips = computed(() => settingsStore.group_chips_in_card_description === '1')

const aspectRatio = computed(() => {
  const ratio = Number(props.meta.imageAspectRatio)
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1
})

const chipVariant = computed(() => (props.meta.chipVariant as 'flat' | 'text' | 'elevated' | 'tonal' | 'outlined' | 'plain') || 'tonal')
const chipLabel = computed(() => Boolean(props.meta.chipLabel))

const visibleFields = computed(() =>
  props.fields.filter((field) => field.show !== 0 && field.show !== false),
)

const cardTintStyle = computed(() => {
  if (!props.meta.color) return undefined
  return {
    background: 'rgba(var(--v-theme-primary), 0.06)',
  }
})

const demoValues = (field: PinnedChildMetaAssignment): string[] => {
  const type = field.meta?.type
  if (type === 'array') {
    return [
      t('meta.settings.tag_card_preview_demo_tag_1'),
      t('meta.settings.tag_card_preview_demo_tag_2'),
    ]
  }
  if (type === 'number') return ['42']
  if (type === 'boolean') return [t('common.yes')]
  if (type === 'date' || type === 'system-date') return ['2020-05-12']
  if (type === 'rating') return ['4.5']
  if (type === 'country') return ['US']
  return [field.meta?.name || t('meta.settings.tag_card_preview_sample_value')]
}
</script>

<style scoped lang="scss">
.tag-card-layout-preview {
  width: 280px;
  padding: 12px;
}

.tag-card-layout-preview__card {
  border-radius: 14px;
  overflow: hidden;
  background: rgb(var(--v-theme-surface));
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.tag-card-layout-preview__thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  background: rgba(var(--v-theme-on-surface), 0.06);
}

.tag-card-layout-preview__body {
  padding: 8px 10px 10px;
}

.tag-card-layout-preview__title {
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.25;
}

.tag-card-layout-preview__fields {
  margin-top: 4px;
}

.tag-card-layout-preview__fields :deep(.category) {
  margin-top: 4px;
}

.tag-card-layout-preview__fields :deep(.category-name) {
  font-size: 0.7rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
  margin-bottom: 2px;
}

.tag-card-layout-preview__fields :deep(.v-chip) {
  margin: 0.15em 0.1em !important;
  max-width: 100%;
}
</style>
