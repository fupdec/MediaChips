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
    <MediaImportOptions v-if="!embedded" v-model="importOptions" :disabled="busy" />
    <v-alert v-if="message" :type="error ? 'error' : 'success'" variant="tonal" density="compact" rounded="lg"
             class="web-video-import__notice" role="status" aria-live="polite">
      {{ message }}
    </v-alert>

  </MediaImportSection>
</template>

<script setup lang="ts">
import {ref, computed, watch, onBeforeUnmount} from 'vue'
import {useRemoteMediaAddingProcess} from '@/composable/useRemoteMediaAddingProcess'
import {useI18n} from 'vue-i18n'
import MediaImportSection from './MediaImportSection.vue'
import {normalizeWebVideoUrl} from '@shared/webVideo'
import {apiClient} from '@/services/apiClient'
import {useItemsListSync} from '@/composable/itemsListSync'
import {useFreeLibraryGate} from '@/composable/useFreeLibraryGate'
import {useEventBus} from '@/utils/eventBus'
import {remoteSourceErrorMessage} from '@/services/remoteSourceErrors'
import MediaImportOptions from './MediaImportOptions.vue'
import {defaultRemoteImportOptions, remotePathExcluder, type RemoteImportOptions} from '@/services/remoteImportOptions'
import {parseAndAssignImportPathTags} from '@/services/importPathAutoTag'
import {useAppStore} from '@/stores/app'

const {t} = useI18n()
const addingProcess = useRemoteMediaAddingProcess(t)
const emit = defineEmits<{started: []}>()
const {embedded = false} = defineProps<{embedded?: boolean}>()
const app = useAppStore()
let generation = 0
let controller: AbortController | undefined
const url = ref('')
const busy = ref(false)
const stopping = ref(false)
const error = ref(false)
const message = ref('')
const importOptions = defineModel<RemoteImportOptions>('importOptions', {default: defaultRemoteImportOptions})
const validUrl = computed(() => normalizeWebVideoUrl(url.value))
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
  if (addingProcess.active || !validUrl.value || busy.value || isExcluded.value) return
  const path = readablePath.value
  const originalUrl = url.value.trim()
  const options = {...importOptions.value}
  const current = generation
  controller = new AbortController()
  const signal = controller.signal
  busy.value = true
  error.value = false
  message.value = ''
  stopping.value = false
  let processed = 0
  const failures = ref<Array<{path: string; message: string}>>([])
  // Validate the library limit before opening the process window.
  try {
    if (!await gate.ensureCanImportMedia() || current !== generation) { busy.value = false; return }
  } catch (err) {
    if (current === generation) {
      busy.value = false
      error.value = true
      message.value = remoteSourceErrorMessage(err, t)
    }
    return
  }
  const run = addingProcess.begin({source: t('media.adding.source_links'), phase: 'resolving',
    stop: () => { stopping.value = true }, retry: importVideo, readablePath: () => t('media.adding.web_video_title'),
    snapshot: () => ({scanning: false, stopped: stopping.value, processed, total: 1, found: 1, skipped: 0, inLibrary: 0,
      remaining: url.value ? 1 : 0, errors: failures.value}),
  })
  if (!run) { busy.value = false; return }
  emit('started')
  try {
    const {data} = await apiClient.post<{id: number; title: string; created: boolean}>(
      '/api/web-video/import', {url: originalUrl}, {timeout: 240_000, signal},
    )
    if (current !== generation) return
    run.record(path, data.id, data.created)
    events.emit('library:nav-counts-changed')
    await gate.refreshLibraryCount()
    if (options.parseTags) run.phase('tagging')
    if (options.parseTags) await parseAndAssignImportPathTags([{path, mediaId: data.id}], {shouldStop: () => current !== generation})
    if (current !== generation) return
    if (options.parseTags) sync.getItemsFromDb({ids: [data.id], type: 'media'})
    message.value = t(data.created ? 'media.adding.web_video_added' : 'media.adding.web_video_duplicate', {title: data.title})
    processed = 1
    url.value = ''
  } catch (err) {
    if (current !== generation) return
    error.value = true
    message.value = remoteSourceErrorMessage(err, t)
    failures.value.push({path: t('media.adding.web_video_title'), message: message.value})
    processed = 1
  } finally {
    if (current === generation) { busy.value = false; controller = undefined; run.finish() }
  }
}
watch([() => app.dbPath, () => app.localhost], () => {
  generation++; controller?.abort(); busy.value = false; message.value = ''; error.value = false
})
onBeforeUnmount(() => { generation++; controller?.abort() })
const canSubmit = computed(() => !!validUrl.value && !addingProcess.active && !busy.value && !isExcluded.value)
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
