<template>
  <v-dialog :model-value="modelValue" max-width="640" persistent @update:model-value="emit('update:modelValue', $event)">
    <v-card rounded="xl">
      <v-card-title class="text-h6">
        {{ t('scraper.measurement_unit_prompt_title') }}
      </v-card-title>
      <v-card-text>
        <v-alert type="info" variant="tonal" density="compact" class="mb-4 text-body-2" rounded="xl">
          {{ t('scraper.measurement_unit_prompt_intro') }}
        </v-alert>
        <v-alert type="warning" variant="tonal" density="compact" class="mb-4 text-body-2" rounded="xl">
          {{ t('scraper.measurement_unit_prompt_no_convert') }}
        </v-alert>
        <div class="text-body-2 text-medium-emphasis mb-4">
          {{ t('scraper.measurement_unit_prompt_settings_hint') }}
        </div>

        <div
          v-for="field in fields"
          :key="field.metaId"
          class="mb-4"
        >
          <div class="text-body-1 text-high-emphasis mb-1">
            {{ field.metaName }}
            <span class="text-caption text-medium-emphasis">
              ({{ t(`scraper.fields.${field.scraperKey}`, field.scraperKey) }})
            </span>
          </div>
          <div v-if="field.suggestedUnit" class="text-caption text-medium-emphasis mb-1">
            {{ t('scraper.measurement_unit_prompt_suggested', {
              unit: t(`meta.settings.measurement_units.${field.suggestedUnit}`),
            }) }}
          </div>
          <v-select
            v-model="selections[field.metaId]"
            :items="unitItemsFor(field.scraperKey)"
            item-title="title"
            item-value="value"
            :label="t('meta.settings.measurement_unit')"
            rounded="xl"
            variant="outlined"
            density="comfortable"
            hide-details
          />
        </div>
      </v-card-text>
      <v-card-actions class="pa-4">
        <v-btn variant="text" rounded="xl" @click="emit('cancel')">
          {{ t('common.cancel') }}
        </v-btn>
        <v-spacer />
        <v-btn
          color="primary"
          variant="flat"
          rounded="xl"
          :disabled="!allSelected"
          @click="confirm"
        >
          {{ t('scraper.measurement_unit_prompt_confirm') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {computed, reactive, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {
  MEASUREMENT_LENGTH_UNITS,
  MEASUREMENT_WEIGHT_UNITS,
  type MeasurementScraperKey,
  type MeasurementUnit,
} from '@shared/measurementUnits'
import type {MeasurementUnitPromptField} from '../../utils/measurementUnitPrompt'

const props = defineProps<{
  modelValue: boolean
  fields: MeasurementUnitPromptField[]
}>()

const emit = defineEmits<{
  'update:modelValue': [boolean]
  confirm: [Record<number, MeasurementUnit>]
  cancel: []
}>()

const {t} = useI18n()
const selections = reactive<Record<number, MeasurementUnit | null>>({})

watch(
  () => props.fields,
  (fields) => {
    for (const field of fields) {
      selections[field.metaId] = field.suggestedUnit
    }
  },
  {immediate: true, deep: true},
)

const allSelected = computed(() =>
  props.fields.every((field) => Boolean(selections[field.metaId])),
)

function unitItemsFor(scraperKey: MeasurementScraperKey) {
  const units = scraperKey === 'weight' ? MEASUREMENT_WEIGHT_UNITS : MEASUREMENT_LENGTH_UNITS
  return units.map((unit) => ({
    value: unit,
    title: t(`meta.settings.measurement_units.${unit}`),
  }))
}

function confirm() {
  if (!allSelected.value) return
  const result: Record<number, MeasurementUnit> = {}
  for (const field of props.fields) {
    const unit = selections[field.metaId]
    if (!unit) return
    result[field.metaId] = unit
  }
  emit('confirm', result)
}
</script>
