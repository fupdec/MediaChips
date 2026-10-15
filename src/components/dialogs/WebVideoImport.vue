<template>
  <MediaImportSection :embedded="embedded" :title="t('media.adding.web_video_title')" icon="link-variant" class="web-video-import">
    <div class="web-video-import__input-row">
      <v-text-field
        v-model="url"
        class="web-video-import__url"
        :label="t('media.adding.web_video_url')"
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
        :disabled="!canSubmit"
        @click="importVideo"
      >
        <v-icon size="18" icon="mdi-plus" />
      </v-btn>
    </div>
    <RemoteImportOptions v-model="importOptions" :disabled="busy" />
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
import {ref, computed, watch, onBeforeUnmount} from 'vue'
import {useI18n} from 'vue-i18n'
import MediaImportSection from './MediaImportSection.vue'
import {normalizeXHamsterUrl} from '@shared/webVideo'
import {apiClient} from '@/services/apiClient'
import {useItemsListSync} from '@/composable/itemsListSync'
import {useFreeLibraryGate} from '@/composable/useFreeLibraryGate'
import {useEventBus} from '@/utils/eventBus'
import {getApiErrorMessage} from '@/types/vue'
import RemoteImportOptions from './RemoteImportOptions.vue'
import {defaultRemoteImportOptions, remotePathExcluder} from '@/services/remoteImportOptions'
import {parseAndAssignImportPathTags} from '@/services/importPathAutoTag'
import {useAppStore} from '@/stores/app'

const {t} = useI18n()
const {embedded = false} = defineProps<{embedded?: boolean}>()
const app = useAppStore()
let generation = 0
let controller: AbortController | undefined
const url = ref('')
const busy = ref(false)
const error = ref(false)
const message = ref('')
const importOptions = ref(defaultRemoteImportOptions())
const validUrl = computed(() => normalizeXHamsterUrl(url.value))
const readablePath = computed(() => {
  if (!validUrl.value) return ''
  try { return decodeURIComponent(new URL(url.value.trim()).pathname) }
  catch { return new URL(url.value.trim()).pathname }
})
const isExcluded = computed(() => {
  const excludes = remotePathExcluder(importOptions.value)
  return excludes(url.value.trim()) || excludes(readablePath.value)
})
const sync = useItemsListSync()
const gate = useFreeLibraryGate()
const events = useEventBus()

async function importVideo() {
  if (!validUrl.value || busy.value || isExcluded.value) return
  const path = readablePath.value
  const options = {...importOptions.value}
  const current = generation
  controller = new AbortController()
  const signal = controller.signal
  busy.value = true
  error.value = false
  message.value = ''
  try {
    if (!await gate.ensureCanImportMedia()) return
    if (current !== generation) return
    const {data} = await apiClient.post<{id: number; title: string; created: boolean}>(
      '/api/web-video/import', {url: url.value.trim()}, {timeout: 240_000, signal},
    )
    if (current !== generation) return
    sync.getItemsFromDb({ids: [], type: 'media'})
    events.emit('library:nav-counts-changed')
    await gate.refreshLibraryCount()
    if (options.parseTags) await parseAndAssignImportPathTags([{path, mediaId: data.id}], {shouldStop: () => current !== generation})
    if (current !== generation) return
    if (options.parseTags) sync.getItemsFromDb({ids: [], type: 'media'})
    message.value = t(data.created ? 'media.adding.web_video_added' : 'media.adding.web_video_duplicate', {title: data.title})
    url.value = ''
  } catch (err) {
    if (current !== generation) return
    error.value = true
    message.value = getApiErrorMessage(err, t('media.adding.web_video_error'))
  } finally {
    if (current === generation) { busy.value = false; controller = undefined }
  }
}
watch([() => app.dbPath, () => app.localhost], () => {
  generation++; controller?.abort(); busy.value = false; message.value = ''; error.value = false
})
onBeforeUnmount(() => { generation++; controller?.abort() })
const canSubmit = computed(() => !!validUrl.value && !busy.value && !isExcluded.value)
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
