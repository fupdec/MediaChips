<template>
  <section class="copy-discovery" :class="{'copy-discovery--compact': compact}" data-testid="copy-discovery">
    <h3 v-if="showHeading" class="text-subtitle-2 mb-2">{{ t('copyDiscovery.title') }}</h3>
    <p v-if="showHeading" class="text-caption mb-3">{{ t('copyDiscovery.hint') }}</p>
    <div class="copy-discovery__input">
      <div class="copy-discovery__sources mb-3">
        <v-autocomplete v-model="selectedSource" :items="sourceItems" item-value="id"
          :label="t('copyDiscovery.saved_sources')" :loading="loadingSources"
          :disabled="pending" clearable variant="outlined" density="compact" rounded="lg" hide-details />
        <v-btn :disabled="pending || !activeSource" variant="tonal" prepend-icon="mdi-plus" @click="insertSource">
          {{ t('copyDiscovery.insert_path') }}
        </v-btn>
        <v-btn :disabled="pending" variant="tonal" prepend-icon="mdi-folder-open-outline" @click="openBrowser">
          {{ t('settings_labels.database.select_folder') }}
        </v-btn>
      </div>
      <DialogBrowseFolder v-if="browserOpen" v-model="browserOpen" :initial-path="browserPath"
        :directory-loader="browserLoader" :path-titles="browserTitles" @confirm="insertBrowsedFolders" />
      <label class="copy-discovery__label" :for="pathsId">{{ t('copyDiscovery.folders') }}</label>
      <v-textarea :id="pathsId" v-model="rootsText"
        :rows="compact ? 2 : 3" auto-grow variant="outlined" :density="compact ? 'compact' : 'comfortable'" rounded="lg"
        hide-details :disabled="pending" />
      <p class="copy-discovery__hint"><v-icon size="16" aria-hidden="true">mdi-information-outline</v-icon>{{ t('copyDiscovery.folders_hint') }}</p>
      <div class="copy-discovery__actions">
        <v-btn class="copy-discovery__start" size="small" variant="flat" color="primary" rounded="lg" prepend-icon="mdi-folder-search-outline"
          :disabled="!rootsText.trim() || pending" :loading="pending" @click="start">
          {{ t('copyDiscovery.start') }}
        </v-btn>
      </div>
    </div>
    <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-3" role="alert">{{ error }}</v-alert>
    <div v-if="collapseHistory && jobs.length" class="copy-discovery__summary" data-testid="copy-discovery-summary">
      <div class="copy-discovery__summary-heading">
        <span>{{ t('copyDiscovery.summary', {count: jobs.length}) }}</span>
        <v-btn v-if="jobs.some(job => !active(job))" size="small" variant="text"
          prepend-icon="mdi-delete-outline" :disabled="pending" data-testid="copy-discovery-clear-history" @click="clearHistory">
          {{ t('copyDiscovery.clear_history') }}
        </v-btn>
      </div>
      <div class="copy-discovery__stats" role="status" :aria-label="t('copyDiscovery.progress', totals)">
        <div v-for="stat in summaryStats" :key="stat.key" class="copy-discovery__stat" :class="{'copy-discovery__stat--alert': stat.key === 'failed' && stat.value > 0}">
          <v-icon :icon="stat.icon" size="18" aria-hidden="true" />
          <strong>{{ stat.value }}</strong>
          <span>{{ t('copyDiscovery.stats.' + stat.key) }}</span>
        </div>
      </div>
    </div>
    <component v-for="group in jobGroups" :key="group.id" :is="group.history ? 'details' : 'div'" class="copy-discovery__group">
      <summary v-if="group.history" class="copy-discovery__history-toggle">
        <v-icon size="18" aria-hidden="true" class="copy-discovery__chevron">mdi-chevron-right</v-icon>
        <v-icon size="18" aria-hidden="true">mdi-history</v-icon>
        <span>{{ t('copyDiscovery.history', {count: group.jobs.length}) }}</span>
      </summary>
      <MediaCopyDiscoveryJobList
        :jobs="group.jobs"
        :history="group.history"
        :history-label="group.history ? t('copyDiscovery.history', {count: group.jobs.length}) : undefined"
        v-slot="{job}"
      >
        <div class="copy-discovery__job" :class="'copy-discovery__job--' + job.state">
          <div class="copy-discovery__job-head">
            <span class="copy-discovery__job-icon" aria-hidden="true">
              <v-progress-circular v-if="running(job)" indeterminate size="18" width="2" />
              <v-icon v-else size="18" :icon="stateIcon(job.state)" />
            </span>
            <div class="copy-discovery__job-title">
              <strong>{{ t('copyDiscovery.states.' + job.state) }}</strong>
              <div class="copy-discovery__job-meta">
                <span v-for="trigger in job.triggers || []" :key="trigger" class="copy-discovery__tag">{{ t('copyDiscovery.triggers.' + trigger) }}</span>
                <span class="copy-discovery__tag copy-discovery__tag--mono">{{ job.method === 'sha256' ? 'SHA-256' : 'oshash' }}</span>
              </div>
            </div>
            <div class="copy-discovery__job-actions">
              <v-btn v-if="active(job)" size="small" variant="tonal" color="primary" rounded="lg" :disabled="pending"
                :prepend-icon="job.state === 'paused' ? 'mdi-play' : 'mdi-pause'"
                @click="run(() => job.state === 'paused' ? api.resume(job.id) : api.pause(job.id))">
                {{ t(job.state === 'paused' ? 'copyDiscovery.resume' : 'copyDiscovery.pause') }}
              </v-btn>
              <v-btn v-if="active(job)" size="small" variant="text" color="error" rounded="lg" :disabled="pending" prepend-icon="mdi-stop" @click="run(() => api.cancel(job.id))">{{ t('copyDiscovery.cancel') }}</v-btn>
              <v-btn v-else-if="job.state !== 'completed' || job.counts.failed" size="small" variant="tonal" rounded="lg" :disabled="pending" prepend-icon="mdi-refresh" @click="run(() => api.retry(job.id))">{{ t('copyDiscovery.retry') }}</v-btn>
            </div>
          </div>
          <div class="copy-discovery__roots">
            <v-icon size="14" aria-hidden="true">mdi-folder-outline</v-icon>
            <span :title="job.roots.map(root => root.key).join('\n')">{{ job.roots.map(root => root.key).join(' · ') }}</span>
          </div>
          <div class="copy-discovery__bar" role="progressbar" :aria-valuenow="job.total - jobStats(job).pending" aria-valuemin="0" :aria-valuemax="job.total">
            <span v-for="segment in jobSegments(job)" :key="segment.key" :class="'copy-discovery__bar--' + segment.key" :style="{width: segment.width}" />
          </div>
          <div class="copy-discovery__chips" role="status" :aria-label="t('copyDiscovery.progress', jobStats(job))">
            <span class="copy-discovery__chip"><strong>{{ job.total }}</strong> {{ t('copyDiscovery.stats.total').toLowerCase() }}</span>
            <span v-for="stat in jobChips(job)" :key="stat.key" class="copy-discovery__chip" :class="['copy-discovery__chip--' + stat.key, {'copy-discovery__chip--zero': !stat.value}]">
              <i aria-hidden="true" /><strong>{{ stat.value }}</strong> {{ t('copyDiscovery.stats.' + stat.key).toLowerCase() }}
            </span>
          </div>
          <p v-if="job.error" class="text-caption text-error">{{ message(job.error) }}</p>
          <details v-if="showResults && job.items.length">
            <summary class="text-caption">{{ t('copyDiscovery.results') }}</summary>
            <ul class="copy-discovery__results">
              <li v-for="item in job.items" :key="item.id">
                <span class="copy-discovery__path" :title="item.path">{{ item.path }}</span>
                <span class="text-caption">{{ t('copyDiscovery.items.' + item.state) }}<template v-if="item.mediaId"> · #{{ item.mediaId }}</template></span>
                <template v-if="item.state === 'ambiguous'">
                  <v-btn v-for="id in item.candidateIds" :key="id" size="x-small" variant="text" :disabled="pending || active(job)" :title="item.candidates?.find(card => card.id === id)?.path" @click="run(() => api.choose(job.id, item.id, id))">{{ t('copyDiscovery.choose', {name: item.candidates?.find(card => card.id === id)?.name || '#' + id}) }}</v-btn>
                </template>
                <span v-if="item.error" class="text-caption text-error">{{ message(item.error) }}</span>
                <v-btn v-if="item.state === 'attached'" size="x-small" variant="text" :disabled="pending" @click="run(() => api.undo(job.id, item.id))">{{ t('copyDiscovery.undo') }}</v-btn>
              </li>
            </ul>
            <p v-if="job.truncated" class="text-caption">{{ t('copyDiscovery.truncated') }}</p>
          </details>
        </div>
      </MediaCopyDiscoveryJobList>
    </component>
  </section>
</template>

<script setup lang="ts">
import {computed, ref, onMounted, onBeforeUnmount, watch, useId} from 'vue'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {useWatcherStore} from '@/stores/watcher'
import {apiClient} from '@/services/apiClient'
import {sourceCatalogApi} from '@/services/typedApi/sourceCatalog'
import type {NasConnection} from '@shared/nas'
import {cloudMediaPath, parseCloudMediaPath, type CloudAccount, type CloudProvider} from '@shared/cloudAccounts'
import {nasMediaPath} from '@shared/remoteMedia'
import DialogBrowseFolder from '@/components/dialogs/DialogBrowseFolder.vue'
import MediaCopyDiscoveryJobList from './MediaCopyDiscoveryJobList.vue'
import {listNasDirectory, nasBrowserPath, nasRelativePath} from '@/services/nasBrowse'
import {driveBrowserRoot, driveFileIdFromPath, listDriveDirectory} from '@/services/driveBrowse'
import {listCloudFolders} from '@/services/cloudFolderBrowse'
import type {BrowseDirectoryLoader} from '@/services/typedApi/browse'
import type {DriveStatus} from '@shared/cloudDrive'
import {copyDiscoveryApi as api} from '@/services/typedApi/copyDiscovery'
import type {CopyDiscoveryJob, CopyDiscoveryInput} from '@shared/copyDiscovery'
const props = withDefaults(defineProps<{mediaId?: number; compact?: boolean; showHeading?: boolean; showResults?: boolean; collapseHistory?: boolean}>(), {
  showHeading: true,
  showResults: true,
  collapseHistory: false,
})
const emit = defineEmits<{changed: []}>()
const {t, te} = useI18n()
const app = useAppStore()
const pathsId = useId()
const rootsText = ref('')
type Root = CopyDiscoveryInput['roots'][number]
const rootId = (root: Root) => JSON.stringify([root.connectionId ?? null, root.key])
const sourceItem = (title: string, root: Root, connection?: NasConnection | CloudAccount) =>
  ({id: rootId(root), title, root, connection})
const watcher = useWatcherStore()
const remoteSources = ref<ReturnType<typeof sourceItem>[]>([])
const selectedSource = ref<string | null>(null)
const loadingSources = ref(false)
const sourceItems = computed(() => [
  ...watcher.folders.map(folder => sourceItem(folder.name || folder.path, {key: folder.path, excluded: folder.excludedPaths})),
  ...remoteSources.value,
])

const activeSource = computed(() => sourceItems.value.find(item => item.id === selectedSource.value))
const browserOpen = ref(false)
const browserPath = ref('')
const browserLoader = ref<BrowseDirectoryLoader>()
const browserTitles = ref<Record<string, string>>({})
let pathFromBrowser = (path: string) => path

function appendPaths(paths: string[]) {
  const existing = new Set(rootsText.value.split('\n').map(line => line.trim()))
  const additions = [...new Set(paths)].filter(path => !existing.has(path))
  if (!additions.length) return
  const separator = rootsText.value && !rootsText.value.endsWith('\n') ? '\n' : ''
  rootsText.value += separator + additions.join('\n')
}

function sourcePath(root: Root, provider?: CloudProvider) {
  if (!root.connectionId) return root.key
  if (root.connectionId === 'google-drive') return `gdrive://${root.key}`
  return provider ? cloudMediaPath(provider, root.connectionId, root.key) : nasMediaPath(root.connectionId, root.key)
}

function insertSource() {
  const source = activeSource.value
  if (source) appendPaths([sourcePath(source.root, source.connection && 'provider' in source.connection ? source.connection.provider : undefined)])
}

function openBrowser() {
  const source = activeSource.value
  const connection = source?.connection
  const key = source?.root.key ?? ''
  browserPath.value = key
  browserLoader.value = undefined
  pathFromBrowser = path => path
  if (connection && 'provider' in connection) {
    const root = '/' + connection.name.replaceAll('/', '／')
    const folderKey = (path: string) => path === root ? 'root' : decodeURIComponent(path.slice(path.lastIndexOf('/') + 1))
    browserPath.value = key === 'root' ? root : `${root}/${encodeURIComponent(key)}`
    browserLoader.value = input => listCloudFolders(connection.id, root, input)
    pathFromBrowser = path => cloudMediaPath(connection.provider, connection.id, folderKey(path))
  } else if (connection) {
    browserPath.value = nasBrowserPath(connection.root, key)
    browserLoader.value = input => listNasDirectory(connection, input)
    pathFromBrowser = path => nasMediaPath(connection.id, nasRelativePath(connection.root, path))
  } else if (source?.root.connectionId === 'google-drive') {
    browserPath.value = key === 'root' ? driveBrowserRoot : `${driveBrowserRoot}/${key}`
    browserLoader.value = listDriveDirectory
    pathFromBrowser = path => `gdrive://${driveFileIdFromPath(path)}`
  }
  browserTitles.value = source && browserPath.value ? {[browserPath.value]: source.title} : {}
  const loadDirectory = browserLoader.value
  if (loadDirectory) {
    const titles = browserTitles.value
    browserLoader.value = async input => {
      const result = await loadDirectory(input)
      for (const entry of result.entries) titles[entry.path] = entry.name
      return result
    }
  }
  browserOpen.value = true
}

function insertBrowsedFolders(paths: string[]) {
  appendPaths(paths.map(pathFromBrowser))
}

async function loadSources() {
  loadingSources.value = true
  const current = generation
  const [nas, cloud, drive, catalog] = await Promise.allSettled([
    apiClient.get<NasConnection[]>('/api/nas/connections'),
    apiClient.get<CloudAccount[]>('/api/cloud-accounts'),
    apiClient.get<DriveStatus>('/api/drive/status'),
    sourceCatalogApi.roots(),
  ])
  if (current !== generation || stopped) return

  const connections = [
    ...(nas.status === 'fulfilled' ? nas.value.data.map(item => ({id: item.id, name: item.name, key: '', connection: item})) : []),
    ...(cloud.status === 'fulfilled' ? cloud.value.data.filter(item => item.authenticated)
      .map(item => ({id: item.id, name: item.name, key: 'root', connection: item})) : []),
    ...(drive.status === 'fulfilled' && drive.value.data.authenticated
      ? [{id: 'google-drive', name: t('drive.title'), key: 'root', connection: undefined}] : []),
  ]
  const folders = catalog.status === 'fulfilled' ? catalog.value.data : []
  remoteSources.value = connections.flatMap(({id, name, key, connection}) => [
    sourceItem(name, {connectionId: id, key}, connection),
    ...folders.filter(folder => folder.connectionId === id && folder.rootKey !== key)
      .map(folder => sourceItem(`${name} · ${folder.name || folder.rootKey}`, {connectionId: id, key: folder.rootKey}, connection)),
  ])
  loadingSources.value = false
}
const jobs = ref<CopyDiscoveryJob[]>([])
const error = ref('')
const pending = ref(false)
let generation = 0
let stopped = false
let timer: ReturnType<typeof setTimeout> | undefined
const active = (job: CopyDiscoveryJob) => ['queued', 'discovering', 'verifying', 'paused'].includes(job.state)
const pollingDelay = () => jobs.value.some(job => active(job) && job.state !== 'paused') ? 2000 : 30000
const jobGroups = computed(() => props.collapseHistory
  ? [
    {id: 'current', history: false, jobs: jobs.value.filter(active)},
    {id: 'history', history: true, jobs: jobs.value.filter(job => !active(job))},
  ].filter(group => group.jobs.length)
  : [{id: 'all', history: false, jobs: jobs.value}])
const totals = computed(() => jobs.value.reduce((sum, job) => ({
  total: sum.total + job.total,
  attached: sum.attached + (job.counts.attached || 0),
  pending: sum.pending + (job.counts.candidate || 0) + (job.counts.checking || 0),
  ambiguous: sum.ambiguous + (job.counts.ambiguous || 0),
  failed: sum.failed + (job.counts.failed || 0),
}), {total: 0, attached: 0, pending: 0, ambiguous: 0, failed: 0}))
const summaryStats = computed(() => [
  {key: 'total', value: totals.value.total, icon: 'mdi-file-outline'},
  {key: 'attached', value: totals.value.attached, icon: 'mdi-link-variant'},
  {key: 'pending', value: totals.value.pending, icon: 'mdi-clock-outline'},
  {key: 'ambiguous', value: totals.value.ambiguous, icon: 'mdi-call-split'},
  {key: 'failed', value: totals.value.failed, icon: 'mdi-alert-circle-outline'},
])
const running = (job: CopyDiscoveryJob) => job.state === 'discovering' || job.state === 'verifying'
const stateIcons: Record<string, string> = {
  paused: 'mdi-pause-circle-outline', queued: 'mdi-clock-outline', completed: 'mdi-check-circle-outline',
  cancelled: 'mdi-stop-circle-outline', failed: 'mdi-alert-circle-outline',
}
const stateIcon = (state: string) => stateIcons[state] || 'mdi-progress-clock'
const jobStats = (job: CopyDiscoveryJob) => ({
  total: job.total,
  attached: job.counts.attached || 0,
  pending: (job.counts.candidate || 0) + (job.counts.checking || 0),
  ambiguous: job.counts.ambiguous || 0,
  failed: job.counts.failed || 0,
})
const jobChips = (job: CopyDiscoveryJob) => {
  const stats = jobStats(job)
  return (['attached', 'pending', 'ambiguous', 'failed'] as const).map(key => ({key, value: stats[key]}))
}
const jobSegments = (job: CopyDiscoveryJob) => {
  const stats = jobStats(job)
  const total = Math.max(job.total, 1)
  const other = Math.max(job.total - stats.attached - stats.pending - stats.ambiguous - stats.failed, 0)
  return [
    {key: 'attached', value: stats.attached}, {key: 'other', value: other},
    {key: 'ambiguous', value: stats.ambiguous}, {key: 'failed', value: stats.failed},
  ].filter(segment => segment.value > 0).map(segment => ({key: segment.key, width: `${segment.value / total * 100}%`}))
}
const message = (code: string) => te('copyDiscovery.errors.' + code) ? t('copyDiscovery.errors.' + code) : t('copyDiscovery.errors.failed')
const showError = (err: unknown) => { error.value = message((err as {response?: {data?: {code?: string}}}).response?.data?.code || 'failed') }
async function load() {
  const current = generation
  try {
    const result = await api.list()
    if (current !== generation || stopped) return
    const previous = JSON.stringify(jobs.value.map(job => job.counts.attached || 0))
    jobs.value = result.data.filter(job => props.mediaId ? job.mediaId === props.mediaId : true)
    if (previous !== JSON.stringify(jobs.value.map(job => job.counts.attached || 0))) emit('changed')
  } catch (err) { if (current === generation && !stopped) showError(err) }
  finally {
    if (current === generation && !stopped) timer = setTimeout(() => { void load() }, pollingDelay())
  }
}
async function clearHistory() {
  if (pending.value) return
  const current = ++generation
  clearTimeout(timer)
  pending.value = true; error.value = ''
  try {
    const result = await api.clearHistory()
    if (current !== generation || stopped) return
    jobs.value = result.data
  } catch (err) { if (current === generation && !stopped) showError(err) }
  finally {
    if (current === generation && !stopped) {
      pending.value = false
      void load()
    }
  }
}
async function run(action: () => ReturnType<typeof api.job>) {
  if (pending.value) return
  const current = ++generation
  clearTimeout(timer)
  pending.value = true; error.value = ''
  try {
    const result = await action()
    if (current !== generation || stopped) return
    jobs.value = [result.data, ...jobs.value.filter(job => job.id !== result.data.id)]
    emit('changed')
  } catch (err) { if (current === generation && !stopped) showError(err) }
  finally {
    if (current === generation && !stopped) {
      pending.value = false
      timer = setTimeout(() => { void load() }, pollingDelay())
    }
  }
}
function start() {
  void run(() => {
    const manualRoots: Root[] = rootsText.value.split('\n').map(value => value.trim()).filter(Boolean).map(key => {
      const nas = /^nas:\/\/([0-9a-f-]{36})\/(.*)$/i.exec(key)
      if (nas) return {connectionId: nas[1], key: nas[2].split('/').map(decodeURIComponent).join('/')}
      const cloud = parseCloudMediaPath(key)
      if (cloud) return {connectionId: cloud.connectionId, key: cloud.resourceKey}
      const dropbox = /^dropbox:\/\/([0-9a-f-]{36})\/(.*)$/i.exec(key)
      if (dropbox) {
        const folder = decodeURIComponent(dropbox[2])
        return {connectionId: dropbox[1], key: folder.startsWith('root/') ? folder.slice(4) : folder}
      }
      if (key.startsWith('gdrive://')) return {connectionId: 'google-drive', key: key.slice(9)}
      return {key, excluded: watcher.folders.find(folder => folder.path === key)?.excludedPaths}
    })
    const roots = [...new Map(manualRoots.map(root => [rootId(root), root])).values()]
    return api.create({roots, ...(props.mediaId ? {mediaId: props.mediaId} : {})})
  })
}
onMounted(() => { void load(); void loadSources() })
onBeforeUnmount(() => { stopped = true; generation++; clearTimeout(timer) })
watch([() => app.dbPath, () => app.localhost, () => props.mediaId], () => {
  generation++; clearTimeout(timer); jobs.value = []; pending.value = false; error.value = ''; rootsText.value = ''
  selectedSource.value = null; remoteSources.value = []; browserOpen.value = false
  void load(); void loadSources()
})
</script>

<style scoped>
.copy-discovery { margin-block: 16px; min-width: 0; }
.copy-discovery__input { padding: 16px; border-radius: 14px; background: rgba(var(--v-theme-primary), .035); border: 1px solid rgba(var(--v-theme-primary), .09); margin-bottom: 20px; }
.copy-discovery__sources { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.copy-discovery__sources > .v-autocomplete { flex: 1 1 200px; min-width: 0; }
.copy-discovery__label { display: block; margin-bottom: 6px; font-size: .75rem; }
.copy-discovery__input :deep(textarea) { font-family: monospace; font-size: .8125rem; line-height: 1.7; overflow-wrap: anywhere; }
.copy-discovery__hint { display: flex; align-items: flex-start; gap: 7px; font-size: .75rem; line-height: 1.6; color: rgba(var(--v-theme-on-surface), .6); margin: 10px 0 16px; overflow-wrap: anywhere; }
.copy-discovery__hint .v-icon { margin-top: 2px; flex-shrink: 0; }
.copy-discovery__actions { display: flex; justify-content: flex-end; }
.copy-discovery__start.v-btn { height: 28px !important; min-height: 28px !important; padding-inline: 9px !important; font-size: .6875rem !important; }
.copy-discovery__start :deep(.v-icon) { font-size: 15px; }
.copy-discovery__summary { margin-bottom: 16px; }
.copy-discovery__summary-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; font-size: .75rem; font-weight: 600; color: rgba(var(--v-theme-on-surface), .65); }
.copy-discovery__stats { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
.copy-discovery__stat { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 8px 4px; padding: 12px; border-radius: 12px; background: rgba(var(--v-theme-on-surface), .035); }
.copy-discovery__stat > .v-icon { color: rgba(var(--v-theme-on-surface), .45); }
.copy-discovery__stat strong { font-size: 1.125rem; font-variant-numeric: tabular-nums; }
.copy-discovery__stat span { grid-column: 1 / -1; font-size: .6875rem; line-height: 1.4; color: rgba(var(--v-theme-on-surface), .6); }
.copy-discovery__stat--alert { background: rgba(var(--v-theme-error), .07); }
.copy-discovery__stat--alert strong, .copy-discovery__stat--alert > .v-icon { color: rgb(var(--v-theme-error)); }
.copy-discovery__history-toggle { display: flex; align-items: center; gap: 8px; list-style: none; padding: 12px 0; font-size: .8125rem; font-weight: 500; border-top: 1px solid rgba(var(--v-theme-on-surface), .08); }
.copy-discovery__history-toggle::-webkit-details-marker { display: none; }
.copy-discovery__chevron { transition: transform .18s ease; }
details[open] > .copy-discovery__history-toggle .copy-discovery__chevron { transform: rotate(90deg); }
.copy-discovery__history-toggle:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: 2px; border-radius: 4px; }
@media (max-width: 600px) {
  .copy-discovery__stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .copy-discovery__stat:first-child { grid-column: 1 / -1; }
  .copy-discovery__input { padding: 12px; }
  .copy-discovery__actions > .v-btn { width: 100%; height: auto; min-height: 40px; }
  .copy-discovery__actions :deep(.v-btn__content) { white-space: normal; }
  .copy-discovery__job { padding: 12px; }
  .copy-discovery__job-actions { margin-left: 0; width: 100%; }
}
.copy-discovery__group > summary { cursor: pointer; }
.copy-discovery__job { --job-accent: var(--v-theme-primary); display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; margin-bottom: 10px; border-radius: 14px; border: 1px solid rgba(var(--v-theme-on-surface), .08); background: rgba(var(--v-theme-on-surface), .02); }
.copy-discovery__job--completed { --job-accent: var(--v-theme-success); }
.copy-discovery__job--failed { --job-accent: var(--v-theme-error); }
.copy-discovery__job--paused, .copy-discovery__job--queued, .copy-discovery__job--cancelled { --job-accent: var(--v-theme-on-surface); }
.copy-discovery__job-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.copy-discovery__job-icon { display: grid; place-items: center; width: 34px; height: 34px; flex-shrink: 0; border-radius: 10px; color: rgb(var(--job-accent)); background: rgba(var(--job-accent), .1); }
.copy-discovery__job-title { flex: 1 1 160px; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.copy-discovery__job-title strong { font-size: .875rem; line-height: 1.3; }
.copy-discovery__job-meta { display: flex; flex-wrap: wrap; gap: 4px; }
.copy-discovery__tag { padding: 1px 8px; border-radius: 999px; font-size: .6875rem; line-height: 1.6; color: rgba(var(--v-theme-on-surface), .7); background: rgba(var(--v-theme-on-surface), .06); }
.copy-discovery__tag--mono { font-family: monospace; }
.copy-discovery__job-actions { display: flex; gap: 4px; margin-left: auto; }
.copy-discovery__roots { display: flex; align-items: center; gap: 6px; min-width: 0; font-family: monospace; font-size: .75rem; color: rgba(var(--v-theme-on-surface), .7); }
.copy-discovery__roots .v-icon { flex-shrink: 0; opacity: .7; }
.copy-discovery__roots span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.copy-discovery__bar { display: flex; height: 6px; border-radius: 999px; overflow: hidden; background: rgba(var(--v-theme-on-surface), .08); }
.copy-discovery__bar > span { transition: width .3s ease; }
.copy-discovery__bar--attached, .copy-discovery__chip--attached i { background: rgb(var(--v-theme-success)); }
.copy-discovery__bar--other { background: rgba(var(--v-theme-on-surface), .28); }
.copy-discovery__bar--ambiguous, .copy-discovery__chip--ambiguous i { background: rgb(var(--v-theme-warning)); }
.copy-discovery__bar--failed, .copy-discovery__chip--failed i { background: rgb(var(--v-theme-error)); }
.copy-discovery__chip--pending i { background: rgba(var(--v-theme-on-surface), .25); }
.copy-discovery__chips { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: .75rem; color: rgba(var(--v-theme-on-surface), .65); }
.copy-discovery__chip { display: inline-flex; align-items: center; gap: 5px; }
.copy-discovery__chip i { width: 8px; height: 8px; border-radius: 50%; }
.copy-discovery__chip strong { color: rgb(var(--v-theme-on-surface)); font-variant-numeric: tabular-nums; }
.copy-discovery__chip--zero { opacity: .5; }
.copy-discovery__chip--failed:not(.copy-discovery__chip--zero) strong { color: rgb(var(--v-theme-error)); }
.copy-discovery__chip--ambiguous:not(.copy-discovery__chip--zero) strong { color: rgb(var(--v-theme-warning)); }
.copy-discovery__job details > summary { cursor: pointer; }
.copy-discovery__results { list-style: none; padding: 0; max-height: 320px; overflow: auto; }
.copy-discovery__results li { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; padding-block: 6px; }
.copy-discovery__path { flex: 1 1 240px; overflow-wrap: anywhere; font-size: 12px; }
.copy-discovery--compact { margin-block: 8px 0; }
.copy-discovery--compact .copy-discovery__input { padding: 10px; margin-bottom: 8px; border-radius: 10px; }
.copy-discovery--compact .copy-discovery__hint { margin: 6px 0 8px; font-size: .6875rem; line-height: 1.5; }
.copy-discovery--compact :deep(.v-field-label) { font-size: .75rem; }
.copy-discovery--compact .copy-discovery__input :deep(textarea) { font-size: .6875rem; line-height: 1.5; }
.copy-discovery--compact .copy-discovery__actions > .v-btn { min-height: 28px; font-size: .6875rem; letter-spacing: 0; }
</style>
