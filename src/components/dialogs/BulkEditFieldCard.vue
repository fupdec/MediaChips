<template>
  <div class="field bulk-field">
    <div
      class="editing-field-card prop-row"
      :class="[fieldCardClass, {'prop-row--empty': editType === 0, 'prop-row--dirty': editType !== 0}]"
    >
      <div class="prop-row__label bulk-row__label">
        <v-icon
          v-if="showIcons && field.icon"
          :icon="`mdi-${field.icon}`"
          size="18"
          class="prop-row__icon"
        />
        <div class="bulk-row__text">
          <span class="prop-row__name">{{ field.name }}</span>
          <span v-if="field.hint" class="bulk-row__hint">{{ field.hint }}</span>
        </div>
      </div>

      <div class="bulk-row__content">
      <v-btn-toggle
        :model-value="editType"
        @update:model-value="onSetMode"
        class="bulk-row__modes"
        density="compact"
        variant="outlined"
        rounded="lg"
        divided
        mandatory
      >
        <v-btn
          v-for="mode in modes"
          :key="mode.type"
          :value="mode.type"
          :color="editType === mode.type ? mode.color : undefined"
          :prepend-icon="mode.icon"
          size="small"
        >
          {{ mode.label }}
        </v-btn>
      </v-btn-toggle>

      <div v-if="showValueInput" class="bulk-row__body">
        <MetaInputArray
          v-if="field.type === 'array'"
          @update:model-value="$emit('update:value', $event)"
          :model-value="Array.isArray(value) ? (value as number[]) : []"
          :meta-id="Number(field.key)"
          :disabled="disabled"
          purpose="bulk"
          variant="outlined"
          hide-details="auto"
          multiple
        />

        <v-number-input
          v-else-if="field.type === 'number'"
          :model-value="numberModel"
          @update:model-value="$emit('update:value', $event)"
          :disabled="disabled"
          :rules="[numberRules]"
          :precision="null"
          control-variant="split"
          hide-details="auto"
          clearable
          variant="outlined"
        />

        <v-textarea
          v-else-if="field.type === 'string'"
          :model-value="typeof value === 'string' ? value : value == null ? '' : String(value)"
          @update:model-value="$emit('update:value', $event)"
          :disabled="disabled"
          hide-details="auto"
          clearable
          auto-grow
          rows="1"
          variant="outlined"
        />

        <v-checkbox
          v-else-if="field.type === 'boolean'"
          :model-value="value"
          @update:model-value="$emit('update:value', $event)"
          :disabled="disabled"
          hide-details
          density="compact"
        />

        <v-text-field
          v-else-if="field.type === 'date'"
          @click="$emit('pick-date')"
          @click:clear="$emit('clear-date')"
          :model-value="value"
          :disabled="disabled"
          hide-details="auto"
          readonly
          clearable
          variant="outlined"
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
      <div v-else-if="editType === 1" class="bulk-row__note bulk-row__note--delete">
        {{ t('bulk_editing.hint_delete') }}
      </div>
    </div>
    </div>
  </div>
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
  allModes: {
    type: Array as PropType<BulkEditMode[]>,
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

const emit = defineEmits(['set-mode', 'update:value', 'pick-date', 'clear-date'])

const onSetMode = (mode: unknown) => {
  if (typeof mode === 'number') emit('set-mode', mode)
}

// Arrays (tags) can also be appended to; every other field is either replaced or cleared.
const modes = computed(() => {
  const byType = (type: number) => props.allModes.find((mode) => mode.type === type)
  const order = props.field.type === 'array' ? [0, 3, 2, 1] : [0, 2, 1]
  return order.map(byType).filter((mode): mode is BulkEditMode => !!mode)
})

const fieldCardClass = computed(() => ({
  'bulk-row--keep': props.editType === 0,
  'bulk-row--delete': props.editType === 1,
  'bulk-row--replace': props.editType === 2,
  'bulk-row--add': props.editType === 3,
}))

const showValueInput = computed(() => props.editType === 2 || props.editType === 3)

const fieldMeta = computed(() => props.field.meta || {})
</script>

<style scoped>
/* Row surface, label column, hover/focus and input look come from the shared
   edit-dialog styles (.editing--sections .prop-row). Only bulk-specific bits here. */
.bulk-row--delete {
  box-shadow: inset 3px 0 0 rgb(var(--v-theme-error)) !important;
}

.bulk-row--replace {
  box-shadow: inset 3px 0 0 rgb(var(--v-theme-warning)) !important;
}

.bulk-row--add {
  box-shadow: inset 3px 0 0 rgb(var(--v-theme-success)) !important;
}

.bulk-row__label {
  align-self: start;
}

.bulk-row__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.25;
}

.bulk-row--keep .prop-row__name {
  font-weight: 400;
}

.bulk-row__hint {
  font-size: 0.75rem;
  font-weight: 400;
  color: rgba(var(--v-theme-on-surface), 0.55);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bulk-row__content {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  min-width: 0;
  padding-block: calc((var(--prop-control-h) - 32px) / 2);
}

.bulk-row__modes {
  height: 32px;
  max-width: 100%;
  flex-wrap: nowrap;
}

/* The edit dialog forces `min-height: var(--edit-deck-control-h)` on every
   non-icon button; that inflates these small segmented buttons past the group
   and clips the outline. Keep the original compact sizing. */
.bulk-row__modes :deep(.v-btn) {
  min-height: 0 !important;
  font-size: var(--v-btn-size) !important;
}

.bulk-row__body {
  width: 100%;
}

.bulk-row__note {
  padding-inline: 2px;
  font-size: 0.75rem;
}

.bulk-row__note--delete {
  color: rgb(var(--v-theme-error));
}

@media (max-width: 600px) {
  .bulk-row__modes :deep(.v-btn__prepend) {
    display: none;
  }
}
</style>
