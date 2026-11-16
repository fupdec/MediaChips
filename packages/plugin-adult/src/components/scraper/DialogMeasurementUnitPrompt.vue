<template>
  <v-dialog :model-value="modelValue" max-width="640" persistent @update:model-value="emit('update:modelValue', $event)">
    <v-card rounded="xl">
      <DialogHeader
        icon="ruler"
        :header="t('scraper.measurement_unit_prompt_title')"
        closable
        :buttons="headerButtons"
        @close="emit('cancel')"
      />
      <v-card-text class="unit-prompt__body">
        <v-alert type="info" variant="tonal" density="compact" class="text-body-2" rounded="lg">
          {{ t('scraper.measurement_unit_prompt_intro') }}
        </v-alert>
        <v-alert type="warning" variant="tonal" density="compact" class="text-body-2" rounded="lg">
          {{ t('scraper.measurement_unit_prompt_no_convert') }}
        </v-alert>
        <div class="text-caption text-medium-emphasis">
          {{ t('scraper.measurement_unit_prompt_settings_hint') }}
        </div>

        <div class="unit-prompt__fields">
          <div
            v-for="field in fields"
            :key="field.metaId"
            class="unit-prompt__field"
          >
            <div>
              <div class="text-body-2 font-weight-medium">
                {{ field.metaName }}
                <span class="text-caption text-medium-emphasis">
                  ({{ t(`scraper.fields.${field.scraperKey}`, field.scraperKey) }})
                </span>
              </div>
              <div v-if="field.suggestedUnit" class="text-caption text-medium-emphasis">
                {{ t('scraper.measurement_unit_prompt_suggested', {
                  unit: t(`meta.settings.measurement_units.${field.suggestedUnit}`),
                }) }}
              </div>
            </div>
            <v-select
              v-model="selections[field.metaId]"
              :items="unitItemsFor(field.scraperKey)"
              item-title="title"
              item-value="value"
              :label="t('meta.settings.measurement_unit')"
              rounded="lg"
              variant="outlined"
              density="compact"
              hide-details
            />
          </div>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {computed, reactive, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import DialogHeader from '@/components/elements/DialogHeader.vue'
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

const headerButtons = computed(() => [
  {
    icon: 'check',
    text: t('scraper.measurement_unit_prompt_confirm'),
    color: 'primary',
    disabled: !allSelected.value,
    action: confirm,
  },
])

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

<style scoped>
.unit-prompt__body {
  display: grid;
  gap: 8px;
  padding: 12px 16px 16px;
}

.unit-prompt__fields {
  margin-top: 4px;
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.unit-prompt__field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 12rem);
  align-items: center;
  gap: 12px;
  padding-block: 8px;
}

.unit-prompt__field + .unit-prompt__field {
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

@media (max-width: 480px) {
  .unit-prompt__field {
    grid-template-columns: minmax(0, 1fr);
    gap: 4px;
  }
}
</style>
