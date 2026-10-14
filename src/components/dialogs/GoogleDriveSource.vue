<template>
  <div class="google-drive-source">
    <div class="google-drive-source__connection-bar">
      <v-text-field :model-value="t('drive.title')" :label="t('nas.connection')" readonly
                    class="google-drive-source__connection" prepend-inner-icon="mdi-google-drive"
                    density="compact" hide-details variant="outlined" rounded="lg">
        <template #append-inner>
          <span class="google-drive-source__status" :class="{'google-drive-source__status--ready': status?.authenticated}"
                :aria-label="t(status?.authenticated ? 'drive.connected' : 'drive.disconnected')">
            <span class="google-drive-source__status-dot" aria-hidden="true" />
            <span class="google-drive-source__status-label">{{ t(status?.authenticated ? 'drive.connected' : 'drive.disconnected') }}</span>
          </span>
        </template>
      </v-text-field>
      <div class="google-drive-source__connection-actions">
        <v-btn v-if="status && !status.mock" size="small" :variant="status.configured ? 'text' : 'tonal'" color="primary" rounded="lg" icon
               :aria-label="t('drive.oauth_settings')" :disabled="busy || waiting" @click="openConfiguration">
          <v-icon size="18" :icon="status.configured ? 'mdi-key-outline' : 'mdi-plus'" />
        </v-btn>
        <v-btn v-if="status?.authenticated && !status.mock" size="small" variant="text" rounded="lg" icon
               :aria-label="t('nas.disconnect')" :disabled="busy || waiting" @click="disconnect">
          <v-icon size="18" icon="mdi-lan-disconnect" />
        </v-btn>
        <v-btn v-else-if="status?.configured && !status.mock" size="small" color="primary" variant="tonal" rounded="lg" icon
               :aria-label="t('drive.connect')" :loading="waiting" :disabled="busy || waiting" @click="connect">
          <v-icon size="18" icon="mdi-login" />
        </v-btn>
        <v-btn size="small" variant="text" rounded="lg" icon :disabled="busy || waiting" :aria-label="t('nas.refresh')" @click="refresh">
          <v-icon size="18" icon="mdi-refresh" />
        </v-btn>
      </div>
    </div>
    <v-alert v-if="status?.mock" type="info" variant="tonal" density="compact" class="mb-3">{{ t('drive.mock') }}</v-alert>
    <v-alert v-if="message" :type="error ? 'error' : 'success'" variant="tonal" density="compact" rounded="lg" class="mb-3" role="status">{{ message }}</v-alert>
    <div v-if="waiting" class="d-flex align-center ga-2 mb-3 text-body-2">
      <v-progress-circular indeterminate size="18" width="2" />{{ t('drive.waiting') }}
      <v-btn size="small" variant="text" @click="cancelOAuth">{{ t('common.cancel') }}</v-btn>
    </div>
    <div v-if="!connectionsOnly && status?.authenticated">
      <MediaFolderBrowser ref="browser" v-model:path="folder" v-model:selected-paths="selectedPaths"
                          :base-url="app.localhost || ''" :directory-loader="directoryLoader" :path-titles="pathTitles"
                          :disabled="busy" :enable-folder-tags="false" select-addable-only
                          @loading="browserLoading = $event" @visible-entries="visibleEntries" @show-hidden="showHidden = $event">
        <template #entryActions="{entry, loading}">
          <FilePreviewButton :file="{...entry, path: driveMediaPath(driveFileIdFromPath(entry.path))}" :disabled="busy || loading" />
        </template>
      </MediaFolderBrowser>
      <div v-if="importing" class="d-flex align-center ga-2 my-2 text-caption" role="status">
        <v-progress-circular indeterminate size="18" width="2" />
        {{ scanning ? t('drive.scanning') : t('nas.batch_progress', {done: processed, total}) }}
      </div>
      <v-expansion-panels v-if="failures.length" class="my-2">
        <v-expansion-panel :title="t('nas.batch_errors', {count: failures.length})">
          <v-expansion-panel-text><div v-for="failure in failures" :key="failure.path" class="text-body-2 mb-2">{{ pathTitles[failure.path] || failure.path }}: {{ failure.message }}</div></v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </div>
    <div class="text-caption text-medium-emphasis">{{ t('drive.playback_hint') }}</div>
    <v-dialog v-model="editing" max-width="560" persistent scrollable>
      <v-card class="google-drive-source-editor" rounded="xl">
        <DialogHeader :header="t('drive.oauth_settings')" icon="google-drive" :buttons="editorButtons" compact />
        <v-card-text class="google-drive-source-editor__body">
          <p class="text-body-2 mb-3">{{ t('drive.setup_hint') }}</p>
          <v-defaults-provider :defaults="{VTextField: {density: 'compact', rounded: 'lg', hideDetails: 'auto'}}">
            <div class="google-drive-source-editor__fields">
              <v-text-field v-model="draft.clientId" label="OAuth Client ID" :disabled="saving" variant="outlined" />
              <v-text-field v-model="draft.clientSecret" label="OAuth Client Secret" type="password" autocomplete="new-password" :disabled="saving"
                            :placeholder="status?.configured ? t('drive.secret_saved') : undefined" variant="outlined" />
              <v-text-field v-model="draft.redirectUri" :label="t('drive.redirect_uri')" :disabled="saving" variant="outlined" />
              <v-alert v-if="formError" type="error" variant="tonal" density="compact" rounded="lg" role="status">{{ formError }}</v-alert>
            </div>
          </v-defaults-provider>
        </v-card-text>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {apiClient} from '@/services/apiClient'
import {openExternal} from '@/services/shellService'
import {useAppStore} from '@/stores/app'
import {useFreeLibraryGate} from '@/composable/useFreeLibraryGate'
import {useItemsListSync} from '@/composable/itemsListSync'
import {useEventBus} from '@/utils/eventBus'
import {getApiErrorMessage} from '@/types/vue'
import {DriveConfigurationSchema, driveMediaPath, type DriveStatus, type DriveImportResult} from '@shared/cloudDrive'
import {driveBrowserRoot, driveFileIdFromPath, listDriveDirectory} from '@/services/driveBrowse'
import {loadDriveBrowserLocation, persistDriveBrowserLocation} from '@/services/driveBrowserPrefs'
import {expandNasSelection} from '@/services/nasBrowse'
import type {BrowseDirectoryEntry, BrowseDirectoryLoader} from '@/services/typedApi/browse'
import MediaFolderBrowser from './MediaFolderBrowser.vue'
import FilePreviewButton from './FilePreviewButton.vue'
import DialogHeader from '@/components/elements/DialogHeader.vue'

const {connectionsOnly = false} = defineProps<{connectionsOnly?: boolean}>()
const {t, te} = useI18n()
const app = useAppStore()
const gate = useFreeLibraryGate()
const sync = useItemsListSync()
const events = useEventBus()
const status = ref<DriveStatus>()
const message = ref('')
const error = ref(false)
const saving = ref(false)
const importing = ref(false)
const waiting = ref(false)
const scanning = ref(false)
const processed = ref(0)
const total = ref(0)
const stopRequested = ref(false)
const busy = computed(() => saving.value || importing.value)
const editing = ref(false)
const formError = ref('')
const draft = ref({clientId: '', clientSecret: '', redirectUri: ''})
const editorButtons = computed(() => [
  {text: t('common.cancel'), icon: 'close', outlined: true, disabled: saving.value, action: closeConfiguration},
  {text: t('common.save'), icon: 'check', color: 'primary', loading: saving.value,
    disabled: busy.value || waiting.value || !draft.value.clientId || !draft.value.redirectUri, action: saveConfiguration},
])
const browserPrefsScope = () => JSON.stringify([app.dbPath || app.config?.id || 'default', app.localhost || ''])
const initialLocation = loadDriveBrowserLocation(browserPrefsScope())
const folder = ref(initialLocation.path)
const selectedPaths = ref<string[]>([])
const directories = new Set<string>()
const pathTitles = ref<Record<string, string>>(initialLocation.pathTitles)
const browser = ref<InstanceType<typeof MediaFolderBrowser>>()
const browserLoading = ref(false)
const showHidden = ref(false)
const failures = ref<Array<{path: string; message: string}>>([])
let generation = 0
let directoryGeneration = 0
let controller: AbortController | undefined
let poll: ReturnType<typeof setInterval> | undefined
let popup: Window | null = null
let refreshGeneration: number | undefined
let authStartedAt = 0
let oauthState: string | undefined
const directoryLoader: BrowseDirectoryLoader = async input => {
  const current = generation
  const listing = ++directoryGeneration
  const scope = browserPrefsScope()
  let result
  try { result = await listDriveDirectory(input) }
  catch (err) {
    const code = (err as {response?: {status?: number}})?.response?.status
    if (current !== generation || listing !== directoryGeneration || input.path === driveBrowserRoot || ![403, 404].includes(code || 0)) throw err
    // A remembered folder may have been deleted or become inaccessible since the last session.
    result = await listDriveDirectory({...input, path: driveBrowserRoot})
  }
  if (current !== generation || listing !== directoryGeneration) return result
  for (const entry of result.entries) pathTitles.value[entry.path] = entry.name
  persistDriveBrowserLocation(scope, result.currentPath, pathTitles.value)
  return result
}
function visibleEntries(entries: BrowseDirectoryEntry[]) {
  for (const entry of entries) if (entry.isDirectory) directories.add(entry.path)
}
const apiError = (err: unknown) => {
  const code = (err as {response?: {data?: {code?: string}}})?.response?.data?.code
  const key = code ? `drive.oauth_errors.${code}` : ''
  return key && te(key) ? t(key) : getApiErrorMessage(err, t('drive.error'))
}
function stopPoll() { if (poll) clearInterval(poll); poll = undefined; waiting.value = false; oauthState = undefined }
function cancelOAuth() {
  if (oauthState) void apiClient.post('/api/drive/oauth/cancel', {oauthState}).catch(() => {})
  stopPoll(); popup?.close(); popup = null }
async function refresh() {
  if (refreshGeneration === generation) return
  const current = generation
  refreshGeneration = current
  try {
    const requestedState = oauthState
    const {data} = await apiClient.get<DriveStatus>('/api/drive/status', {params: {oauthState: requestedState}})
    if (current !== generation) return
    const wasConnected = status.value?.authenticated
    status.value = data
    if (data.authenticated && (waiting.value || wasConnected === false)) { stopPoll(); popup?.close(); popup = null; message.value = t('drive.connected'); error.value = false }
    if (waiting.value && requestedState === oauthState && (data.oauthResult === 'failed' || data.oauthResult === 'expired')) {
      stopPoll(); popup?.close(); popup = null
      message.value = t(`drive.oauth_errors.${data.oauthResult === 'expired' ? 'expired' : data.oauthError || 'unknown'}`); error.value = true
    }
    if (!data.authenticated && wasConnected) selectedPaths.value = []
  } catch (err) { if (current === generation) { message.value = apiError(err); error.value = true } }
  finally { if (refreshGeneration === current) refreshGeneration = undefined }
}
async function connect() {
  if (waiting.value || busy.value) return
  popup = app.isElectron ? null : window.open('about:blank', 'mediachips-google-drive', 'popup,width=560,height=720')
  if (!app.isElectron && !popup) { message.value = t('drive.popup_blocked'); error.value = true; return }
  waiting.value = true; message.value = ''; error.value = false
  const current = generation
  try {
    const {data} = await apiClient.get<{url: string; oauthState?: string}>('/api/drive/oauth/start')
    if (current !== generation) { cancelOAuth(); return }
    oauthState = data.oauthState
    if (app.isElectron) await openExternal(data.url)
    else if (popup) popup.location.href = data.url
    authStartedAt = Date.now()
    poll = setInterval(() => {
      void refresh().then(() => {
        if (waiting.value && Date.now() - authStartedAt > 10 * 60_000) {
          stopPoll(); popup?.close(); popup = null; message.value = t('drive.oauth_cancelled'); error.value = true
        }
      })
    }, 1500)
  } catch (err) { cancelOAuth(); if (current === generation) { message.value = apiError(err); error.value = true } }
}
function openConfiguration() {
  if (!status.value || status.value.mock || busy.value || waiting.value) return
  draft.value = {clientId: status.value.clientId || '', clientSecret: '', redirectUri: status.value.redirectUri}
  formError.value = ''; editing.value = true
}
function closeConfiguration() {
  if (saving.value) return
  editing.value = false; draft.value.clientSecret = ''; formError.value = ''
}
async function saveConfiguration() {
  if (busy.value || waiting.value) return
  const parsed = DriveConfigurationSchema.safeParse({...draft.value, clientSecret: draft.value.clientSecret || undefined})
  if (!parsed.success) { formError.value = t('drive.invalid_config'); return }
  saving.value = true; formError.value = ''
  const current = generation
  try {
    const {data} = await apiClient.put<DriveStatus>('/api/drive/configuration', parsed.data)
    if (current !== generation) return
    status.value = data; draft.value.clientSecret = ''; selectedPaths.value = []; editing.value = false
    message.value = t('drive.config_saved'); error.value = false
  } catch (err) { if (current === generation) formError.value = apiError(err) }
  finally { if (current === generation) saving.value = false }
}
async function disconnect() {
  saving.value = true
  try { await apiClient.post('/api/drive/oauth/logout'); selectedPaths.value = []; await refresh() }
  catch (err) { message.value = apiError(err); error.value = true }
  finally { saving.value = false }
}
const canSubmit = computed(() => !!status.value?.authenticated && !busy.value && !browserLoading.value && selectedPaths.value.length > 0)
async function submit() {
  if (!canSubmit.value) return
  const current = generation
  controller = new AbortController()
  const signal = controller.signal
  importing.value = true; scanning.value = true; stopRequested.value = false; failures.value = []; message.value = ''; error.value = false; processed.value = 0
  let added = 0; let duplicates = 0
  const refreshLibrary = () => { sync.getItemsFromDb({ids: [], type: 'media'}); events.emit('library:nav-counts-changed') }
  try {
    const original = [...selectedPaths.value]
    const expanded = await expandNasSelection({paths: original, directories, shouldStop: () => stopRequested.value || current !== generation,
      load: path => listDriveDirectory({path, showHidden: showHidden.value}, signal),
      onFolderError: (path, err) => failures.value.push({path, message: err instanceof Error && err.message === 'truncated' ? t('nas.truncated') : apiError(err)}),
    })
    if (expanded.stopped) { if (current === generation) message.value = t('nas.scan_stopped'); return }
    selectedPaths.value = [...expanded.paths, ...expanded.failedFolders]
    scanning.value = false; total.value = expanded.paths.length
    for (const path of expanded.paths) {
      if (stopRequested.value || current !== generation || !await gate.ensureCanImportMedia()) break
      try {
        const {data} = await apiClient.post<DriveImportResult>('/api/drive/import', {fileId: driveFileIdFromPath(path)}, {timeout: 40_000, signal})
        if (current !== generation) return
        if (data.created) added++; else duplicates++
        selectedPaths.value = selectedPaths.value.filter(value => value !== path)
        refreshLibrary(); await gate.refreshLibraryCount()
      } catch (err) { if (current !== generation) return; failures.value.push({path, message: apiError(err)}) }
      processed.value++
    }
    message.value = t('nas.batch_summary', {added, duplicates, errors: failures.value.length})
      + (processed.value < total.value ? ` ${t('nas.batch_stopped', {count: total.value - processed.value})}` : '')
    error.value = failures.value.length > 0
  } catch (err) { if (current === generation) { message.value = apiError(err); error.value = true; refreshLibrary() } }
  finally { if (current === generation) { importing.value = false; scanning.value = false; controller = undefined; await browser.value?.refresh() } }
}
function onFocus() { if (!busy.value) void refresh() }
// Watch the actual library/server identity, not a new array on every config refresh.
watch([() => app.dbPath, () => app.localhost], () => {
  generation++; controller?.abort(); cancelOAuth(); status.value = undefined; importing.value = false; saving.value = false
  const location = loadDriveBrowserLocation(browserPrefsScope())
  selectedPaths.value = []; directories.clear(); folder.value = location.path; pathTitles.value = location.pathTitles; failures.value = []; message.value = ''
  editing.value = false; formError.value = ''
  draft.value = {clientId: '', clientSecret: '', redirectUri: ''}; void refresh()
})
onMounted(() => { void refresh(); window.addEventListener('focus', onFocus) })
onBeforeUnmount(() => { generation++; controller?.abort(); cancelOAuth(); window.removeEventListener('focus', onFocus) })
defineExpose({refresh, busy, canSubmit, selectionCount: computed(() => selectedPaths.value.length), submit,
  canStop: importing, stopping: stopRequested, stop: () => { stopRequested.value = true }})
</script>

<style scoped>
.google-drive-source { min-width: 0; }
.google-drive-source__connection-bar,
.google-drive-source__connection-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.google-drive-source__connection-bar { margin-bottom: 12px; }
.google-drive-source__connection { flex: 1; min-width: 0; }
.google-drive-source__connection-actions { flex-shrink: 0; }
.google-drive-source__status {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  font-size: 0.6875rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.google-drive-source__status-dot {
  width: 5px;
  height: 5px;
  flex-shrink: 0;
  border-radius: 50%;
  background: currentColor;
}
.google-drive-source__status--ready .google-drive-source__status-dot { background: rgb(var(--v-theme-success)); }
.google-drive-source-editor__body { padding: 12px 20px 16px !important; }
.google-drive-source-editor__fields { display: flex; flex-direction: column; gap: 12px; }
@media (max-width: 480px) {
  .google-drive-source__status-label { display: none; }
  .google-drive-source-editor__body { padding-inline: 14px !important; }
}
</style>
