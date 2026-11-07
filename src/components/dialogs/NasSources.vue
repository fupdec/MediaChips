<template>
  <MediaImportSection :embedded="embedded" :title="t('nas.title')" icon="server-network-outline" class="nas-sources">
    <div class="nas-sources__connection-bar source-connection-panel">
      <v-select v-model="selectedId" :items="connections" item-title="name" item-value="id"
                class="nas-sources__connection-select" :label="t('nas.connection')" :disabled="busy"
                density="compact" hide-details variant="outlined" rounded="lg">
        <template v-if="selected" #append-inner>
          <span class="nas-sources__connection-indicator">
            <span class="nas-sources__connection-status" :class="{'nas-sources__connection-status--ready': health[selected.id]?.state === 'ready'}" aria-hidden="true" />
            <span class="nas-sources__protocol">{{ selected.protocol }}</span>
          </span>
        </template>
      </v-select>
      <div class="nas-sources__connection-actions">
        <v-btn size="small" variant="tonal" color="primary" rounded="lg" class="connection-action--primary" icon
               :aria-label="t('nas.add_connection')" v-tooltip:top="t('nas.add_connection')" :disabled="busy" @click="newConnection">
          <v-icon size="18" icon="mdi-plus" />
        </v-btn>
        <v-btn v-if="selected" size="small" variant="text" rounded="lg" icon
               :aria-label="t('nas.credentials')" v-tooltip:top="t('nas.credentials')" :disabled="busy" @click="editConnection">
          <v-icon size="18" icon="mdi-key-outline" />
        </v-btn>
        <v-btn v-if="selected" size="small" variant="text" rounded="lg" icon
               :aria-label="t('sources.check')" v-tooltip:top="t('sources.check')" :loading="checking"
               :disabled="busy || saving || editing || !selected.hasCredentials" @click="checkConnection">
          <v-icon size="18" icon="mdi-lan-check" />
        </v-btn>
        <v-btn v-if="selected?.hasCredentials" size="small" variant="text" rounded="lg" class="connection-action--disconnect" icon
               :aria-label="t('nas.disconnect')" v-tooltip:top="t('nas.disconnect')" :disabled="busy" @click="disconnect">
          <v-icon size="18" icon="mdi-link-off" />
        </v-btn>
      </div>
    </div>
    <SourceHealth v-if="selected" :state="!selected.hasCredentials ? 'disconnected' : health[selected.id]?.state || 'unchecked'"
                  :disabled="busy || saving || editing" @reconnect="editConnection">
      <template #retry>
        <v-btn icon="mdi-refresh" size="small" variant="tonal" color="primary"
               :aria-label="t('sources.check')" v-tooltip:top="t('sources.check')" :loading="checking"
               :disabled="busy || saving || editing || !selected.hasCredentials" @click="checkConnection" />
      </template>
    </SourceHealth>
    <v-alert v-if="selected && !selected.hasCredentials" type="info" variant="tonal" density="compact" rounded="lg" class="nas-sources__notice">
      {{ t('nas.disconnected') }}
    </v-alert>
    <v-alert v-if="message" :type="error ? 'error' : 'success'" variant="tonal" density="compact" rounded="lg" class="nas-sources__notice">{{ message }}</v-alert>
    <v-progress-linear v-if="busy && !batchActive" indeterminate class="mt-2" rounded />
    <div v-if="!connectionsOnly && selected?.hasCredentials" class="nas-sources__browser-section">
      <v-btn color="primary" variant="tonal" rounded="xl" size="small" prepend-icon="mdi-file-cog-outline" class="mb-1" @click="originalsOpen = true">{{ t('originals.title') }}</v-btn>
      <DialogOriginalOperations v-model="originalsOpen" :media-ids="[]" :scope="{connectionId: selected.id, key: catalogRootKey || ''}" @changed="browser?.refresh()" />
      <SourceCatalogControls v-if="selected && catalogRootKey !== null" :connection-id="selected.id" :root-key="catalogRootKey" :name="folder"
                             @updated="browser?.refresh(); sync.getItemsFromDb({ids: [], type: 'media'}); events.emit('library:nav-counts-changed')" />
      <MediaFolderBrowser
        :key="selected.id"
        :favorites-scope="JSON.stringify([app.dbPath, app.localhost, selected.id])"
        ref="browser"
        v-model:path="folder"
        v-model:selected-paths="selectedPaths"
        v-model:import-options="importOptions"
        :base-url="app.localhost || ''"
        :directory-loader="directoryLoader"
        :extensions="extensions"
        :error-message="apiError"
        :disabled="busy"
        :enable-folder-tags="false"
        select-addable-only
        @loading="browserLoading = $event"
        @visible-entries="onVisibleEntries"
        @show-hidden="showHidden = $event"
      >
        <template v-if="$slots['browser-footer']" #footerActions><slot name="browser-footer"/></template>
        <template #folderPicker="{addFolder}">
          <MediaFolderBrowser v-model:path="pickerPath" :base-url="app.localhost || ''"
                              :favorites-scope="JSON.stringify([app.dbPath, app.localhost, selected.id])"
                              :directory-loader="directoryLoader" :error-message="apiError"
                              :selected-paths="[]" :show-selection="false" :enable-folder-tags="false"
                              :disabled="busy" folders-only class="mt-3" @loading="pickerLoading = $event" />
          <v-btn variant="tonal" color="primary" class="mt-2" :disabled="busy || pickerLoading || !pickerPath"
                 @click="addFolder(pickerPath)">{{ t('media.adding.browser_select_folder') }}</v-btn>
        </template>
        <template #entryActions="{entry, loading}">
          <FilePreviewButton v-if="!entry.isDirectory && (entry.addable || entry.inLibrary)"
                             :file="entry" :disabled="busy || loading" :preview-action="() => previewFile(entry)" />
        </template>
      </MediaFolderBrowser>
      <div v-if="!embedded" class="nas-sources__import-bar">
        <div class="nas-sources__import-actions">
          <v-btn v-if="!embedded && mediaEntries.length" size="small" variant="text" rounded="lg" :disabled="busy || browserLoading" @click="importSelected(mediaEntries.map(entry => entry.path))">{{ t('nas.import_visible') }}</v-btn>
          <v-btn v-if="!embedded" size="small" variant="flat" color="primary" rounded="lg" :disabled="busy || browserLoading || !selectedPaths.length" @click="importSelected()">
            <v-icon start size="16" icon="mdi-plus" />
            {{ t('nas.import_selected') }}
          </v-btn>
        </div>
      </div>

    </div>

    <v-dialog v-model="editing" max-width="560" persistent scrollable>
      <v-card class="nas-source-editor" rounded="xl">
        <DialogHeader :header="t(editId ? 'nas.credentials' : 'nas.add_connection')" icon="server-network-outline"
                      :buttons="editorButtons" compact />
        <v-card-text class="nas-source-editor__body">
          <v-defaults-provider :defaults="{VTextField: {density: 'compact', rounded: 'lg', hideDetails: 'auto'}, VSelect: {density: 'compact', rounded: 'lg', hideDetails: 'auto'}, VTextarea: {density: 'compact', rounded: 'lg', hideDetails: 'auto'}}">
            <div class="nas-source-editor__fields">
              <div class="nas-source-editor__pair">
                <v-text-field v-model="draft.name" :label="t('nas.name')" :disabled="saving" variant="outlined" />
                <v-select v-model="draft.protocol" :items="[{title: 'SFTP', value: 'sftp'}, {title: 'FTPS', value: 'ftps'}, {title: 'FTP', value: 'ftp'}, {title: 'WebDAV HTTPS', value: 'webdav'}]" :label="t('nas.protocol')" :disabled="saving || !!editId" variant="outlined" />
              </div>
              <div class="nas-source-editor__pair nas-source-editor__pair--address">
                <v-text-field v-model="draft.host" :label="t('nas.host')" :disabled="saving || !!editId" variant="outlined" />
                <v-text-field v-model.number="draft.port" :label="t('nas.port')" type="number" :disabled="saving || !!editId" variant="outlined" />
              </div>
              <v-text-field v-model="draft.username" :label="t('nas.username')" :disabled="saving || !!editId" autocomplete="off" variant="outlined" />
              <v-text-field v-model="draft.root" :label="t('nas.root')" :disabled="saving || !!editId" :hint="t(draft.protocol === 'webdav' ? 'nas.webdav_hint' : 'nas.root_hint')" persistent-hint variant="outlined" />
              <v-select v-if="draft.protocol === 'sftp'" v-model="authMode" :items="authModes" :label="t('nas.auth')" :disabled="saving" variant="outlined" />
              <v-text-field v-if="authMode === 'password' || draft.protocol !== 'sftp'" v-model="draft.password" :type="showPassword ? 'text' : 'password'"
                            :label="t('nas.password')" :disabled="saving" autocomplete="new-password" variant="outlined"
                            :placeholder="savedPassword ? t('nas.password_saved') : undefined"
                            :hint="savedPassword ? t('nas.password_keep_hint') : undefined" :persistent-hint="savedPassword">
                <template #append-inner>
                  <v-btn size="small" variant="text" icon :disabled="saving || !draft.password"
                         :aria-label="t(showPassword ? 'nas.hide_password' : 'nas.show_password')"
                         :aria-pressed="showPassword" @click="showPassword = !showPassword">
                    <v-icon size="18" :icon="showPassword ? 'mdi-eye-off-outline' : 'mdi-eye-outline'" />
                  </v-btn>
                </template>
              </v-text-field>
              <template v-else>
                <v-textarea v-model="draft.privateKey" :label="t('nas.private_key')" :disabled="saving" rows="3" variant="outlined"
                            :hint="savedPrivateKey ? t('nas.private_key_keep_hint') : undefined" :persistent-hint="savedPrivateKey" />
                <v-text-field v-model="draft.passphrase" type="password" :label="t('nas.passphrase')" :disabled="saving" autocomplete="new-password" variant="outlined" />
              </template>
              <v-alert v-if="draft.protocol === 'ftp'" type="info" variant="tonal" density="compact" rounded="lg">{{ t('nas.ftp_hint') }}</v-alert>
              <v-alert v-if="formError" type="error" variant="tonal" density="compact" rounded="lg">{{ formError }}</v-alert>
              <v-alert v-if="fingerprint" type="info" variant="tonal" density="compact" rounded="lg">
                <div>{{ t('nas.trust_hint') }}</div>
                <code style="overflow-wrap: anywhere">{{ fingerprint }}</code>
              </v-alert>
            </div>
          </v-defaults-provider>
        </v-card-text>
      </v-card>
    </v-dialog>
  </MediaImportSection>
</template>

<script setup lang="ts">
import {sourceRateLimited, sourceFailure, type SourceFailure} from '@shared/sourceErrors'
import SourceCatalogControls from './SourceCatalogControls.vue'
import DialogOriginalOperations from './DialogOriginalOperations.vue'
import SourceHealth from './SourceHealth.vue'
import {computed, onMounted, onBeforeUnmount, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import MediaImportSection from './MediaImportSection.vue'
import {defaultRemoteImportOptions, remotePathExcluder, importExtensionMatcher, type RemoteImportOptions} from '@/services/remoteImportOptions'
import {parseAndAssignImportPathTags} from '@/services/importPathAutoTag'
import {NasConnectionSchema, type NasConnection, type NasConnectionInput, type NasImportResult} from '@shared/nas'
import MediaFolderBrowser from './MediaFolderBrowser.vue'
import FilePreviewButton from './FilePreviewButton.vue'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import type {BrowseDirectoryEntry, BrowseDirectoryLoader} from '@/services/typedApi/browse'
import {listNasDirectory, nasBrowserPath, nasRelativePath} from '@/services/nasBrowse'
import {runRemoteImportQueue} from '@/services/remoteImportQueue'
import {expandRemoteSelection} from '@/services/remoteImportSelection'
import {useRemoteMediaAddingProcess} from '@/composable/useRemoteMediaAddingProcess'
import {loadNasBrowserPrefs, persistNasBrowserLocation, restoreNasBrowserFolder} from '@/services/nasBrowserPrefs'
import {apiClient} from '@/services/apiClient'
import {nasMediaPath} from '@shared/remoteMedia'
import {useAppStore} from '@/stores/app'
import {useFilePreview} from '@/composable/useFilePreview'
import {useItemsListSync} from '@/composable/itemsListSync'
import {useFreeLibraryGate} from '@/composable/useFreeLibraryGate'
import {useEventBus} from '@/utils/eventBus'
import {remoteSourceErrorMessage} from '@/services/remoteSourceErrors'

const {t} = useI18n()
const originalsOpen = ref(false)
const addingProcess = useRemoteMediaAddingProcess(t)
const emit = defineEmits<{started: []}>()
const {embedded = false, connectionsOnly = false, extensions} = defineProps<{embedded?: boolean; connectionsOnly?: boolean; extensions?: string}>()
const app = useAppStore()
const {preview} = useFilePreview()
const sync = useItemsListSync()
const gate = useFreeLibraryGate()
const events = useEventBus()
const connections = ref<NasConnection[]>([])
const selectedId = ref<string>()
const selected = computed(() => connections.value.find(c => c.id === selectedId.value))
const browserPrefsScope = () => String(app.config?.id || app.localhost || 'default')
const entries = ref<BrowseDirectoryEntry[]>([])
const directories = new Set<string>()
const browser = ref<InstanceType<typeof MediaFolderBrowser>>()
const browserLoading = ref(false)
const showHidden = ref(false)
const scanning = ref(false)
const directoryLoader = computed<BrowseDirectoryLoader | undefined>(() => {
  const connection = selected.value
  return connection ? async input => {
    const current = generation
    try {
      const result = await listNasDirectory(connection, input)
      if (current === generation) health.value[connection.id] = {state: 'ready', checkedAt: Date.now()}
      return result
    } catch (err) {
      if (current === generation) health.value[connection.id] = {state: sourceFailure(err) || 'unknown', checkedAt: Date.now()}
      throw err
    }
  } : undefined
})
function onVisibleEntries(visible: BrowseDirectoryEntry[]) {
  entries.value = visible
  if (folder.value) directories.add(folder.value)
  for (const entry of visible) if (entry.isDirectory) directories.add(entry.path)
}
const selectedPaths = ref<string[]>([])
const pickerPath = ref('')
const pickerLoading = ref(false)
const importOptions = defineModel<RemoteImportOptions>('importOptions', {default: defaultRemoteImportOptions})
const mediaEntries = computed(() => entries.value.filter(entry => !entry.isDirectory && entry.addable && !entry.inLibrary))
const batchActive = ref(false)
const batchProcessed = ref(0)
const batchTotal = ref(0)
const batchStats = ref({found: 0, skipped: 0, inLibrary: 0, added: 0, duplicates: 0})
const stopRequested = ref(false)
const batchErrors = ref<Array<{path: string; message: string}>>([])
let importController: AbortController | undefined
let stopCurrentBatch: (() => void) | undefined
const folder = ref('')
watch(folder, path => { pickerPath.value = path })
const catalogRootKey = computed(() => {
  try { return selected.value ? nasRelativePath(selected.value.root, folder.value) : null } catch { return null }
})
const busy = ref(false)
const checking = ref(false)
const health = ref<Record<string, {state: SourceFailure | 'ready' | 'unknown'; checkedAt: number}>>({})
async function checkConnection() {
  const connection = selected.value
  if (!connection?.hasCredentials || busy.value || saving.value || checking.value) return
  const current = generation
  let verified = false
  checking.value = true; busy.value = true; message.value = ''
  try {
    await listNasDirectory(connection, {path: nasBrowserPath(connection.root, '')})
    if (current === generation) { health.value[connection.id] = {state: 'ready', checkedAt: Date.now()}; verified = true }
  } catch (err) {
    if (current === generation) { health.value[connection.id] = {state: sourceFailure(err) || 'unknown', checkedAt: Date.now()}; error.value = true; message.value = apiError(err) }
  } finally { if (current === generation) { checking.value = false; busy.value = false } }
  if (verified && current === generation) await browser.value?.refresh()
}
const error = ref(false)
const message = ref('')
const editing = ref(false)
const saving = ref(false)
const editId = ref<string>()
const formError = ref('')
const fingerprint = ref('')
const authMode = ref('password')
const showPassword = ref(false)
const savedPassword = ref(false)
const savedPrivateKey = ref(false)
const authModes = computed(() => [{title: t('nas.password'), value: 'password'}, {title: t('nas.private_key'), value: 'key'}])
const initialDraft = (): NasConnectionInput => ({name: '', protocol: 'sftp', host: '', port: 22, username: '', root: '/', password: '', privateKey: '', passphrase: ''})
const draft = ref(initialDraft())
const editorButtons = computed(() => [
  {text: t('nas.cancel'), icon: 'close', outlined: true, disabled: saving.value, action: closeEditor},
  {text: t(fingerprint.value ? 'nas.trust_connect' : 'nas.connect'), icon: fingerprint.value ? 'shield-check-outline' : 'check',
    color: 'primary', loading: saving.value, disabled: saving.value,
    action: fingerprint.value ? trustAndSave : saveConnection},
])
let generation = 0
const apiError = (err: unknown) => {
  if (sourceFailure(err) || sourceRateLimited(err)) return remoteSourceErrorMessage(err, t)
  const code = (err as {response?: {data?: {code?: string}}})?.response?.data?.code
  const key = code ? `nas.errors.${code}` : ''
  return key && t(key) !== key ? t(key) : remoteSourceErrorMessage(err, t)
}
function stopBatch() { stopRequested.value = true; stopCurrentBatch?.(); if (scanning.value) importController?.abort() }
function refreshLibrary() {
  events.emit('library:nav-counts-changed')
}

async function loadConnections() {
  if (!app.localhost) return
  const current = generation
  try {
    const {data} = await apiClient.get<NasConnection[]>('/api/nas/connections')
    if (current !== generation) return
    connections.value = data
    if (!data.some(c => c.id === selectedId.value)) {
      const savedId = loadNasBrowserPrefs(browserPrefsScope()).connectionId
      selectedId.value = data.find(c => c.id === savedId)?.id || data[0]?.id
    }
  } catch (err) { if (current === generation) { error.value = true; message.value = apiError(err) } }
}
function newConnection() {
  showPassword.value = false; savedPassword.value = false; savedPrivateKey.value = false
  draft.value = initialDraft(); editId.value = undefined; authMode.value = 'password'; formError.value = ''; fingerprint.value = ''; editing.value = true
}
function editConnection() {
  if (!selected.value) return
  const {id, hasCredentials: _hasCredentials, hasPassword, hasPrivateKey, capabilities: _capabilities, ...config} = selected.value
  showPassword.value = false; savedPassword.value = hasPassword; savedPrivateKey.value = hasPrivateKey
  draft.value = {...config, password: '', privateKey: '', passphrase: ''}; editId.value = id
  authMode.value = hasPrivateKey && !hasPassword ? 'key' : 'password'; formError.value = ''; fingerprint.value = ''; editing.value = true
}
function closeEditor() {
  editing.value = false; draft.value = initialDraft(); fingerprint.value = ''; formError.value = ''
  showPassword.value = false; savedPassword.value = false; savedPrivateKey.value = false
}
async function trustAndSave() { draft.value.hostFingerprint = fingerprint.value; fingerprint.value = ''; await saveConnection() }
async function saveConnection() {
  if (saving.value) return
  const input: NasConnectionInput = {...draft.value}
  if (authMode.value !== 'key' || input.protocol !== 'sftp') { delete input.privateKey; delete input.passphrase }
  else delete input.password
  if (editId.value && !input.password && !input.privateKey) { delete input.password; delete input.privateKey; delete input.passphrase }
  const parsed = NasConnectionSchema.safeParse(input)
  if (!parsed.success) { formError.value = t('nas.invalid'); return }
  const current = generation
  saving.value = true; formError.value = ''
  try {
    const route = editId.value ? `/api/nas/connections/${editId.value}` : '/api/nas/connections'
    const {data} = await apiClient.request<NasConnection>({method: editId.value ? 'PUT' : 'POST', url: route, data: parsed.data, timeout: 35_000})
    if (current !== generation) return
    connections.value = [...connections.value.filter(c => c.id !== data.id), data]
    health.value[data.id] = {state: 'ready', checkedAt: Date.now()}
    const sameSelected = selectedId.value === data.id
    selectedId.value = data.id; closeEditor()
    if (sameSelected) await browser.value?.refresh()
  } catch (err) {
    if (current !== generation) return
    const response = (err as {response?: {data?: {fingerprint?: string}}})?.response?.data
    fingerprint.value = response?.fingerprint || ''; formError.value = apiError(err)
  } finally { if (current === generation) saving.value = false }
}
async function disconnect() {
  if (!selectedId.value || busy.value) return
  busy.value = true
  try { await apiClient.post(`/api/nas/connections/${selectedId.value}/disconnect`); entries.value = []; await loadConnections(); selectedPaths.value = []; message.value = ''; if (selectedId.value) delete health.value[selectedId.value] }
  catch (err) { error.value = true; message.value = apiError(err) }
  finally { busy.value = false }
}
async function previewFile(entry: BrowseDirectoryEntry) {
  if (busy.value || browserLoading.value || !selected.value) return
  const connection = selected.value
  const current = generation
  busy.value = true; message.value = ''; error.value = false
  try {
    await preview({name: entry.name,
      path: nasMediaPath(connection.id, nasRelativePath(connection.root, entry.path))})
  } catch (err) { if (current === generation) { error.value = true; message.value = apiError(err) } }
  finally { if (current === generation) busy.value = false }
}
async function importSelected(paths: string[] = selectedPaths.value) {
  if (addingProcess.active || busy.value || browserLoading.value || !selected.value?.hasCredentials || !paths.length) return
  const current = generation
  const connection = selected.value
  const connectionId = connection.id
  const options = {...importOptions.value}
  const matchesExtension = importExtensionMatcher(extensions)
  const acceptFile = (path: string) => matchesExtension(path)
  const isExcluded = remotePathExcluder(options)
  const controller = new AbortController()
  let stopped = false
  let added = 0; let duplicates = 0
  importController = controller; stopCurrentBatch = () => { stopped = true }
  busy.value = true; batchActive.value = true; stopRequested.value = false
  scanning.value = true; batchProcessed.value = 0; batchTotal.value = new Set(paths).size; batchErrors.value = []
  message.value = ''; error.value = false
  batchStats.value = {found: 0, skipped: 0, inLibrary: 0, added: 0, duplicates: 0}
  const run = addingProcess.begin({source: connection.name, stop: stopBatch, retry: () => importSelected(),
    readablePath: path => path.startsWith(connection.root + '/') || path === connection.root ? path : nasBrowserPath(connection.root, path),
    snapshot: () => ({scanning: scanning.value, stopped: stopRequested.value, processed: batchProcessed.value,
      total: batchTotal.value, ...batchStats.value, remaining: selectedPaths.value.length, errors: batchErrors.value}),
  })
  if (!run) { busy.value = false; batchActive.value = false; return }
  emit('started')
  try {
    const expanded = await expandRemoteSelection({
      paths, directories, isExcluded, acceptFile, onExisting: entry => run.recordExisting(entry.path), shouldStop: () => stopped || current !== generation,
      onProgress: progress => { if (current === generation) Object.assign(batchStats.value, progress) },
      load: path => listNasDirectory(connection, {path, extensions, showHidden: showHidden.value}, controller.signal, Infinity),
      onFolderError(path, err) {
        directories.add(path)
        batchErrors.value.push({path, message: err instanceof Error && err.message === 'truncated' ? t('nas.truncated') : apiError(err)})
      },
    })
    if (current !== generation) return
    scanning.value = false
    if (expanded.stopped) { message.value = t('nas.scan_stopped'); return }
    selectedPaths.value = [...new Set([...selectedPaths.value.filter(path => !paths.includes(path)), ...expanded.paths, ...expanded.failedFolders])]
    batchTotal.value = expanded.paths.length
    const queuePaths: string[] = []
    for (const path of expanded.paths) {
      try { queuePaths.push(nasRelativePath(connection.root, path)) }
      catch (err) { batchErrors.value.push({path, message: apiError(err)}) }
    }
    const invalidPaths = expanded.paths.length - queuePaths.length
    batchProcessed.value = invalidPaths
    const result = await runRemoteImportQueue<NasImportResult>({
      paths: queuePaths, shouldStop: () => stopped || current !== generation,
      async nextChunkSize() {
        if (!await gate.ensureCanImportMedia()) return 0
        if (gate.registered.value || gate.grandfathered.value) return 10
        return Math.min(10, Math.max(0, gate.freeCap - gate.libraryCount.value))
      },
      async request(chunk) {
        run.phase('importing')
        const {data} = await apiClient.post<{results: NasImportResult[]}>('/api/nas/import-batch', {connectionId, paths: chunk},
          {timeout: 180_000, signal: controller.signal})
        return data.results
      },
      async onRequestError(paths, err) {
        if (current !== generation) return
        for (const path of paths) batchErrors.value.push({path, message: apiError(err)})
        // A timeout can hide committed cards. Reconcile the cap before the next batch.
        refreshLibrary(); await gate.refreshLibraryCount()
      },
      onProgress: done => { if (current === generation) batchProcessed.value = invalidPaths + done },
      async onResults(results) {
        if (current !== generation) return
        for (const result of results) {
          if (result.ok) {
            run.record(result.path, result.id, result.created)
            if (result.created) added++; else duplicates++
          } else batchErrors.value.push({path: result.path, message: apiError({response: {data: result}})})
        }
        const successful = results.filter((result): result is Extract<NasImportResult, {ok: true}> => result.ok)
        let tagsFailed = false
        if (options.parseTags) {
          run.phase('tagging')
          try {
            await parseAndAssignImportPathTags(successful.map(result => ({
              path: nasBrowserPath(connection.root, result.path), mediaId: result.id,
            })), {shouldStop: () => current !== generation})
          } catch (err) {
            if (current !== generation) return
            tagsFailed = true
            for (const result of successful) batchErrors.value.push({path: result.path, message: apiError(err)})
          }
        }
        if (current !== generation) return
        if (!tagsFailed) {
          const completed = new Set(successful.map(result => nasBrowserPath(connection.root, result.path)))
          selectedPaths.value = selectedPaths.value.filter(path => !completed.has(path))
        }
        batchStats.value.added = added; batchStats.value.duplicates = duplicates
        refreshLibrary(); await gate.refreshLibraryCount()
      },
    })
    if (current !== generation) return
    stopRequested.value ||= result.stopped
    message.value = t('nas.batch_summary', {added, duplicates: duplicates + batchStats.value.inLibrary, errors: batchErrors.value.length})
      + (result.stopped ? ` ${t('nas.batch_stopped', {count: result.total - result.processed})}` : '')
    error.value = batchErrors.value.length > 0
  } catch (err) {
    if (current === generation) {
      error.value = true
      batchErrors.value.push({path: '', message: apiError(err)})
      message.value = `${t('nas.batch_summary', {added, duplicates, errors: batchErrors.value.length})} ${apiError(err)} ${t('nas.batch_retry')}`
      refreshLibrary(); await gate.refreshLibraryCount()
    }
  } finally {
    if (current === generation) { busy.value = false; batchActive.value = false; scanning.value = false; importController = undefined; stopCurrentBatch = undefined; await browser.value?.refresh(); run.finish() }
  }
}
watch(selectedId, () => {
  entries.value = []; directories.clear(); message.value = ''
  const connection = selected.value
  const prefs = loadNasBrowserPrefs(browserPrefsScope())
  folder.value = connection ? restoreNasBrowserFolder(connection.root, prefs.folders[connection.id]) : ''
  if (connection) persistNasBrowserLocation(browserPrefsScope(), connection.id, folder.value)
  if (folder.value) directories.add(folder.value)
  selectedPaths.value = []; batchErrors.value = []; batchStats.value = {found: 0, skipped: 0, inLibrary: 0, added: 0, duplicates: 0}; browserLoading.value = false; showHidden.value = false
})
watch(folder, path => {
  if (selected.value && path) persistNasBrowserLocation(browserPrefsScope(), selected.value.id, path)
})
watch(() => draft.value.protocol, protocol => { if (!editId.value) draft.value.port = protocol === 'sftp' ? 22 : protocol === 'webdav' ? 443 : 21; fingerprint.value = '' })
watch([() => app.dbPath, () => app.config?.id, () => app.localhost], () => {
  generation++; health.value = {}; checking.value = false; connections.value = []; selectedId.value = undefined; entries.value = []; directories.clear(); folder.value = ''; busy.value = false; saving.value = false
  importController?.abort(); stopCurrentBatch?.(); batchActive.value = false; selectedPaths.value = []; batchErrors.value = []
  closeEditor(); message.value = ''; void loadConnections()
})
onMounted(loadConnections)
onBeforeUnmount(() => { generation++; stopCurrentBatch?.(); importController?.abort() })
const canSubmit = computed(() => !!selected.value?.hasCredentials && !addingProcess.active && !busy.value && !browserLoading.value && !!selectedPaths.value.length)
const selectionCount = computed(() => selectedPaths.value.length)
defineExpose({hasPathSettings: computed(() => !connectionsOnly && !!selected.value?.hasCredentials), refreshConnections: loadConnections, canSubmit, busy: computed(() => busy.value || saving.value || editing.value), selectionCount, submit: () => importSelected(), stop: stopBatch, stopping: stopRequested, canStop: batchActive})
</script>

<style scoped lang="scss">
.nas-sources {
  :deep(.v-expansion-panel) {
    border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  }

  :deep(.v-expansion-panel-text__wrapper) {
    padding: 4px 14px 12px;
  }
}

.nas-sources__title {
  min-height: 46px;
  padding: 10px 14px;
  font-size: 0.875rem;
  font-weight: 600;

  &.v-expansion-panel-title--active {
    min-height: 46px;
  }
}

.nas-sources__connection-bar,
.nas-sources__connection-actions,
.nas-sources__import-bar,
.nas-sources__import-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.nas-sources__connection-select {
  flex: 1;
  min-width: 140px;
}

.nas-sources__connection-actions {
  flex-shrink: 0;
}

.nas-sources__protocol {
  padding: 2px 5px;
  border-radius: 4px;
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.08);
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.nas-sources__connection-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
}

.nas-sources__connection-status {
  width: 5px;
  height: 5px;
  flex-shrink: 0;
  border-radius: 50%;
  background: rgba(var(--v-theme-on-surface), 0.35);

  &--ready {
    background: rgb(var(--v-theme-success));
  }
}

.nas-sources__notice {
  margin-top: 8px;
  font-size: 0.8125rem;
}

.nas-sources__browser-section {
  margin-top: 10px;
}

.nas-sources__import-bar {
  flex-wrap: wrap;
  margin-top: 8px;
}

.nas-sources__import-actions {
  flex-wrap: wrap;
  margin-left: auto;
  justify-content: flex-end;
}

.nas-source-editor__body {
  padding: 12px 20px 16px !important;
}

.nas-source-editor__fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.nas-source-editor__pair {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 140px;
  gap: 10px;

  &--address {
    grid-template-columns: minmax(0, 1fr) 96px;
  }
}

@media (max-width: 480px) {
  .nas-sources__connection-select {
    min-width: 0;
  }

  .nas-sources__import-actions {
    flex-basis: 100%;
  }

  .nas-source-editor__body {
    padding-inline: 14px !important;
  }

  .nas-source-editor__pair {
    grid-template-columns: minmax(0, 1fr) 100px;

    &--address {
      grid-template-columns: minmax(0, 1fr) 76px;
    }
  }
}
</style>

<style scoped lang="scss" src="@/assets/styles/source-connection-actions.scss"></style>
