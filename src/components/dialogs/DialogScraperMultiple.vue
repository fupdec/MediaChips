<template>
  <v-dialog
    v-if="dialog"
    @update:model-value="close"
    :model-value="dialog"
    width="800"
  >
    <v-card>
      <DialogHeader
        @close="close"
        :header="t('scraper.auto_scrape_multiple')"
        :buttons="headerButtons"
        closable
      />

      <v-progress-linear
        :model-value="progress"
        color="primary"
        class="mb-0"
      />

      <BulkScrapeProcessStatus :counts="statusCounts" />

      <v-card-text class="pa-0">
        <v-virtual-scroll
          v-if="performers.length"
          :height="listHeight"
          :items="performers"
          :item-height="ITEM_HEIGHT"
          class="virtual-scroller bulk-scrape-results"
        >
          <template #default="{ item }">
            <v-list-item density="compact" class="bulk-scrape-results__item">
              <template #prepend>
                <v-icon :color="statusColor(item.status)">
                  {{ statusIcon(item.status) }}
                </v-icon>
              </template>

              <v-list-item-title>{{ item.tagName || item.performer.name }}</v-list-item-title>
              <v-list-item-subtitle>
                <span v-if="item.status === 'searching'">{{ t('scraper.status.searching') }}</span>
                <span v-else-if="item.status === 'done'">
                  {{ t('scraper.status.matched', { name: item.matchedName || '' }) }}
                </span>
                <span v-else-if="item.status === 'not_found'">{{ t('scraper.status.not_found') }}</span>
                <span v-else-if="item.error === 'cancelled'">{{ t('scraper.status.cancelled') }}</span>
                <span v-else-if="item.status === 'error'">{{ t('scraper.status.error') }}</span>
                <span v-else>{{ t('scraper.status.pending') }}</span>
              </v-list-item-subtitle>
            </v-list-item>
          </template>
        </v-virtual-scroll>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {computed, ref, onMounted} from 'vue'
import {useI18n} from 'vue-i18n'
import {useDialogsStore} from '@/stores/dialogs'
import {useScraperStore} from '@/stores/scraper'
import {useAppStore} from '@/stores/app'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import BulkScrapeProcessStatus from '@/components/scraper/BulkScrapeProcessStatus.vue'
import {countBulkScrapeStatuses} from '@/utils/bulkScrapeStatusCounts'
import type { ScraperMultiplePerformer } from '@/types/scraper'

const {t} = useI18n()
const dialogsStore = useDialogsStore()
const scraperStore = useScraperStore()
const appStore = useAppStore()
const dialog = ref(false)

const performers = computed(() =>
  dialogsStore.scraperMultiple.performers as ScraperMultiplePerformer[]
)
const progress = computed(() => dialogsStore.scraperMultiple.progress)

const statusCounts = computed(() => countBulkScrapeStatuses(performers.value))

const ITEM_HEIGHT = 56
const MAX_LIST_HEIGHT = 420

const listHeight = computed(() => {
  const count = performers.value.length
  if (!count) return 0
  return Math.min(count * ITEM_HEIGHT, MAX_LIST_HEIGHT)
})

const performerMeta = computed(() => {
  const scraperMeta = appStore.meta.find((item) => item.scraper)
  return scraperMeta ?? null
})

const hasFailed = computed(() =>
  performers.value.some((item) => item.status === 'not_found' || item.status === 'error'),
)

const headerButtons = computed(() => {
  const buttons = []

  if (scraperStore.autoScrapeInProgress) {
    buttons.push({
      icon: 'stop',
      text: t('common.cancel'),
      color: 'error',
      outlined: true,
      action: () => scraperStore.cancelAutoScrape(),
    })
    return buttons
  }

  if (hasFailed.value && performerMeta.value) {
    buttons.push({
      icon: 'refresh',
      text: t('scraper.retry_failed'),
      color: 'warning',
      outlined: false,
      action: retryFailed,
    })
  }

  buttons.push({
    icon: 'close',
    text: t('common.close'),
    color: 'primary',
    outlined: false,
    action: close,
  })

  return buttons
})

function statusIcon(status?: ScraperMultiplePerformer['status']) {
  switch (status) {
    case 'searching':
      return 'mdi-loading'
    case 'done':
      return 'mdi-check-circle'
    case 'not_found':
      return 'mdi-alert-circle-outline'
    case 'error':
      return 'mdi-close-circle'
    default:
      return 'mdi-clock-outline'
  }
}

function statusColor(status?: ScraperMultiplePerformer['status']) {
  switch (status) {
    case 'done':
      return 'success'
    case 'not_found':
      return 'warning'
    case 'error':
      return 'error'
    case 'searching':
      return 'info'
    default:
      return undefined
  }
}

async function retryFailed() {
  if (!performerMeta.value) return
  await scraperStore.retryFailedAutoScrape(performerMeta.value)
}

function hide() {
  dialogsStore.scraperMultiple.show = false
}

function close() {
  if (scraperStore.autoScrapeInProgress) {
    hide()
    return
  }
  dialog.value = false
  dialogsStore.scraperMultiple.show = false
  scraperStore.clearBatchTask()
}

onMounted(() => {
  dialog.value = dialogsStore.scraperMultiple.show
})
</script>

<style scoped>
.bulk-scrape-results__item {
  min-height: 56px;
}
</style>
