<template>
  <div class="meta-field-form-preview">
    <div class="meta-field-form-preview__label text-caption text-medium-emphasis mb-2">
      <v-icon size="14" start>mdi-eye-outline</v-icon>
      {{ t('meta.dialogs.field_form_preview') }}
    </div>

    <v-card
      class="meta-field-form-preview__card rounded-xl pa-4"
      color="rgba(150, 150, 150, 0.09)"
      variant="flat"
    >
      <!-- String -->
      <v-text-field
        v-if="type === 'string'"
        v-model="stringValue"
        :label="fieldName"
        :hint="fieldHint"
        :prepend-icon="fieldIcon"
        persistent-hint
        clearable
        variant="filled"
        hide-details="auto"
      />

      <!-- Number -->
      <v-text-field
        v-else-if="type === 'number'"
        v-model="numberValue"
        :label="fieldName"
        :hint="fieldHint"
        :prepend-icon="fieldIcon"
        type="number"
        persistent-hint
        clearable
        variant="filled"
        hide-details="auto"
      />

      <!-- Boolean -->
      <v-checkbox
        v-else-if="type === 'boolean'"
        v-model="booleanValue"
        :label="fieldName"
        :hint="fieldHint"
        :prepend-icon="fieldIcon"
        persistent-hint
        hide-details="auto"
      />

      <!-- Date -->
      <v-text-field
        v-else-if="type === 'date'"
        v-model="dateValue"
        :label="fieldName"
        :hint="fieldHint"
        :prepend-icon="fieldIcon"
        type="date"
        persistent-hint
        clearable
        variant="filled"
        hide-details="auto"
      />

      <!-- Rating -->
      <div v-else-if="type === 'rating'" class="d-flex flex-column">
        <div class="text-medium-emphasis text-caption" :class="{ 'pl-9': !!fieldIcon }">
          {{ fieldName }}
        </div>
        <div class="d-flex align-center">
          <v-icon v-if="fieldIcon" :icon="fieldIcon" start />
          <v-rating
            v-model="ratingValue"
            :length="ratingMax"
            :full-icon="ratingFullIcon"
            :empty-icon="ratingEmptyIcon"
            :half-increments="ratingHalf"
            :half-icon="ratingHalfIcon"
            :active-color="ratingColor"
            color="grey-darken-1"
            density="compact"
            clearable
            hover
          />
        </div>
        <div
          v-if="fieldHint"
          class="text-medium-emphasis text-caption"
          :class="{ 'pl-9': !!fieldIcon }"
        >
          {{ fieldHint }}
        </div>
      </div>

      <!-- Tag category (array) — local chips, no API -->
      <v-autocomplete
        v-else-if="type === 'array'"
        v-model="selectedTagIds"
        v-model:search="tagSearch"
        :items="availableTags"
        item-title="name"
        item-value="id"
        :label="fieldName"
        :hint="fieldHint"
        :prepend-icon="fieldIcon"
        :menu-props="{ maxHeight: 240 }"
        multiple
        chips
        closable-chips
        clearable
        hide-selected
        persistent-hint
        variant="filled"
        hide-details="auto"
      >
        <template #no-data>
          <v-btn
            v-if="tagSearch.trim()"
            @click="createDemoTag"
            color="success"
            block
            size="large"
            variant="flat"
          >
            <v-icon start>mdi-tag-plus</v-icon>
            {{ t('meta.fields.create_tag', { name: tagSearch.trim() }) }}
          </v-btn>
          <div v-else class="pa-3 text-medium-emphasis">
            {{ t('common.no_data') }}
          </div>
        </template>

        <template #chip="{ item, props: chipProps }">
          <v-chip
            v-bind="chipProps"
            :label="!!meta.chipLabel"
            :variant="chipVariant"
            :color="chipColorFor(item.raw)"
            :style="chipTextStyle(item.raw)"
            size="small"
            class="ma-1"
          >
            {{ item.raw.name }}
          </v-chip>
        </template>
      </v-autocomplete>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {getTextColor} from '@/services/formatUtils'
import type {Meta} from '@/types/stores'

interface DemoTag {
  id: number
  name: string
  color: string
}

const props = defineProps<{
  meta: Meta
}>()

const {t} = useI18n()

const stringValue = ref('')
const numberValue = ref<string | number>('')
const booleanValue = ref(false)
const dateValue = ref('')
const ratingValue = ref(3)
const selectedTagIds = ref<number[]>([])
const tagSearch = ref('')
const demoTags = ref<DemoTag[]>([])
let nextDemoId = -1

const type = computed(() => props.meta?.type || '')

const fieldName = computed(() =>
  props.meta?.name?.trim() || t('meta.dialogs.field_form_preview_unnamed'),
)

const fieldHint = computed(() => props.meta?.hint || '')

const fieldIcon = computed(() =>
  props.meta?.icon ? `mdi-${props.meta.icon}` : '',
)

const ratingMax = computed(() => Number(props.meta?.ratingMax) || 5)
const ratingHalf = computed(() => !!props.meta?.ratingHalf)
const ratingColor = computed(() => props.meta?.ratingColor || '#ffab00')
const ratingFullIcon = computed(() => `mdi-${props.meta?.ratingIcon || 'star'}`)
const ratingEmptyIcon = computed(() =>
  `mdi-${props.meta?.ratingIconEmpty || props.meta?.ratingIcon || 'star-outline'}`,
)
const ratingHalfIcon = computed(() =>
  `mdi-${props.meta?.ratingIconHalf || 'star-half-full'}`,
)

const chipVariant = computed(() =>
  (props.meta?.chipVariant || 'flat') as 'text' | 'flat' | 'elevated' | 'outlined' | 'plain' | 'tonal',
)

const colorsEnabled = computed(() => !!props.meta?.color)

/** tonal/outlined need an explicit color — without it chips look blank */
const chipColorFor = (tag?: DemoTag) => {
  if (colorsEnabled.value && tag?.color) return tag.color
  return 'primary'
}

const chipTextStyle = (tag?: DemoTag) => {
  if (!colorsEnabled.value || !tag?.color) return undefined
  const textColor = getTextColor(tag.color, chipVariant.value === 'outlined')
  return textColor ? {color: textColor} : undefined
}

const availableTags = computed(() => demoTags.value)

const seedDemoTags = () => {
  demoTags.value = [
    {id: -1, name: t('meta.dialogs.field_form_preview_demo_tag_1'), color: '#e91e63'},
    {id: -2, name: t('meta.dialogs.field_form_preview_demo_tag_2'), color: '#2196f3'},
    {id: -3, name: t('meta.dialogs.field_form_preview_demo_tag_3'), color: '#4caf50'},
  ]
  selectedTagIds.value = [-1, -2]
  nextDemoId = -4
  tagSearch.value = ''
}

const resetValues = () => {
  stringValue.value = ''
  numberValue.value = ''
  booleanValue.value = false
  dateValue.value = ''
  ratingValue.value = Math.min(3, ratingMax.value)
  seedDemoTags()
}

const createDemoTag = () => {
  const name = tagSearch.value.trim()
  if (!name) return
  const id = nextDemoId--
  const colors = ['#e91e63', '#2196f3', '#4caf50', '#ff9800', '#9c27b0']
  demoTags.value = [
    ...demoTags.value,
    {id, name, color: colors[Math.abs(id) % colors.length]},
  ]
  selectedTagIds.value = [...selectedTagIds.value, id]
  tagSearch.value = ''
}

watch(type, () => {
  resetValues()
}, {immediate: true})

watch(ratingMax, (max) => {
  if (ratingValue.value > max) {
    ratingValue.value = max
  }
})
</script>

<style scoped>
.meta-field-form-preview {
  margin-bottom: 16px;
  padding: 12px;
  border-radius: 16px;
  border: 1px dashed rgba(var(--v-border-color), var(--v-border-opacity));
  background: rgba(var(--v-theme-surface), 0.4);
  overflow: visible;
}

.meta-field-form-preview__label {
  display: flex;
  align-items: center;
}

.meta-field-form-preview__card {
  pointer-events: auto;
  overflow: visible;
}
</style>
