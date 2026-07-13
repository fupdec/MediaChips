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
        :header="t('scene_scraper.auto_scrape_multiple')"
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
          v-if="items.length"
          :height="listHeight"
          :items="items"
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

              <v-list-item-title>{{ item.media.name || `#${item.media.id}` }}</v-list-item-title>
              <v-list-item-subtitle>
                <span v-if="item.status === 'searching'">{{ t('scraper.status.searching') }}</span>
                <span v-else-if="item.status === 'done'">
                  {{ t('scraper.status.matched', { name: item.sceneTitle || '' }) }}
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
import {useSceneScraperStore} from '@/stores/sceneScraper'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import BulkScrapeProcessStatus from './scraper/BulkScrapeProcessStatus.vue'
import {countBulkScrapeStatuses} from '@/utils/bulkScrapeStatusCounts'
import type { SceneScraperBatchItem } from '@/types/sceneScraper'

const {t} = useI18n()
const dialogsStore = useDialogsStore()
const sceneScraperStore = useSceneScraperStore()
const dialog = ref(false)

const items = computed(() =>
  dialogsStore.sceneScraperMultiple.items as SceneScraperBatchItem[],
)
const progress = computed(() => dialogsStore.sceneScraperMultiple.progress)

const statusCounts = computed(() => countBulkScrapeStatuses(items.value))

const ITEM_HEIGHT = 56
const MAX_LIST_HEIGHT = 420

const listHeight = computed(() => {
  const count = items.value.length
  if (!count) return 0
  return Math.min(count * ITEM_HEIGHT, MAX_LIST_HEIGHT)
})

const headerButtons = computed(() => (
  sceneScraperStore.autoScrapeInProgress
    ? [{
      icon: 'stop',
      text: t('common.cancel'),
      color: 'error',
      outlined: false,
      action: () => sceneScraperStore.cancelAutoScrape(),
    }]
    : []
))

function statusColor(status?: SceneScraperBatchItem['status']) {
  if (status === 'done') return 'success'
  if (status === 'searching') return 'primary'
  if (status === 'not_found') return 'warning'
  if (status === 'error') return 'error'
  return undefined
}

function statusIcon(status?: SceneScraperBatchItem['status']) {
  if (status === 'done') return 'mdi-check-circle'
  if (status === 'searching') return 'mdi-loading'
  if (status === 'not_found') return 'mdi-help-circle'
  if (status === 'error') return 'mdi-alert-circle'
  return 'mdi-clock-outline'
}

function hide() {
  dialogsStore.sceneScraperMultiple.show = false
}

function close() {
  if (sceneScraperStore.autoScrapeInProgress) {
    hide()
    return
  }
  dialog.value = false
  dialogsStore.sceneScraperMultiple.show = false
  sceneScraperStore.clearBatchTask()
}

onMounted(() => {
  dialog.value = dialogsStore.sceneScraperMultiple.show
})
</script>

<style scoped>
.bulk-scrape-results__item {
  min-height: 56px;
}
</style>
