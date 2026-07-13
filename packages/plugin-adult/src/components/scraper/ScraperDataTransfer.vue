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

  <v-card-actions class="px-0">
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
  <v-table class="transfer-table" density="compact">
    <thead>
    <tr>
      <th class="pl-8" style="width: 20%">{{ t('common.meta') }}</th>
      <th style="width: 10%">{{ t('filters.parameter') }}</th>
      <th class="text-right pr-12" style="width: 35%">{{ t('common.current') }}</th>
      <th style="width: 35%">{{ t('common.found') }}</th>
    </tr>
    </thead>
    <tbody>
    <tr v-for="(item, index) in fields" :key="index">
      <td class="pl-12">
        <v-btn
          @click="restore(item)"
          :disabled="!item.isTransfered"
          class="restore-btn"
          color="primary"
          size="small"
          variant="text"
          icon
        >
          <v-icon>mdi-restore</v-icon>
        </v-btn>
        <v-icon size="20"> mdi-{{ item.meta.icon }}</v-icon>
        {{ getMetaName(item.meta, t) }}
      </td>

      <td>{{ getScraperFieldName(item.key) }}</td>

      <td class="text-right pr-12">
        <span> {{ item.valueCurrent }} </span>
        <v-btn
          @click="transfer(item)"
          :disabled="item.isTransfered || item.isAlreadyContain"
          class="transfer-btn"
          color="primary"
          size="small"
          variant="text"
          icon
        >
          <v-icon>mdi-transfer-left</v-icon>
        </v-btn>
      </td>

      <td>{{ item.valueScraper }}</td>
    </tr>
    </tbody>
  </v-table>

  <ScraperSelectImages v-if="selected" :selected="selected"></ScraperSelectImages>
</template>

<script setup lang="ts">
import {computed, onMounted, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useScraperStore} from '@/stores/scraper'
import {useAppStore} from '@/stores/app'
import {getMetaName} from "@/utils/metaI18n"
import {buildScraperTransferFields, mergeBookmarkValues, mergeSynonymValues} from '@/utils/scraperTransferFields'

import ScraperSelectImages from './ScraperSelectImages.vue'

function cloneTransferValue(value: unknown): unknown {
  if (Array.isArray(value)) return [...value]
  if (value && typeof value === 'object') return {...value as Record<string, unknown>}
  return value
}
import type {
  ScraperPinnedItem,
  ScraperSelectedResult,
  ScraperTransferField,
} from '@/types/scraper'

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

const getScraperFieldName = (key: string) => t(`scraper.fields.${key}`, key)

async function getData() {
  if (!props.selected) return

  scraperStore.fields = buildScraperTransferFields({
    selected: props.selected,
    pinned: pinned.value,
    currentValues: currentValues.value,
    tags: appStore.tags || [],
  })
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
    const current = Array.isArray(item.valueCurrent) ? [...item.valueCurrent] : []
    const scraped = Array.isArray(item.valueScraper)
      ? item.valueScraper.map((entry) => String(entry))
      : [String(item.valueScraper)]

    for (const name of scraped) {
      if (name && !current.includes(name)) {
        current.push(name)
      }
    }

    item.valueCurrent = current
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
  getData()
})

watch(
  [() => props.selected, pinned, currentValues],
  () => {
    getData()
  },
  {deep: true},
)
</script>

<style>
.transfer-table {
  .v-table__wrapper {
    overflow: hidden;
  }

  td {
    position: relative;
  }

  .restore-btn,
  .transfer-btn {
    position: absolute;
    top: 0;
    bottom: 0;
    margin: auto;
  }

  .restore-btn {
    left: 0;
  }

  .transfer-btn {
    right: 0;
  }
}
</style>
