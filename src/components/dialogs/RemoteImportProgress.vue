<template>
  <div v-if="active || stats.found || stats.skipped || stats.inLibrary || (canRetry && retryCount)" class="remote-import-progress my-3" role="status" aria-live="polite">
    <div v-if="active" class="text-caption mb-1">
      {{ scanning ? t('nas.scanning') : t('nas.batch_progress', {done: processed, total}) }}
    </div>
    <v-progress-linear v-if="active" height="3" rounded :indeterminate="scanning"
                       :model-value="total ? 100 * processed / total : 0" />
    <div class="text-caption mt-1">
      {{ t('nas.batch_counts', {found: stats.found, added: stats.added, duplicates: stats.inLibrary + stats.duplicates, skipped: stats.skipped}) }}
    </div>
    <v-btn v-if="!active && canRetry && retryCount" class="mt-2" size="small" variant="tonal" color="primary" rounded="lg" @click="$emit('retry')">
      {{ t('nas.retry_remaining', {count: retryCount}) }}
    </v-btn>
    <p v-if="!active && canRetry && retryCount" class="text-caption mt-1 mb-0">{{ t('nas.batch_retry') }}</p>
  </div>
</template>

<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import type {RemoteSelectionProgress} from '@/services/remoteImportSelection'

defineProps<{
  active: boolean
  scanning: boolean
  processed: number
  total: number
  stats: RemoteSelectionProgress & {added: number; duplicates: number}
  retryCount: number
  canRetry: boolean
}>()
defineEmits<{retry: []}>()
const {t} = useI18n()
</script>
