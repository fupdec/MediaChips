<template>
  <v-card
    class="bulk-field-card rounded-xl pa-4"
    :class="fieldCardClass"
    color="rgba(150, 150, 150, 0.09)"
    variant="flat"
  >
    <div
      class="bulk-field-card__header"
      :class="{'bulk-field-card__header--solo': !showValueInput}"
    >
      <v-btn
        @click="$emit('toggle-mode')"
        :key="`${field.key}_${refreshKey}`"
        size="small"
        variant="tonal"
        :color="editMode.color"
        icon
      >
        <v-icon :icon="editMode.icon" size="20"/>
      </v-btn>

      <div class="bulk-field-card__title flex-grow-1 min-width-0">
        <div class="d-flex align-center flex-wrap ga-2">
          <v-icon
            v-if="showIcons && field.icon"
            :icon="`mdi-${field.icon}`"
            size="18"
            class="text-medium-emphasis"
          />
          <span class="text-subtitle-2 font-weight-medium text-truncate">
            {{ field.name }}
          </span>
          <v-chip
            :color="editMode.color"
            variant="tonal"
            size="x-small"
          >
            {{ editMode.label }}
          </v-chip>
        </div>
        <div v-if="field.hint" class="text-caption text-medium-emphasis mt-1">
          {{ field.hint }}
        </div>
      </div>
    </div>

    <div
      v-if="showValueInput"
      class="bulk-field-card__body"
    >
      <MetaInputArray
        v-if="field.type === 'array'"
        @update:model-value="$emit('update:value', $event)"
        :model-value="Array.isArray(value) ? (value as number[]) : []"
        :meta-id="Number(field.key)"
        :disabled="disabled"
        purpose="bulk"
        variant="filled"
        hide-details="auto"
        multiple
      />

      <v-number-input
        v-else-if="field.type === 'number'"
        :model-value="numberModel"
        @update:model-value="$emit('update:value', $event)"
        :label="field.name"
        :prepend-icon="showIcons ? `mdi-${field.icon}` : ''"
        :disabled="disabled"
        :rules="[numberRules]"
        :precision="null"
        control-variant="split"
        hide-details="auto"
        clearable
        variant="filled"
      />

      <v-textarea
        v-else-if="field.type === 'string'"
        :model-value="typeof value === 'string' ? value : value == null ? '' : String(value)"
        @update:model-value="$emit('update:value', $event)"
        :label="field.name"
        :prepend-icon="showIcons ? `mdi-${field.icon}` : ''"
        :disabled="disabled"
        hide-details="auto"
        clearable
        auto-grow
        rows="1"
        variant="filled"
      />

      <v-checkbox
        v-else-if="field.type === 'boolean'"
        :model-value="value"
        @update:model-value="$emit('update:value', $event)"
        :label="field.name"
        :prepend-icon="showIcons ? `mdi-${field.icon}` : ''"
        :disabled="disabled"
        hide-details
        density="compact"
      />

      <v-text-field
        v-else-if="field.type === 'date'"
        @click="$emit('pick-date')"
        @click:clear="$emit('clear-date')"
        :model-value="value"
        :label="field.name"
        :prepend-icon="showIcons ? `mdi-${field.icon}` : ''"
        :disabled="disabled"
        hide-details="auto"
        readonly
        clearable
        variant="filled"
      />

      <div v-else-if="field.type === 'rating'" class="d-flex align-center pt-1">
        <v-rating
          :model-value="typeof value === 'number' ? value : undefined"
          @update:model-value="$emit('update:value', $event)"
          :length="fieldMeta.ratingMax"
          :full-icon="`mdi-${fieldMeta.ratingIcon}`"
          :empty-icon="`mdi-${fieldMeta.ratingIconEmpty || fieldMeta.ratingIcon}`"
          :half-increments="fieldMeta.ratingHalf"
          :half-icon="`mdi-${fieldMeta.ratingIconHalf || fieldMeta.ratingIcon}`"
          :color="fieldMeta.ratingColor"
          :readonly="disabled"
          background-color="grey"
          density="compact"
          clearable
          hover
        />
      </div>

      <div v-else-if="field.type === 'preset-rating'" class="d-flex align-center pt-1">
        <v-rating
          :model-value="typeof value === 'number' ? value : undefined"
          @update:model-value="$emit('update:value', $event)"
          color="yellow-darken-3"
          background-color="grey-darken-1"
          empty-icon="mdi-star-outline"
          half-icon="mdi-star-half-full"
          half-increments
          :readonly="disabled"
          density="compact"
          clearable
          hover
        />
      </div>

      <div v-else-if="field.type === 'preset-favorite'" class="d-flex align-center pt-1">
        <v-checkbox
          :model-value="value"
          @update:model-value="$emit('update:value', $event)"
          :false-value="0"
          :true-value="1"
          false-icon="mdi-heart-outline"
          true-icon="mdi-heart"
          color="pink"
          :disabled="disabled"
          hide-details
          density="compact"
        />
      </div>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import type {PropType} from 'vue'
import {useI18n} from 'vue-i18n'
import MetaInputArray from '@/components/meta/input/MetaInputArray.vue'

interface BulkEditFieldMeta {
  ratingMax?: number
  ratingIcon?: string
  ratingIconEmpty?: string
  ratingIconHalf?: string
  ratingHalf?: boolean
  ratingColor?: string
}

interface BulkEditField {
  key: string | number
  type: string
  name: string
  icon?: string
  hint?: string
  meta?: BulkEditFieldMeta
}

interface BulkEditMode {
  type: number
  icon: string
  color: string
  label: string
}

const {t} = useI18n()

const props = defineProps({
  field: {
    type: Object as PropType<BulkEditField>,
    required: true,
  },
  editType: {
    type: Number,
    default: 0,
  },
  editMode: {
    type: Object as PropType<BulkEditMode>,
    required: true,
  },
  value: {
    type: [String, Number, Boolean, Array] as PropType<string | number | boolean | unknown[] | null>,
    default: null,
  },
  showIcons: Boolean,
  disabled: Boolean,
  refreshKey: {
    type: [Number, String],
    default: 0,
  },
})

const numberModel = computed((): number | null => {
  const value = props.value
  if (value == null || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
})

const numberRules = (value: unknown) => {
  if (value == null || value === '') return true
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) || t('validation.incorrect_value')
}

defineEmits(['toggle-mode', 'update:value', 'pick-date', 'clear-date'])

const fieldCardClass = computed(() => ({
  'bulk-field-card--keep': props.editType === 0,
  'bulk-field-card--delete': props.editType === 1,
  'bulk-field-card--replace': props.editType === 2,
  'bulk-field-card--add': props.editType === 3,
}))

const showValueInput = computed(() => props.editType === 2 || props.editType === 3)

const fieldMeta = computed(() => props.field.meta || {})
</script>

<style scoped>
.bulk-field-card {
  height: 100%;
  transition: box-shadow 0.2s ease;
}

.bulk-field-card--delete {
  box-shadow: inset 3px 0 0 rgb(var(--v-theme-error));
}

.bulk-field-card--replace {
  box-shadow: inset 3px 0 0 rgb(var(--v-theme-warning));
}

.bulk-field-card--add {
  box-shadow: inset 3px 0 0 rgb(var(--v-theme-success));
}

.bulk-field-card--keep {
  opacity: 0.92;
}

.bulk-field-card__header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}

.bulk-field-card__header--solo {
  margin-bottom: 0;
}

.bulk-field-card__title {
  min-width: 0;
}

.bulk-field-card__body :deep(.v-field) {
  border-radius: 12px;
}
</style>
