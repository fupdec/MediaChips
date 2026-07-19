<template>
  <SettingsSection padded>
    <settings-category-divider
      icon="ruler"
      compact
      :title="t('meta.settings.measurement_unit')"
    />

    <v-alert
      v-if="!currentUnit"
      type="warning"
      variant="tonal"
      density="compact"
      class="mb-3 text-body-2"
      rounded="xl"
    >
      {{ t('meta.settings.measurement_unit_unset') }}
    </v-alert>

    <v-alert
      v-else
      type="info"
      variant="tonal"
      density="compact"
      class="mb-3 text-body-2"
      rounded="xl"
    >
      {{ t('meta.settings.measurement_unit_change_warning') }}
    </v-alert>

    <v-select
      :model-value="currentUnit"
      :items="unitItems"
      item-title="title"
      item-value="value"
      :label="t('meta.settings.measurement_unit')"
      :hint="unitHint"
      persistent-hint
      clearable
      rounded="xl"
      variant="outlined"
      density="comfortable"
      max-width="360"
      @update:model-value="onUnitChange"
      @click:clear="resetUnit"
    />

    <div v-if="currentUnit" class="mt-3">
      <v-btn
        size="small"
        variant="text"
        color="warning"
        rounded="xl"
        @click="resetUnit"
      >
        {{ t('meta.settings.measurement_unit_reset') }}
      </v-btn>
      <div class="text-caption text-medium-emphasis mt-1">
        {{ t('meta.settings.measurement_unit_reset_hint') }}
      </div>
    </div>
  </SettingsSection>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import type {PropType} from 'vue'
import {useI18n} from 'vue-i18n'
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'
import SettingsSection from '@/components/ui/SettingsSection.vue'
import type {Meta} from '@/types/stores'
import {
  getMeasurementKind,
  MEASUREMENT_LENGTH_UNITS,
  MEASUREMENT_WEIGHT_UNITS,
  normalizeMeasurementUnit,
  unitsForKind,
  type MeasurementUnit,
} from '@shared/measurementUnits'

const props = defineProps({
  meta: {
    type: Object as PropType<Meta>,
    default: undefined,
  },
})

const emit = defineEmits<{
  update: [Partial<{measurementUnit: MeasurementUnit | null}>]
}>()

const {t} = useI18n()

const currentUnit = ref<MeasurementUnit | null>(
  normalizeMeasurementUnit(props.meta?.measurementUnit),
)

watch(
  () => props.meta?.measurementUnit,
  (value) => {
    currentUnit.value = normalizeMeasurementUnit(value)
  },
)

const unitItems = computed(() => {
  if (currentUnit.value) {
    return unitsForKind(getMeasurementKind(currentUnit.value)).map((unit) => ({
      value: unit,
      title: t(`meta.settings.measurement_units.${unit}`),
    }))
  }

  return [
    ...MEASUREMENT_LENGTH_UNITS.map((unit) => ({
      value: unit,
      title: `${t('meta.settings.measurement_kind_length')} · ${t(`meta.settings.measurement_units.${unit}`)}`,
    })),
    ...MEASUREMENT_WEIGHT_UNITS.map((unit) => ({
      value: unit,
      title: `${t('meta.settings.measurement_kind_weight')} · ${t(`meta.settings.measurement_units.${unit}`)}`,
    })),
  ]
})

const unitHint = computed(() => {
  if (!currentUnit.value) {
    return t('meta.settings.measurement_unit_first_hint')
  }
  return t('meta.settings.measurement_unit_locked_kind_hint', {
    kind: t(`meta.settings.measurement_kind_${getMeasurementKind(currentUnit.value)}`),
  })
})

const onUnitChange = (value: MeasurementUnit | null) => {
  const next = normalizeMeasurementUnit(value)
  currentUnit.value = next
  emit('update', {measurementUnit: next})
}

const resetUnit = () => {
  currentUnit.value = null
  emit('update', {measurementUnit: null})
}
</script>
