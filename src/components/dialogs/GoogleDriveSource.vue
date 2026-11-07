<template>
  <div class="google-drive-source">
    <Teleport :to="actionsTarget || 'body'" :disabled="!unified || !actionsTarget">
    <div class="google-drive-source__connection-bar" :class="{'source-connection-panel': !unified}">
      <v-text-field :model-value="t('drive.title')" :label="t('nas.connection')" readonly
                    v-if="!unified" class="google-drive-source__connection" prepend-inner-icon="mdi-google-drive"
                    density="compact" hide-details variant="outlined" rounded="lg">
        <template #append-inner>
          <span class="google-drive-source__status" :class="{'google-drive-source__status--ready': health === 'ready'}"
                :aria-label="t(status?.authenticated ? 'sources.credentials_saved' : 'drive.disconnected')">
            <span class="google-drive-source__status-dot" aria-hidden="true" />
            <span class="google-drive-source__status-label">{{ t(status?.authenticated ? 'sources.credentials_saved' : 'drive.disconnected') }}</span>
          </span>
        </template>
      </v-text-field>
      <div class="google-drive-source__connection-actions">
        <v-btn v-if="status && !status.mock" size="small" :variant="status.configured ? 'text' : 'tonal'" color="primary" rounded="lg" :class="{'connection-action--primary': !status.configured}" icon
               :aria-label="t('drive.oauth_settings')" v-tooltip:top="t('drive.oauth_settings')" :disabled="busy || waiting" @click="openConfiguration">
          <v-icon size="18" :icon="status.configured ? 'mdi-key-outline' : 'mdi-plus'" />
        </v-btn>
        <v-btn v-if="status?.authenticated" size="small" variant="text" rounded="lg" icon
               :aria-label="t('sources.check')" v-tooltip:top="t('sources.check')" :loading="checking"
               :disabled="busy || waiting || editing" @click="checkConnection">
          <v-icon size="18" icon="mdi-lan-check" />
        </v-btn>
        <v-btn size="small" variant="text" rounded="lg" icon :disabled="busy || waiting" :aria-label="t('nas.refresh')" v-tooltip:top="t('nas.refresh')" @click="refresh">
          <v-icon size="18" icon="mdi-refresh" />
        </v-btn>
        <v-btn v-if="status?.authenticated && !status.mock" size="small" variant="text" rounded="lg" class="connection-action--disconnect" icon
               :aria-label="t('nas.disconnect')" v-tooltip:top="t('nas.disconnect')" :disabled="busy || waiting" @click="disconnect">
          <v-icon size="18" icon="mdi-link-off" />
        </v-btn>
        <v-btn v-else-if="status?.configured && !status.mock" size="small" color="primary" variant="tonal" rounded="lg" class="connection-action--primary" icon
               :aria-label="t('drive.connect')" v-tooltip:top="t('drive.connect')" :loading="waiting" :disabled="busy || waiting" @click="connect">
          <v-icon size="18" icon="mdi-login" />
        </v-btn>
      </div>
    </div>
    </Teleport>
    <SourceHealth v-if="status && (!unified || (health && !['ready', 'unchecked', 'disconnected'].includes(health)))" :state="health || (status.authenticated ? 'unchecked' : 'disconnected')"
                  :disabled="busy || waiting || editing" @reconnect="status?.configured ? connect() : openConfiguration()" />
    <v-alert v-if="status?.mock" type="info" variant="tonal" density="compact" class="mb-3">{{ t('drive.mock') }}</v-alert>
    <v-alert v-if="message" :type="error ? 'error' : 'success'" variant="tonal" density="compact" rounded="lg" class="google-drive-source__notice" role="status">{{ message }}</v-alert>
    <div v-if="waiting" class="d-flex align-center ga-2 mb-3 text-body-2">
      <v-progress-circular indeterminate size="18" width="2" />{{ t('drive.waiting') }}
      <v-btn size="small" variant="text" @click="cancelOAuth">{{ t('common.cancel') }}</v-btn>
    </div>
    <div v-if="!connectionsOnly && status?.authenticated">
      <v-alert v-if="status.capabilities?.move === false && !status.mock" type="info" variant="tonal" density="compact" rounded="lg" class="google-drive-source__authorization">
        <span>{{ t('originals.drive_authorization') }}</span>
        <v-btn size="small" variant="flat" color="primary" rounded="lg" prepend-icon="mdi-google-drive"
               class="google-drive-source__reconnect" :loading="waiting" :disabled="busy || waiting || editing" @click="connect">{{ t('sources.reconnect') }}</v-btn>
      </v-alert>
      <v-btn variant="tonal" size="small" prepend-icon="mdi-file-cog-outline" class="mb-1" @click="originalsOpen = true">{{ t('originals.title') }}</v-btn>
      <DialogOriginalOperations v-model="originalsOpen" :media-ids="[]" :scope="{connectionId: 'google-drive', key: driveFileIdFromPath(folder)}" :scope-writable="status.capabilities?.move === true" @changed="browser?.refresh()" />
      <SourceCatalogControls connection-id="google-drive" :root-key="driveFileIdFromPath(folder)" :name="pathTitles[folder] || t('drive.title')"
                             @updated="browser?.refresh(); sync.getItemsFromDb({ids: [], type: 'media'}); events.emit('library:nav-counts-changed')" />
      <MediaFolderBrowser ref="browser" v-model:path="folder" v-model:selected-paths="selectedPaths"
                          :extensions="extensions" :base-url="app.localhost || ''" :directory-loader="directoryLoader" :path-titles="pathTitles"
                          :favorites-scope="browserPrefsScope() + ':gdrive'" :error-message="apiError"
                          :disabled="busy" :enable-folder-tags="false" select-addable-only
                          @favorite-titles="titles => Object.assign(pathTitles, titles)" @loading="browserLoading = $event" @visible-entries="visibleEntries" @show-hidden="showHidden = $event">
        <template v-if="$slots['browser-footer']" #footerActions><slot name="browser-footer"/></template>
        <template #entryActions="{entry, loading}">
          <FilePreviewButton :file="{...entry, path: driveMediaPath(driveFileIdFromPath(entry.path))}" :disabled="busy || loading" />
        </template>
      </MediaFolderBrowser>
      <MediaImportOptions v-if="!embedded" v-model="importOptions" :disabled="busy" />

    </div>
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
import {sourceRateLimited, sourceFailure, type SourceFailure} from '@shared/sourceErrors'
import SourceCatalogControls from './SourceCatalogControls.vue'
import DialogOriginalOperations from './DialogOriginalOperations.vue'
import SourceHealth from './SourceHealth.vue'
import {computed, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {apiClient} from '@/services/apiClient'
import {openExternal} from '@/services/shellService'
import {useAppStore} from '@/stores/app'
import {useFreeLibraryGate} from '@/composable/useFreeLibraryGate'
import {useItemsListSync} from '@/composable/itemsListSync'
import {useEventBus} from '@/utils/eventBus'
import {remoteSourceErrorMessage} from '@/services/remoteSourceErrors'
import {DriveConfigurationSchema, driveMediaPath, type DriveStatus, type DriveImportResult} from '@shared/cloudDrive'
import {driveBrowserRoot, driveFileIdFromPath, driveReadablePath, listDriveDirectory} from '@/services/driveBrowse'
import {loadDriveBrowserLocation, persistDriveBrowserLocation} from '@/services/driveBrowserPrefs'
import {expandRemoteSelection} from '@/services/remoteImportSelection'
import {runRemoteImportQueue} from '@/services/remoteImportQueue'
import {useRemoteMediaAddingProcess} from '@/composable/useRemoteMediaAddingProcess'
import type {BrowseDirectoryEntry, BrowseDirectoryLoader} from '@/services/typedApi/browse'
import MediaFolderBrowser from './MediaFolderBrowser.vue'
import FilePreviewButton from './FilePreviewButton.vue'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import MediaImportOptions from './MediaImportOptions.vue'
import {defaultRemoteImportOptions, remotePathExcluder, importExtensionMatcher, type RemoteImportOptions} from '@/services/remoteImportOptions'
import {parseAndAssignImportPathTags} from '@/services/importPathAutoTag'

const {connectionsOnly = false, embedded = false, extensions} = defineProps<{connectionsOnly?: boolean; embedded?: boolean; extensions?: string; unified?: boolean; actionsTarget?: HTMLElement}>()
const {t, te} = useI18n()
const originalsOpen = ref(false)
const addingProcess = useRemoteMediaAddingProcess(t)
const emit = defineEmits<{started: []}>()
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
const batchStats = ref({found: 0, skipped: 0, inLibrary: 0, added: 0, duplicates: 0})
const stopRequested = ref(false)
const busy = computed(() => saving.value || importing.value || checking.value)
const checking = ref(false)
const health = ref<SourceFailure | 'ready' | 'unknown'>()
const checkedAt = ref<number>()
async function checkConnection() {
  if (busy.value || waiting.value || !status.value?.authenticated) return
  const current = generation
  let verified = false
  checking.value = true; message.value = ''
  try {
    await apiClient.get('/api/drive/folders/root', {timeout: 35_000})
    if (current === generation) { health.value = 'ready'; checkedAt.value = Date.now(); verified = true }
  } catch (err) {
    if (current === generation) { health.value = sourceFailure(err) || 'unknown'; checkedAt.value = Date.now(); error.value = true; message.value = apiError(err) }
  } finally { if (current === generation) checking.value = false }
  if (verified && current === generation) await browser.value?.refresh()
}
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
const importOptions = defineModel<RemoteImportOptions>('importOptions', {default: defaultRemoteImportOptions})
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
  try {
    result = await listDriveDirectory(input)
    if (current === generation && listing === directoryGeneration) { health.value = 'ready'; checkedAt.value = Date.now() }
  }
  catch (err) {
    if (current === generation && listing === directoryGeneration) { health.value = sourceFailure(err) || 'unknown'; checkedAt.value = Date.now() }
    const code = (err as {response?: {status?: number}})?.response?.status
    if (current !== generation || listing !== directoryGeneration || input.path === driveBrowserRoot || code !== 404) throw err
    // A remembered folder may have been deleted or become inaccessible since the last session.
    result = await listDriveDirectory({...input, path: driveBrowserRoot})
    if (current === generation && listing === directoryGeneration) { health.value = 'ready'; checkedAt.value = Date.now() }
  }
  if (current !== generation || listing !== directoryGeneration) return result
  directories.add(result.currentPath)
  for (const entry of result.entries) pathTitles.value[entry.path] = entry.name
  persistDriveBrowserLocation(scope, result.currentPath, pathTitles.value)
  return result
}
function visibleEntries(entries: BrowseDirectoryEntry[]) {
  for (const entry of entries) if (entry.isDirectory) directories.add(entry.path)
}
const apiError = (err: unknown) => {
  if (sourceFailure(err) || sourceRateLimited(err)) return remoteSourceErrorMessage(err, t)
  const code = (err as {response?: {data?: {code?: string}}})?.response?.data?.code
  const key = code && code !== 'unknown' ? `drive.oauth_errors.${code}` : ''
  return key && te(key) ? t(key) : remoteSourceErrorMessage(err, t)
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
    if (!wasConnected) { health.value = undefined; checkedAt.value = undefined }
    if (!data.authenticated && wasConnected) { health.value = 'auth_required'; checkedAt.value = Date.now() }
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
    health.value = undefined; checkedAt.value = undefined
    status.value = data; draft.value.clientSecret = ''; selectedPaths.value = []; editing.value = false
    message.value = t('drive.config_saved'); error.value = false
  } catch (err) { if (current === generation) formError.value = apiError(err) }
  finally { if (current === generation) saving.value = false }
}
async function disconnect() {
  saving.value = true
  try {
    await apiClient.post('/api/drive/oauth/logout'); selectedPaths.value = []
    if (status.value) status.value = {...status.value, authenticated: false}
    health.value = undefined; checkedAt.value = undefined; message.value = ''; await refresh()
  }
  catch (err) { message.value = apiError(err); error.value = true }
  finally { saving.value = false }
}
const canSubmit = computed(() => !!status.value?.authenticated && !addingProcess.active && !busy.value && !browserLoading.value && selectedPaths.value.length > 0)
async function submit() {
  if (addingProcess.active || !canSubmit.value) return
  const current = generation
  controller = new AbortController()
  const signal = controller.signal
  const options = {...importOptions.value}
  const matchesExtension = importExtensionMatcher(extensions)
  const acceptFile = (path: string) => matchesExtension(pathTitles.value[path] || path)
  const excludes = remotePathExcluder(options)
  const isExcluded = (path: string) => {
    const readable = driveReadablePath(path, pathTitles.value)
    return excludes(path) || excludes(readable) || excludes(`${driveBrowserRoot}${readable}`)
  }
  importing.value = true; scanning.value = true; stopRequested.value = false; failures.value = []; message.value = ''; error.value = false; processed.value = 0
  batchStats.value = {found: 0, skipped: 0, inLibrary: 0, added: 0, duplicates: 0}
  total.value = selectedPaths.value.length
  let added = 0; let duplicates = 0
  const run = addingProcess.begin({source: t('drive.title'),
    stop: () => { stopRequested.value = true; if (scanning.value) controller?.abort() }, retry: submit,
    readablePath: path => driveReadablePath(path, pathTitles.value),
    snapshot: () => ({scanning: scanning.value, stopped: stopRequested.value, processed: processed.value,
      total: total.value, ...batchStats.value, remaining: selectedPaths.value.length, errors: failures.value}),
  })
  if (!run) { importing.value = false; return }
  emit('started')
  const refreshLibrary = () => { events.emit('library:nav-counts-changed') }
  try {
    const original = [...selectedPaths.value]
    const expanded = await expandRemoteSelection({paths: original, directories, isExcluded, acceptFile, onExisting: entry => run.recordExisting(entry.path), shouldStop: () => stopRequested.value || current !== generation,
      onProgress: progress => { if (current === generation) Object.assign(batchStats.value, progress) },
      load: async path => {
        const result = await listDriveDirectory({path, extensions, showHidden: showHidden.value}, signal, Infinity)
        if (current === generation) {
          directories.add(result.currentPath)
          for (const entry of result.entries) {
            pathTitles.value[entry.path] = entry.name
            if (entry.isDirectory) directories.add(entry.path)
          }
        }
        return result
      },
      onFolderError: (path, err) => failures.value.push({path, message: err instanceof Error && err.message === 'truncated' ? t('nas.truncated') : apiError(err)}),
    })
    if (current !== generation) return
    if (expanded.stopped) { message.value = t('nas.scan_stopped'); return }
    selectedPaths.value = [...expanded.paths, ...expanded.failedFolders]
    scanning.value = false; total.value = expanded.paths.length
    const result = await runRemoteImportQueue<DriveImportResult & {path: string}>({
      paths: expanded.paths, shouldStop: () => stopRequested.value || current !== generation,
      nextChunkSize: async () => await gate.ensureCanImportMedia() ? 1 : 0,
      async request([path]) {
        run.phase('importing')
        const {data} = await apiClient.post<DriveImportResult>('/api/drive/import', {fileId: driveFileIdFromPath(path)}, {timeout: 40_000, signal})
        return [{...data, path}]
      },
      async onRequestError(paths, err) {
        if (current !== generation) return
        for (const path of paths) failures.value.push({path, message: apiError(err)})
        refreshLibrary(); await gate.refreshLibraryCount()
      },
      onProgress: done => { if (current === generation) processed.value = done },
      async onResults(results) {
        if (current !== generation) return
        const [{path, ...data}] = results
        if (data.created) added++; else duplicates++
        batchStats.value.added = added; batchStats.value.duplicates = duplicates
        // The import response provides the authoritative filename even after a rename.
        pathTitles.value[path] = data.title
        run.record(path, data.id, data.created)
        refreshLibrary(); await gate.refreshLibraryCount()
        if (current !== generation) return
        try {
          if (options.parseTags) run.phase('tagging')
          if (options.parseTags) await parseAndAssignImportPathTags([
            {path: driveReadablePath(path, pathTitles.value), mediaId: data.id},
          ], {shouldStop: () => current !== generation})
          if (current !== generation) return
          selectedPaths.value = selectedPaths.value.filter(value => value !== path)
          refreshLibrary()
        } catch (err) { if (current === generation) failures.value.push({path, message: apiError(err)}) }
      },
    })
    if (current !== generation) return
    stopRequested.value ||= result.stopped
    message.value = t('nas.batch_summary', {added, duplicates: duplicates + batchStats.value.inLibrary, errors: failures.value.length})
      + (result.stopped ? ` ${t('nas.batch_stopped', {count: result.total - result.processed})}` : '')
    error.value = failures.value.length > 0
  } catch (err) { if (current === generation) { message.value = apiError(err); error.value = true; failures.value.push({path: '', message: apiError(err)}); refreshLibrary() } }
  finally { if (current === generation) { importing.value = false; scanning.value = false; controller = undefined; await browser.value?.refresh(); run.finish() } }
}
function onFocus() { if (!busy.value) void refresh() }
// Watch the actual library/server identity, not a new array on every config refresh.
watch([() => app.dbPath, () => app.localhost], () => {
  generation++; health.value = undefined; checkedAt.value = undefined; checking.value = false; controller?.abort(); cancelOAuth(); status.value = undefined; importing.value = false; saving.value = false
  const location = loadDriveBrowserLocation(browserPrefsScope())
  selectedPaths.value = []; batchStats.value = {found: 0, skipped: 0, inLibrary: 0, added: 0, duplicates: 0}; directories.clear(); folder.value = location.path; pathTitles.value = location.pathTitles; failures.value = []; message.value = ''
  editing.value = false; formError.value = ''
  draft.value = {clientId: '', clientSecret: '', redirectUri: ''}; void refresh()
})
onMounted(() => { void refresh(); window.addEventListener('focus', onFocus) })
onBeforeUnmount(() => { generation++; controller?.abort(); cancelOAuth(); window.removeEventListener('focus', onFocus) })
defineExpose({status, refresh, busy: computed(() => busy.value || waiting.value || editing.value), canSubmit, selectionCount: computed(() => selectedPaths.value.length), submit,
  canStop: importing, stopping: stopRequested, stop: () => { stopRequested.value = true; if (scanning.value) controller?.abort() }})
</script>

<style scoped>
.google-drive-source { min-width: 0; }
.google-drive-source__notice,
.google-drive-source__authorization {
  margin-bottom: 6px;
  padding: 6px 8px;
  font-size: .6875rem;
  line-height: 1.5;
}
.google-drive-source__notice :deep(.v-alert__prepend),
.google-drive-source__authorization :deep(.v-alert__prepend) { margin-inline-end: 6px; min-height: 16px; }
.google-drive-source__notice :deep(.v-alert__prepend .v-icon),
.google-drive-source__authorization :deep(.v-alert__prepend .v-icon) { font-size: 16px; width: 16px; height: 16px; }
.google-drive-source__notice :deep(.v-alert__content) { padding-block: 0; }
.google-drive-source__authorization :deep(.v-alert__content) { padding-block: 0; display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; }
.google-drive-source__authorization span { flex: 1 1 240px; min-width: 0; }
.google-drive-source__authorization .v-btn { min-height: 36px; padding-inline: 14px; flex-shrink: 0; font-weight: 600; font-size: .75rem; letter-spacing: 0; text-transform: none; }
.google-drive-source :deep(.media-folder-browser .v-alert) { padding: 6px 8px; font-size: .6875rem !important; line-height: 1.5; }
.google-drive-source :deep(.media-folder-browser .v-alert__content) { padding-block: 0; }
.google-drive-source :deep(.media-folder-browser .v-alert__prepend) { margin-inline-end: 6px; min-height: 16px; }
.google-drive-source :deep(.media-folder-browser .v-alert__prepend .v-icon) { font-size: 16px; width: 16px; height: 16px; }
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

<style scoped lang="scss" src="@/assets/styles/source-connection-actions.scss"></style>
