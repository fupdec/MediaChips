<template>
  <div v-if="counts.total" class="bulk-scrape-process-status">
    <v-chip size="small" variant="tonal" class="bulk-scrape-process-status__chip">
      {{ t('scraper.bulk_status.total', { count: counts.total }) }}
    </v-chip>
    <v-chip
      v-if="counts.searching"
      size="small"
      color="info"
      variant="tonal"
      class="bulk-scrape-process-status__chip"
    >
      {{ t('scraper.bulk_status.searching', { count: counts.searching }) }}
    </v-chip>
    <v-chip
      v-if="counts.pending"
      size="small"
      variant="outlined"
      class="bulk-scrape-process-status__chip"
    >
      {{ t('scraper.bulk_status.pending', { count: counts.pending }) }}
    </v-chip>
    <v-chip
      v-if="counts.done"
      size="small"
      color="success"
      variant="tonal"
      class="bulk-scrape-process-status__chip"
    >
      {{ t('scraper.bulk_status.done', { count: counts.done }) }}
    </v-chip>
    <v-chip
      v-if="counts.notFound"
      size="small"
      color="warning"
      variant="tonal"
      class="bulk-scrape-process-status__chip"
    >
      {{ t('scraper.bulk_status.not_found', { count: counts.notFound }) }}
    </v-chip>
    <v-chip
      v-if="counts.error"
      size="small"
      color="error"
      variant="tonal"
      class="bulk-scrape-process-status__chip"
    >
      {{ t('scraper.bulk_status.error', { count: counts.error }) }}
    </v-chip>
    <v-chip
      v-if="counts.cancelled"
      size="small"
      variant="outlined"
      class="bulk-scrape-process-status__chip"
    >
      {{ t('scraper.bulk_status.cancelled', { count: counts.cancelled }) }}
    </v-chip>
  </div>
</template>

<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import type { BulkScrapeStatusCounts } from '../../utils/bulkScrapeStatusCounts'

defineProps<{
  counts: BulkScrapeStatusCounts
}>()

const {t} = useI18n()
</script>

<style scoped>
.bulk-scrape-process-status {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 16px 8px;
}

.bulk-scrape-process-status__chip {
  font-size: 12px;
}
</style>
