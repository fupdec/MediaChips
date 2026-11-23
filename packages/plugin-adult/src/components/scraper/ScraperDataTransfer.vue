<template>
  <v-alert
    type="warning"
    :model-value="metas.length == 0"
    class="mt-4 caption"
    density="compact"
    variant="text"
  >
    {{ t('settings_labels.tools.scraper_no_meta_warning') }} <br/>
    {{ t('settings_labels.tools.scraper_configure_hint') }}
  </v-alert>

  <v-card-actions class="px-0 flex-wrap">
    <v-btn @click="restoreAll" color="primary" class="px-4" rounded variant="flat">
      <v-icon icon="mdi-restore" start></v-icon>
      {{ t('common.restore_all') }}
    </v-btn>
    <v-spacer></v-spacer>
    <v-btn
      @click="transferAll"
      color="primary"
      class="px-4"
      rounded
      variant="flat"
    >
      <v-icon icon="mdi-transfer-left" start></v-icon>
      {{ t('common.transfer_all') }}
    </v-btn>
  </v-card-actions>
  <ul class="transfer-fields">
    <li
      v-for="(item, index) in fields"
      :key="index"
      class="transfer-field"
      :class="{'transfer-field--changed': item.isTransfered}"
    >
      <div class="transfer-field__header">
        <v-icon size="18" :icon="`mdi-${item.meta.icon}`" />
        <div class="transfer-field__title">
          <strong>{{ getMetaName(item.meta, t) }}</strong>
          <div class="text-caption text-medium-emphasis">{{ getScraperFieldName(item.key) }}</div>
        </div>
        <v-btn
          :aria-label="t('common.restore')"
          :title="t('common.restore')"
          :disabled="!item.isTransfered"
          icon="mdi-restore"
          color="primary"
          size="small"
          variant="text"
          @click="restore(item)"
        />
        <v-btn
          :aria-label="t('common.apply')"
          :title="t('common.apply')"
          :disabled="item.isTransfered || item.isAlreadyContain"
          icon="mdi-transfer-left"
          color="primary"
          size="small"
          variant="tonal"
          @click="transfer(item)"
        />
      </div>

      <dl class="transfer-field__values">
        <div>
          <dt>{{ t('common.current') }}</dt>
          <dd>{{ formatTransferValue(item.valueCurrent) }}</dd>
        </div>
        <div>
          <dt>{{ t('common.found') }}</dt>
          <dd>{{ formatTransferValue(item.valueScraper) }}</dd>
        </div>
      </dl>
    </li>
  </ul>

  <ScraperSelectImages v-if="selected" :selected="selected"></ScraperSelectImages>

  <DialogMeasurementUnitPrompt
    v-model="unitPromptOpen"
    :fields="unitPromptFields"
    @confirm="onUnitPromptConfirm"
    @cancel="unitPromptOpen = false"
  />
</template>

<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useScraperStore} from '../../stores/scraper'
import {useAppStore} from '@/stores/app'
import {getMetaName} from "@/utils/metaI18n"
import {cloneTransferValue} from '../../utils/cloneTransferValue'
import {buildScraperTransferFields, mergeBookmarkValues, mergeCountryValues, mergeSynonymValues} from '../../utils/scraperTransferFields'
import {typedApi} from '@/services/typedApi'
import {
  isMeasurementScraperKey,
  normalizeMeasurementUnit,
  type MeasurementUnit,
} from '@shared/measurementUnits'
import DialogMeasurementUnitPrompt from './DialogMeasurementUnitPrompt.vue'
import {
  suggestedUnitForScraperKey,
  type MeasurementUnitPromptField,
} from '../../utils/measurementUnitPrompt'

import ScraperSelectImages from './ScraperSelectImages.vue'

function formatTransferValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(formatTransferValue).join(', ') || '—'
  if (value == null || value === '') return '—'
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

import type {
  ScraperPinnedItem,
  ScraperSelectedResult,
  ScraperTransferField,
} from '../../types/scraper'

const props = defineProps<{
  selected?: ScraperSelectedResult | null
}>()

const scraperStore = useScraperStore()
const appStore = useAppStore()
const {t} = useI18n()

const fields = computed(() => scraperStore.fields)
const pinned = computed(() => scraperStore.pinned as ScraperPinnedItem[])
const metas = computed(() => pinned.value.filter((i) => i.scraper))
const currentValues = computed(() => scraperStore.currentValues)

const unitPromptOpen = ref(false)
const unitPromptFields = ref<MeasurementUnitPromptField[]>([])

const getScraperFieldName = (key: string) => t(`scraper.fields.${key}`, key)

function collectUnsetMeasurementFields(): MeasurementUnitPromptField[] {
  const result: MeasurementUnitPromptField[] = []
  const seen = new Set<number>()

  for (const item of pinned.value) {
    const scraperKey = item.scraper
    if (!isMeasurementScraperKey(scraperKey) || !item.meta) continue
    const metaId = Number(item.meta.id ?? item.pinnedMetaId)
    if (!Number.isFinite(metaId) || seen.has(metaId)) continue
    if (normalizeMeasurementUnit(item.meta.measurementUnit)) continue
    seen.add(metaId)
    result.push({
      metaId,
      metaName: getMetaName(item.meta, t),
      scraperKey,
      suggestedUnit: suggestedUnitForScraperKey(scraperKey),
    })
  }

  return result
}

async function getData() {
  if (!props.selected) return

  const unset = collectUnsetMeasurementFields()
  if (unset.length && !unitPromptOpen.value) {
    unitPromptFields.value = unset
    unitPromptOpen.value = true
  }

  scraperStore.fields = buildScraperTransferFields({
    selected: props.selected,
    pinned: pinned.value,
    currentValues: currentValues.value,
    tags: appStore.tags || [],
  })
}

async function onUnitPromptConfirm(selections: Record<number, MeasurementUnit>) {
  try {
    for (const [metaIdRaw, unit] of Object.entries(selections)) {
      const metaId = Number(metaIdRaw)
      await typedApi.updateMeta(metaId, {measurementUnit: unit})

      const storeMeta = appStore.meta.find((meta) => Number(meta.id) === metaId)
      if (storeMeta) storeMeta.measurementUnit = unit

      for (const item of pinned.value) {
        if (Number(item.meta?.id ?? item.pinnedMetaId) === metaId && item.meta) {
          item.meta.measurementUnit = unit
        }
      }
    }
  } finally {
    unitPromptOpen.value = false
    await getData()
  }
}

function restore(item: ScraperTransferField) {
  item.valueCurrent = cloneTransferValue(item.valueReserved)
  item.isTransfered = false
  scraperStore.fields = [...scraperStore.fields]
}

function transfer(item: ScraperTransferField) {
  if (item.isTransfered || item.isAlreadyContain) return
  if (item.dataType === "array") {
    if (!item.isAlreadyContain && Array.isArray(item.valueCurrent)) {
      item.valueCurrent.push(item.valueScraper)
    }
  } else if (item.dataType === 'country') {
    item.valueCurrent = mergeCountryValues(item.valueCurrent, item.valueScraper)
  } else if (item.dataType === 'synonyms') {
    item.valueCurrent = mergeSynonymValues(item.valueCurrent, item.valueScraper)
  } else if (item.dataType === 'bookmark') {
    item.valueCurrent = mergeBookmarkValues(item.valueCurrent, item.valueScraper)
  } else {
    item.valueCurrent = item.valueScraper
  }
  item.isTransfered = true
}

function restoreAll() {
  scraperStore.fields
    .filter((i) => i.isTransfered)
    .forEach((item) => restore(item))
}

function transferAll() {
  scraperStore.fields
    .filter((i) => !i.isAlreadyContain)
    .forEach((item) => transfer(item))
}

onMounted(() => {
  void getData()
})

watch(
  [() => props.selected, pinned, currentValues],
  () => {
    void getData()
  },
  {deep: true},
)
</script>

<style scoped>
.transfer-fields {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.transfer-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
  min-width: 0;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 12px;
}

.transfer-field--changed {
  border-color: rgba(var(--v-theme-primary), 0.55);
}

.transfer-field__header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: rgba(var(--v-theme-primary), 0.06);
  border-radius: 11px 0 0 11px;
}

.transfer-field__header .v-btn {
  flex-shrink: 0;
}

.transfer-field__title {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.transfer-field__values {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 12px;
  margin: 0;
  padding: 4px 8px;
  font-size: 0.875rem;
  line-height: 1.35;
}

.transfer-field__values dt {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.transfer-field__values dd {
  margin: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

@media (max-width: 720px) {
  .transfer-field {
    grid-template-columns: minmax(0, 1fr);
  }

  .transfer-field__header {
    border-radius: 11px 11px 0 0;
  }
}

@media (max-width: 420px) {
  .transfer-field__values {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
