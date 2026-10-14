<template>
  <MediaImportSection :embedded="embedded" :title="t('media.adding.web_video_title')" icon="link-variant" class="web-video-import">
    <div class="web-video-import__input-row">
      <v-text-field
        v-model="url"
        class="web-video-import__url"
        :label="t('media.adding.web_video_url')"
        :aria-describedby="hintId"
        :disabled="busy"
        density="compact"
        hide-details
        variant="outlined"
        rounded="lg"
        autocapitalize="none"
        :spellcheck="false"
        @keydown.enter.prevent="importVideo"
      />
      <v-btn
        v-if="!embedded"
        size="small"
        variant="tonal"
        color="primary"
        rounded="lg"
        icon
        :aria-label="t('media.adding.web_video_import')"
        v-tooltip:top="t('media.adding.web_video_import')"
        :loading="busy"
        :disabled="!validUrl || busy"
        @click="importVideo"
      >
        <v-icon size="18" icon="mdi-plus" />
      </v-btn>
    </div>
    <div :id="hintId" class="web-video-import__hint text-medium-emphasis">{{ t('media.adding.web_video_hint') }}</div>
    <v-alert v-if="message" :type="error ? 'error' : 'success'" variant="tonal" density="compact" rounded="lg"
             class="web-video-import__notice" role="status" aria-live="polite">
      {{ message }}
    </v-alert>
    <div v-if="busy" class="web-video-import__progress" role="status" aria-live="polite">
      <v-progress-linear height="3" color="primary" rounded indeterminate />
      <div class="web-video-import__hint text-medium-emphasis">{{ t('media.adding.web_video_loading') }}</div>
    </div>
  </MediaImportSection>
</template>

<script setup lang="ts">
import {ref, computed, useId} from 'vue'
import {useI18n} from 'vue-i18n'
import MediaImportSection from './MediaImportSection.vue'
import {normalizeXHamsterUrl} from '@shared/webVideo'
import {apiClient} from '@/services/apiClient'
import {useItemsListSync} from '@/composable/itemsListSync'
import {useFreeLibraryGate} from '@/composable/useFreeLibraryGate'
import {useEventBus} from '@/utils/eventBus'
import {getApiErrorMessage} from '@/types/vue'

const {t} = useI18n()
const {embedded = false} = defineProps<{embedded?: boolean}>()
const hintId = useId()
const url = ref('')
const busy = ref(false)
const error = ref(false)
const message = ref('')
const validUrl = computed(() => normalizeXHamsterUrl(url.value))
const sync = useItemsListSync()
const gate = useFreeLibraryGate()
const events = useEventBus()

async function importVideo() {
  if (!validUrl.value || busy.value) return
  busy.value = true
  error.value = false
  message.value = ''
  try {
    if (!await gate.ensureCanImportMedia()) return
    const {data} = await apiClient.post<{id: number; title: string; created: boolean}>(
      '/api/web-video/import', {url: url.value.trim()}, {timeout: 240_000},
    )
    message.value = t(data.created ? 'media.adding.web_video_added' : 'media.adding.web_video_duplicate', {title: data.title})
    url.value = ''
    sync.getItemsFromDb({ids: [], type: 'media'})
    events.emit('library:nav-counts-changed')
    await gate.refreshLibraryCount()
  } catch (err) {
    error.value = true
    message.value = getApiErrorMessage(err, t('media.adding.web_video_error'))
  } finally {
    busy.value = false
  }
}
const canSubmit = computed(() => !!validUrl.value && !busy.value)
const selectionCount = computed(() => validUrl.value ? 1 : 0)
defineExpose({canSubmit, busy, selectionCount, submit: importVideo})
</script>

<style scoped lang="scss">
.web-video-import {
  :deep(.v-expansion-panel) {
    border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  }

  :deep(.v-expansion-panel-text__wrapper) {
    padding: 4px 14px 12px;
  }
}

.web-video-import__title {
  min-height: 46px;
  padding: 10px 14px;
  font-size: 0.875rem;
  font-weight: 600;
}

.web-video-import__input-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.web-video-import__url {
  flex: 1;
  min-width: 0;
}

.web-video-import__hint {
  margin-top: 8px;
  font-size: 0.6875rem;
  line-height: 1.5;
}

.web-video-import__notice {
  margin-top: 8px;
  font-size: 0.8125rem;
  overflow-wrap: anywhere;
}

.web-video-import__progress {
  margin-top: 10px;
}
</style>
