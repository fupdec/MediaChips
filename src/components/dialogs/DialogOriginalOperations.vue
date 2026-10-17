<template>
  <v-dialog v-model="visible" :aria-label="t('originals.title')" class="originals-dialog" max-width="850" scrollable>
    <v-card>
      <v-card-title>{{ t('originals.title') }}</v-card-title>
      <v-card-text>
        <p class="mb-3 text-body-2">{{ t('originals.hint') }}</p>
        <v-alert v-if="error" type="error" class="mb-3" role="alert">{{ error }}</v-alert>
        <v-alert v-if="!sameConnection && !['download', 'delete'].includes(kind)" type="info" class="mb-3">{{ t('originals.same_connection') }}</v-alert>
        <v-select v-model="kind" :items="kinds" :label="t('originals.action')" :disabled="pending" />
        <v-alert v-if="kind === 'download'" type="info" variant="tonal" class="mb-3">{{ t('originals.download_hint') }}</v-alert>
        <v-alert v-if="source && !source.writable && kind !== 'download'" type="warning" class="mb-3">{{ t(source.provider === 'gdrive' ? 'originals.drive_authorization' : 'originals.read_only') }}</v-alert>
        <v-text-field v-if="kind !== 'delete'" v-model="destination" :disabled="pending" :label="t(kind === 'rename' ? 'originals.filename' : 'originals.destination')" :hint="t(kind === 'download' || source?.provider === 'local' ? 'originals.local_path' : source?.provider === 'gdrive' ? 'originals.drive_path' : 'originals.nas_path')" persistent-hint class="mb-3" />
        <v-text-field v-if="kind === 'mkdir' && source?.provider === 'gdrive'" v-model="newFolderName" :disabled="pending" :label="t('originals.folder_name')" />
        <v-file-input v-if="kind === 'upload'" v-model="files" multiple :label="t('originals.select_files')" :disabled="pending" />
        <v-select v-if="kind !== 'delete'" v-model="conflict" :items="conflicts" :label="t('originals.conflict')" :disabled="pending" />
        <v-alert v-if="kind === 'delete'" type="warning" variant="tonal">
          {{ t('originals.delete_count', {count: sources.length}) }}
          <div v-for="row in sources" :key="row.path" class="text-caption text-break mt-1">{{ row.name }} · {{ row.path }}</div>
        </v-alert>
        <v-checkbox v-if="kind === 'delete'" v-model="confirmDelete" :disabled="pending" color="error" :label="t('originals.confirm_delete')" />
        <v-btn :color="kind === 'delete' ? 'error' : 'primary'" :loading="pending" :disabled="!canSubmit" @click="submit">{{ t('originals.' + kind) }}</v-btn>
        <v-divider class="my-4" />
        <h3 class="text-subtitle-1 mb-2">{{ t('originals.history') }}</h3>
        <v-alert v-if="jobs.some(job => job.state === 'awaiting_upload')" type="info" variant="tonal" class="mb-3">{{ t('originals.resume_upload') }}</v-alert>
        <v-card v-for="job in jobs" :key="job.id" variant="outlined" class="mb-3">
          <v-card-text>
            <div role="status" class="mb-2">{{ t('originals.states.' + job.state) }} · {{ job.items.filter(item => item.state === 'completed' || item.state === 'skipped').length }} / {{ job.items.length }}</div>
            <div v-for="item in job.items" :key="item.id" class="mb-3">
              <div class="text-body-2 text-break">{{ t('originals.' + item.kind) }} · {{ item.target?.key || item.source?.key || item.mediaId }}</div>
              <v-progress-linear :model-value="item.state === 'completed' || item.state === 'skipped' ? 100 : item.total ? Math.min(99, item.bytes / item.total * 100) : 0" :indeterminate="item.state === 'running' && !item.total" class="my-1" />
              <div class="text-caption">{{ t('originals.item_states.' + item.state) }} · {{ getReadableFileSize(item.bytes) }} / {{ getReadableFileSize(item.total) }}</div>
              <div v-if="item.error" class="text-error text-caption" role="alert">{{ errorText(item.error) }}</div>
              <v-file-input v-if="job.state === 'awaiting_upload' && item.kind === 'upload' && !item.readyUpload" :label="t('originals.reselect_file')" :disabled="pending" @update:model-value="resumeUpload(job, item.id, $event)" />
            </div>
            <v-btn v-if="job.state === 'failed' || job.state === 'interrupted'" size="small" variant="tonal" :disabled="pending" @click="retry(job.id)">{{ t('originals.retry') }}</v-btn>
            <v-btn v-if="job.state === 'running' || job.state === 'queued'" size="small" variant="text" @click="cancel(job.id)">{{ t('common.cancel') }}</v-btn>
          </v-card-text>
        </v-card>
      </v-card-text>
      <v-card-actions><v-spacer /><v-btn @click="visible = false">{{ t('common.close') }}</v-btn></v-card-actions>
    </v-card>
  </v-dialog>
</template>
<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useDialogsStore} from '@/stores/dialogs'
import {useItemsListSync} from '@/composable/itemsListSync'
import {getReadableFileSize} from '@/services/formatUtils'
import {originalOperationsApi as api, type OriginalSourceInfo} from '@/services/typedApi/originalOperations'
import type {OriginalJob, OriginalOperation, OriginalTarget} from '@shared/originalOperations'
const props = withDefaults(defineProps<{mediaIds: number[]; scope?: OriginalTarget; scopeWritable?: boolean}>(), {scopeWritable: true})
const emit = defineEmits<{changed: []}>()
const visible = defineModel<boolean>({default: false})
const {t, te} = useI18n()
const app = useAppStore()
const itemsStore = useItemsStore()
const dialogsStore = useDialogsStore()
const listSync = useItemsListSync()
const source = ref<OriginalSourceInfo>()
const sources = ref<OriginalSourceInfo[]>([])
const jobs = ref<OriginalJob[]>([])
const kind = ref<OriginalOperation['kind']>('download')
const destination = ref('')
const newFolderName = ref('')
const conflict = ref<OriginalOperation['conflict']>('fail')
const confirmDelete = ref(false)
const files = ref<File[]>([])
const pending = ref(false)
const error = ref('')
let generation = 0
let timer: ReturnType<typeof setTimeout> | undefined
const kinds = computed(() => ['download', 'rename', 'mkdir', 'upload', 'move', 'delete'].filter(k => (props.mediaIds.length || ['mkdir', 'upload'].includes(k)) && (k !== 'rename' || props.mediaIds.length === 1)).map(value => ({value, title: t('originals.' + value)})))
const conflicts = computed(() => ['fail', 'skip', 'keep-both'].map(value => ({value, title: t('originals.conflicts.' + value)})))
const sameConnection = computed(() => sources.value.every(row => row.source.connectionId === source.value?.source.connectionId))
const canSubmit = computed(() => !pending.value && (sources.value.length === props.mediaIds.length || !!props.scope) && !!source.value
  && (kind.value === 'download' || sources.value.every(row => row.writable))
  && (['download', 'delete'].includes(kind.value) || sameConnection.value)
  && (kind.value === 'delete' ? confirmDelete.value : !!destination.value.trim() || (kind.value === 'upload' && source.value.provider === 'nas'))
  && (kind.value !== 'upload' || files.value.length > 0)
  && (kind.value !== 'mkdir' || source.value?.provider !== 'gdrive' || !!newFolderName.value.trim()))
const errorText = (code?: string) => code && te('originals.errors.' + code) ? t('originals.errors.' + code) : t('originals.errors.operation_failed')
function join(folder: string, name: string) { return folder ? folder.replace(/[/\\]+$/, '') + (folder.includes('\\') ? '\\' : '/') + name : name }
function basename(key: string) { return key.split(/[/\\]/).pop() || key }
function parent(key: string) { const i = Math.max(key.lastIndexOf('/'), key.lastIndexOf('\\')); return i < 0 ? '' : key.slice(0, i) || '/' }
async function loadJobs(current: number) {
  const {data} = await api.jobs()
  if (current !== generation) return
  const previous = new Map(jobs.value.map(job => [job.id, job.state]))
  jobs.value = data.filter(job => job.items.some(item => item.mediaId && props.mediaIds.includes(item.mediaId))
    || job.items.some(item => !item.mediaId && item.target?.connectionId === (props.scope?.connectionId || source.value?.source.connectionId))).reverse()
  if (jobs.value.some(job => previous.has(job.id) && previous.get(job.id) !== job.state && (job.state === 'completed' || job.state === 'failed'))) {
    for (const id of props.mediaIds) {
      const {data: info} = await api.source(id)
      if (current !== generation) return
      const patch = {path: info.path, basename: info.name, ext: info.ext || ''}
      const index = props.mediaIds.indexOf(id)
      if (index >= 0) sources.value[index] = info
      source.value = sources.value[0]
      itemsStore.updateItem({id, item: patch})
      if (dialogsStore.mediaEditing.media?.id === id) dialogsStore.mediaEditing.media = {...dialogsStore.mediaEditing.media, ...patch}
    }
    listSync.getItemsFromDb({ids: props.mediaIds, type: 'media'})
    emit('changed')
  }
  schedulePoll(current)
}
function schedulePoll(current: number) {
  clearTimeout(timer)
  if (visible.value && current === generation) timer = setTimeout(() => {
    void loadJobs(current).catch(() => { if (current === generation) { error.value = errorText(); schedulePoll(current) } })
  }, 1000)
}
async function action(run: (current: number) => Promise<void>) {
  const current = generation; pending.value = true; error.value = ''
  try { await run(current) } catch (err) { if (current === generation) error.value = errorText((err as {response?: {data?: {code?: string}}}).response?.data?.code) }
  finally { if (current === generation) pending.value = false }
}
async function submit() {
  await action(async current => {
    const items: OriginalOperation[] = []
    const connectionId = kind.value === 'download' ? undefined : source.value!.source.connectionId
    const drive = connectionId === 'google-drive'
    if (kind.value === 'upload') {
      for (const file of files.value) items.push({kind: 'upload', conflict: conflict.value, target: {connectionId, key: drive ? destination.value.trim() : join(destination.value.trim(), file.name), ...(drive ? {name: file.name} : {})}, uploadSize: file.size})
    } else if (kind.value === 'mkdir') items.push({kind: 'mkdir', conflict: conflict.value, target: {connectionId, key: destination.value.trim(), ...(drive ? {name: newFolderName.value.trim()} : {})}})
    else for (let i = 0; i < props.mediaIds.length; i++) {
      const row = sources.value[i]
      const target = kind.value === 'delete' ? undefined : {connectionId: kind.value === 'download' ? undefined : row.source.connectionId,
        key: drive ? (kind.value === 'rename' ? row.parentKey || 'root' : destination.value.trim()) : kind.value === 'rename' ? join(parent(row.source.key), destination.value.trim()) : join(destination.value.trim(), row.name || basename(row.source.key)),
        ...(drive ? {name: kind.value === 'rename' ? destination.value.trim() : row.name} : {})}
      items.push({kind: kind.value, mediaId: props.mediaIds[i], target, conflict: conflict.value, ...(kind.value === 'delete' ? {confirmDelete: true as const} : {})})
    }
    const {data} = await api.create(items)
    if (current !== generation) return
    jobs.value = [data, ...jobs.value]
    await loadJobs(current)
    if (kind.value === 'upload') for (let i = 0; i < files.value.length; i++) { if (current !== generation) return; await api.upload(data.id, data.items[i].id, files.value[i]) }
    confirmDelete.value = false
    await loadJobs(current)
  })
}
const retry = (id: string) => action(async current => {
  const {data} = await api.retry(id, conflict.value)
  if (current !== generation) return
  jobs.value = jobs.value.map(job => job.id === id ? data : job)
  await loadJobs(current)
})
const cancel = (id: string) => action(async current => { await api.cancel(id); await loadJobs(current) })
const resumeUpload = (job: OriginalJob, id: string, selection: File | File[] | null) => action(async current => {
  const file = Array.isArray(selection) ? selection[0] : selection
  if (!file) return
  const item = job.items.find(row => row.id === id)!
  if (file.size !== item.uploadSize || file.name !== (item.target!.name || basename(item.target!.key))) { error.value = t('originals.errors.wrong_upload'); return }
  await api.upload(job.id, id, file); await loadJobs(current)
})
watch(kind, () => { confirmDelete.value = false; destination.value = kind.value === 'rename' ? source.value?.name || basename(source.value?.source.key || '') : source.value?.provider === 'gdrive' ? source.value.parentKey || 'root' : props.scope?.key || '' })
watch([visible, () => props.mediaIds.join(','), () => JSON.stringify(props.scope), () => app.dbPath, () => app.localhost], async () => {
  const current = ++generation; clearTimeout(timer)
  source.value = undefined; sources.value = []; jobs.value = []; error.value = ''; pending.value = false; confirmDelete.value = false
  if (!visible.value) return
  try {
    await loadJobs(current)
    const data = await Promise.all(props.mediaIds.map(id => api.source(id)))
    if (current !== generation) return
    sources.value = data.map(row => row.data); source.value = sources.value[0]
    if (!props.mediaIds.length && props.scope) {
      source.value = {provider: props.scope.connectionId === 'google-drive' ? 'gdrive' : props.scope.connectionId ? 'nas' : 'local', source: props.scope,
        name: '', path: props.scope.key, parentKey: props.scope.key, writable: props.scopeWritable !== false}
      sources.value = [source.value]
      kind.value = 'mkdir'; destination.value = props.scope.key
    }
    await loadJobs(current)
  } catch { if (current === generation) error.value = errorText() }
}, {immediate: true})
onBeforeUnmount(() => { generation++; clearTimeout(timer) })
</script>
