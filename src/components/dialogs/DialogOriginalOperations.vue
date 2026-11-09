<template>
  <v-dialog v-model="visible" :aria-label="t('originals.title')" class="originals-dialog" max-width="960" scrollable>
    <v-card class="operation-dialog originals-workspace" rounded="xl">
      <DialogHeader class="originals-header" :header="t('originals.title')" icon="file-cog-outline" compact closable @close="visible = false" />
      <v-card-text class="operation-body">
        <div class="operation-hero">
          <div class="operation-hero__text">
            <p>{{ t('originals.workspace_hint') }}</p>
          </div>
          <v-chip v-if="mediaIds.length" size="small" variant="tonal" color="primary">{{ t('originals.selected_count', {count: mediaIds.length}) }}</v-chip>
        </div>
        <v-alert v-if="error" type="error" variant="tonal" rounded="lg" class="mb-2" role="alert">{{ error }}</v-alert>
        <v-progress-linear v-if="!source && !error" indeterminate color="primary" class="mb-2" />
        <div class="originals-layout">
          <section class="originals-form" :aria-label="t('originals.action')">
            <div v-if="source" class="originals-source">
              <v-icon :title="t('originals.source')" size="18" :icon="source.provider === 'gdrive' ? 'mdi-google-drive' : source.provider === 'nas' ? 'mdi-nas' : 'mdi-folder-outline'" color="primary" />
              <div class="originals-source__text">
                <strong>{{ source.name || t('originals.providers.' + source.provider) }}</strong>
                <span :title="source.path">{{ source.path }}</span>
              </div>
              <v-icon v-if="!source.writable" icon="mdi-lock-outline" size="18" :title="t('originals.read_only')" />
            </div>
            <div class="originals-action-picker">
              <div class="operation-section-heading"><h3>{{ t('originals.action') }}</h3></div>
              <div class="originals-actions" role="group" :aria-label="t('originals.action')">
                <v-btn v-for="option in kinds" :key="option.value" class="originals-action" :class="{'originals-action--selected': kind === option.value}"
                  :color="kind === option.value ? (option.value === 'delete' ? 'error' : 'primary') : undefined"
                  :variant="kind === option.value ? 'flat' : 'outlined'" :disabled="pending" :aria-pressed="kind === option.value"
                  :aria-label="t('originals.choose_action', {action: option.title})" @click="kind = option.value">
                  <v-icon :icon="actionIcons[option.value]" size="16" />
                  <span>{{ option.title }}</span>
                </v-btn>
              </div>
            </div>
            <v-alert v-if="!sameConnection && !['download', 'transfer', 'delete'].includes(kind)" type="info" variant="tonal" rounded="lg" class="mb-2">{{ t('originals.same_connection') }}</v-alert>
            <v-alert v-if="source && !source.writable && !['download', 'transfer'].includes(kind)" type="warning" variant="tonal" rounded="lg" class="mb-2">{{ t(source.provider === 'gdrive' ? 'originals.drive_authorization' : 'originals.read_only') }}</v-alert>
            <form class="originals-settings" :class="{'originals-settings--delete': kind === 'delete'}" @submit.prevent="submit">
              <div class="originals-settings__heading">
                <v-icon :icon="actionIcons[kind]" size="18" color="primary" />
                <h3>{{ t('originals.' + kind) }}</h3>
              </div>
              <template v-if="kind === 'transfer'">
                <v-select v-model="targetConnection" :items="destinationOptions" :label="t('originals.target_source')" :disabled="pending" variant="outlined" density="compact" hide-details />
                <v-select v-model="removeSource" :items="transferModes" :label="t('originals.transfer_mode')" :disabled="pending" variant="outlined" density="compact" hide-details />
                <v-alert icon="mdi-information-outline" variant="tonal" color="primary" rounded="lg" class="text-body-2">{{ t('originals.transfer_hint') }}</v-alert>
                <v-checkbox v-if="removeSource" v-model="confirmDelete" :disabled="pending" color="error" :label="t('originals.confirm_transfer_delete')" hide-details />
              </template>
              <v-text-field v-if="kind !== 'delete'" v-model="destination" :disabled="pending" variant="outlined" density="compact" :prepend-inner-icon="kind === 'rename' ? 'mdi-pencil-outline' : 'mdi-folder-outline'"
                :label="t(kind === 'rename' ? 'originals.filename' : 'originals.destination')"
                :hint="kind === 'rename' ? undefined : t(kind === 'download' || destinationProvider === 'local' ? 'originals.local_path' : destinationProvider === 'gdrive' ? 'originals.drive_path' : 'originals.nas_path')"
                :persistent-hint="kind !== 'rename'" />
              <v-text-field v-if="kind === 'mkdir' && source?.provider === 'gdrive'" v-model="newFolderName" :disabled="pending" variant="outlined" density="compact" :label="t('originals.folder_name')" />
              <v-file-input v-if="kind === 'upload'" v-model="files" multiple variant="outlined" density="compact" :label="t('originals.select_files')" :disabled="pending" />
              <v-select :menu-props="{contentClass: 'media-detail-select-menu', maxHeight: 260}" :list-props="{density: 'compact', slim: true}" v-if="kind !== 'delete'" v-model="conflict" :items="conflicts" :label="t('originals.conflict')" :disabled="pending" variant="outlined" density="compact" hide-details />
              <v-alert v-if="kind === 'download'" icon="mdi-information-outline" variant="tonal" color="primary" rounded="lg" class="text-body-2">{{ t('originals.download_hint') }}</v-alert>
              <template v-if="kind === 'delete'">
                <v-alert type="warning" variant="tonal" rounded="lg">
                  {{ t('originals.delete_count', {count: sources.length}) }}
                  <div v-for="row in sources" :key="row.path" class="originals-delete-source">{{ row.name }} · {{ row.path }}</div>
                </v-alert>
                <v-checkbox v-model="confirmDelete" :disabled="pending" color="error" density="compact" :label="t('originals.confirm_delete')" hide-details />
              </template>
              <v-btn type="submit" class="originals-submit" :prepend-icon="actionIcons[kind]" :color="kind === 'delete' ? 'error' : 'primary'" variant="flat" size="small" rounded="lg" :loading="pending" :disabled="!canSubmit">{{ t('originals.' + kind) }}</v-btn>
            </form>
          </section>
          <section class="originals-history" :aria-label="t('originals.history')">
            <div class="operation-section-heading">
              <h3><v-icon icon="mdi-history" size="19" class="mr-2" />{{ t('originals.history') }}</h3>
              <v-chip size="x-small" variant="tonal">{{ jobs.length }}</v-chip>
            </div>
            <p class="originals-history__hint">{{ t('originals.history_hint') }}</p>
            <v-alert v-if="jobs.some(job => job.state === 'awaiting_upload')" type="info" variant="tonal" rounded="lg" class="mb-2">{{ t('originals.resume_upload') }}</v-alert>
            <div v-if="!jobs.length" class="operation-empty">
              <div class="operation-empty__icon"><v-icon icon="mdi-tray-arrow-down" size="30" /></div>
              <h3>{{ t('originals.empty_title') }}</h3>
              <p>{{ t('originals.empty_hint') }}</p>
            </div>
            <article v-for="job in jobs" :key="job.id" class="originals-job">
              <div class="originals-job__heading">
                <v-chip :color="stateColor(job.state)" :prepend-icon="stateIcon(job.state)" size="small" variant="tonal">
                  <span role="status">{{ t('originals.states.' + job.state) }} · {{ job.items.filter(item => item.state === 'completed' || item.state === 'skipped').length }} / {{ job.items.length }}</span>
                </v-chip>
                <time :datetime="job.createdAt">{{ jobDate(job.createdAt) }}</time>
              </div>
              <div v-for="item in job.items" :key="item.id" class="originals-job__item">
                <div class="originals-job__name"><v-icon :icon="actionIcons[item.kind]" size="17" /><strong>{{ t('originals.' + item.kind) }}</strong></div>
                <div class="originals-job__path">{{ item.transfer?.destination?.key || item.target?.key || item.source?.key || item.mediaId }}</div>
                <v-progress-linear :model-value="item.state === 'completed' || item.state === 'skipped' ? 100 : item.total ? Math.min(99, item.bytes / item.total * 100) : 0" :indeterminate="item.state === 'running' && !item.total" :color="stateColor(item.state)" height="4" rounded class="my-1" />
                <div class="originals-job__progress"><span>{{ t('originals.item_states.' + item.state) }}</span><span v-if="item.total || item.bytes">{{ getReadableFileSize(item.bytes) }} / {{ getReadableFileSize(item.total) }}</span></div>
                <div v-if="item.error" class="originals-job__error text-error" role="alert"><v-icon icon="mdi-alert-circle-outline" size="16" />{{ errorText(item.error) }}</div>
                <v-file-input v-if="job.state === 'awaiting_upload' && item.kind === 'upload' && !item.readyUpload" variant="outlined" density="compact" class="mt-2" :label="t('originals.reselect_file')" :disabled="pending" @update:model-value="resumeUpload(job, item.id, $event)" />
              </div>
              <v-btn v-if="job.state === 'failed' || job.state === 'interrupted'" size="small" variant="tonal" color="primary" prepend-icon="mdi-restart" :disabled="pending" @click="retry(job.id)">{{ t('originals.retry') }}</v-btn>
              <v-btn v-if="job.state === 'running' || job.state === 'queued'" size="small" variant="text" prepend-icon="mdi-stop-circle-outline" :disabled="pending" @click="cancel(job.id)">{{ t('common.cancel') }}</v-btn>
            </article>
          </section>
        </div>
      </v-card-text>
      <div class="operation-footer"><v-icon icon="mdi-card-text-outline" size="17" /><span>{{ t('originals.metadata_hint') }}</span></div>
    </v-card>
  </v-dialog>
</template>
<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useDialogsStore} from '@/stores/dialogs'
import {useItemsListSync} from '@/composable/itemsListSync'
import {getReadableFileSize} from '@/services/formatUtils'
import {originalOperationsApi as api, type OriginalSourceInfo, type OriginalDestination} from '@/services/typedApi/originalOperations'
import type {OriginalJob, OriginalOperation, OriginalTarget} from '@shared/originalOperations'
const props = withDefaults(defineProps<{mediaIds: number[]; scope?: OriginalTarget; scopeWritable?: boolean}>(), {scopeWritable: true})
const emit = defineEmits<{changed: []}>()
const visible = defineModel<boolean>({default: false})
const {t, te, locale} = useI18n()
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
const removeSource = ref(false)
const targetConnection = ref('local')
const destinations = ref<OriginalDestination[]>([])
const destinationProvider = computed(() => kind.value === 'transfer' ? destinations.value.find(row => row.id === targetConnection.value)?.provider : source.value?.provider)
const destinationOptions = computed(() => destinations.value.map(row => ({value: row.id, title: row.name || t('originals.providers.' + row.provider), props: {disabled: !row.writable}})))
const transferModes = computed(() => [{value: false, title: t('originals.transfer_copy')}, {value: true, title: t('originals.transfer_remove')}])
const files = ref<File[]>([])
const pending = ref(false)
const error = ref('')
let generation = 0
let timer: ReturnType<typeof setTimeout> | undefined
const kinds = computed(() => ['download', 'transfer', 'rename', 'mkdir', 'upload', 'move', 'delete'].filter(k => (props.mediaIds.length || ['mkdir', 'upload'].includes(k)) && (k !== 'rename' || props.mediaIds.length === 1)).map(value => ({value: value as OriginalOperation['kind'], title: t('originals.' + value)})))
const actionIcons: Record<OriginalOperation['kind'], string> = {download: 'mdi-tray-arrow-down', transfer: 'mdi-swap-horizontal', rename: 'mdi-pencil-outline', mkdir: 'mdi-folder-plus-outline', upload: 'mdi-tray-arrow-up', move: 'mdi-folder-move-outline', delete: 'mdi-trash-can-outline'}
const stateColor = (state: string) => state === 'completed' ? 'success' : state === 'failed' ? 'error' : ['interrupted', 'awaiting_upload'].includes(state) ? 'warning' : 'primary'
const stateIcon = (state: string) => state === 'completed' ? 'mdi-check-circle-outline' : state === 'failed' ? 'mdi-alert-circle-outline' : state === 'running' ? 'mdi-progress-clock' : 'mdi-clock-outline'
const jobDate = (date: string) => new Date(date).toLocaleString(locale.value, {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'})
const conflicts = computed(() => ['fail', 'skip', 'keep-both'].map(value => ({value, title: t('originals.conflicts.' + value)})))
const sameConnection = computed(() => sources.value.every(row => row.source.connectionId === source.value?.source.connectionId))
const canSubmit = computed(() => !pending.value && (sources.value.length === props.mediaIds.length || !!props.scope) && !!source.value
  && (['download', 'transfer'].includes(kind.value) || sources.value.every(row => row.writable))
  && (['download', 'transfer', 'delete'].includes(kind.value) || sameConnection.value)
  && (kind.value !== 'transfer' || (destinations.value.some(row => row.id === targetConnection.value && row.writable) && (!removeSource.value || (confirmDelete.value && sources.value.every(row => row.writable)))))
  && (kind.value === 'delete' ? confirmDelete.value : !!destination.value.trim() || (['upload', 'transfer'].includes(kind.value) && destinationProvider.value === 'nas'))
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
  if (!canSubmit.value) return
  await action(async current => {
    const items: OriginalOperation[] = []
    const connectionId = kind.value === 'transfer' ? (targetConnection.value === 'local' ? undefined : targetConnection.value) : kind.value === 'download' ? undefined : source.value!.source.connectionId
    const drive = connectionId === 'google-drive'
    if (kind.value === 'upload') {
      for (const file of files.value) items.push({kind: 'upload', conflict: conflict.value, target: {connectionId, key: drive ? destination.value.trim() : join(destination.value.trim(), file.name), ...(drive ? {name: file.name} : {})}, uploadSize: file.size})
    } else if (kind.value === 'mkdir') items.push({kind: 'mkdir', conflict: conflict.value, target: {connectionId, key: destination.value.trim(), ...(drive ? {name: newFolderName.value.trim()} : {})}})
    else for (let i = 0; i < props.mediaIds.length; i++) {
      const row = sources.value[i]
      const target = kind.value === 'delete' ? undefined : {connectionId: kind.value === 'transfer' ? connectionId : kind.value === 'download' ? undefined : row.source.connectionId,
        key: drive ? (kind.value === 'rename' ? row.parentKey || 'root' : destination.value.trim()) : kind.value === 'rename' ? join(parent(row.source.key), destination.value.trim()) : join(destination.value.trim(), row.name || basename(row.source.key)),
        ...(drive ? {name: kind.value === 'rename' ? destination.value.trim() : row.name} : {})}
      items.push({kind: kind.value, mediaId: props.mediaIds[i], target, conflict: conflict.value, ...(kind.value === 'delete' ? {confirmDelete: true as const} : {}), ...(kind.value === 'transfer' ? {removeSource: removeSource.value, ...(removeSource.value ? {confirmDelete: true as const} : {})} : {})})
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
watch(removeSource, () => { confirmDelete.value = false })
watch(targetConnection, () => { if (kind.value === 'transfer') destination.value = targetConnection.value === 'google-drive' ? 'root' : '' })
watch(kind, () => {
  confirmDelete.value = false
  destination.value = kind.value === 'transfer' ? (targetConnection.value === 'google-drive' ? 'root' : '') : kind.value === 'rename' ? source.value?.name || basename(source.value?.source.key || '') : source.value?.provider === 'gdrive' ? source.value.parentKey || 'root' : props.scope?.key || ''
  if (kind.value === 'transfer') {
    const current = generation
    void api.destinations().then(({data}) => { if (current === generation) destinations.value = data })
      .catch(() => { if (current === generation) error.value = errorText() })
  }
})
watch([visible, () => props.mediaIds.join(','), () => JSON.stringify(props.scope), () => app.dbPath, () => app.localhost], async () => {
  const current = ++generation; clearTimeout(timer)
  source.value = undefined; sources.value = []; jobs.value = []; destinations.value = []; targetConnection.value = 'local'; removeSource.value = false; kind.value = 'download'; error.value = ''; pending.value = false; confirmDelete.value = false
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

<style scoped lang="scss" src="@/assets/styles/operation-dialog.scss"></style>
<style scoped lang="scss">
.originals-layout { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 16px; }
.originals-form { min-width: 0; }
.originals-source {
  display: flex; align-items: center; gap: 8px; padding: 8px 10px; margin-bottom: 10px;
  border: 1px solid var(--operation-border); border-radius: 10px; background: rgba(var(--v-theme-primary), .03);
  &__text { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
  strong { font-size: .75rem; font-weight: 500; overflow-wrap: anywhere; }
  &__text > span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .6875rem; color: var(--operation-muted); }
}
.originals-actions { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 10px; }
.originals-action {
  height: 28px !important; padding: 0 8px !important; min-width: 0; border-color: var(--operation-border); border-radius: 999px;
  :deep(.v-btn__content) { gap: 5px; line-height: 1.2; font-size: .6875rem; }
  &--selected { font-weight: 600; box-shadow: 0 2px 6px rgba(var(--v-theme-primary), .2); }
}
.originals-settings { display: flex; flex-direction: column; gap: 10px; }
.originals-submit { align-self: flex-start; }
.originals-history { padding-left: 16px; border-left: 1px solid var(--operation-border); min-width: 0; }
.originals-history__hint { margin: 0 0 8px; font-size: .6875rem; color: var(--operation-muted); line-height: 1.5; }
.originals-job {
  padding: 8px 10px; margin-bottom: 6px; border: 1px solid var(--operation-border); border-radius: 10px;
  &__heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 4px; }
  &__heading time { color: var(--operation-muted); font-size: .625rem; }
  &__heading :deep(.v-chip) { max-width: 100%; height: auto; min-height: 22px; padding-block: 2px; font-size: .6875rem; }
  &__heading :deep(.v-chip__content) { white-space: normal; }
  &__item { padding-block: 8px; }
  &__item + &__item { border-top: 1px solid var(--operation-border); }
  &__name { display: flex; align-items: center; gap: 5px; font-size: .75rem; }
  &__name strong { font-weight: 500; }
  &__path { margin-top: 2px; font-size: .6875rem; color: var(--operation-muted); overflow-wrap: anywhere; }
  &__progress { display: flex; justify-content: space-between; gap: 6px; color: var(--operation-muted); font-size: .625rem; }
  &__error { display: flex; align-items: flex-start; gap: 4px; margin-top: 5px; font-size: .6875rem; line-height: 1.5; }
  &__error .v-icon { margin-top: 2px; }
}
@media (max-width: 700px) {
  .originals-layout { grid-template-columns: minmax(0, 1fr); gap: 12px; }
  .originals-history { padding: 10px 0 0; border-left: 0; border-top: 1px solid var(--operation-border); }
}

// Local workspace layout: keep these overrides within the originals dialog.
.originals-workspace {
  @media (max-width: 600px) {
    :deep(.originals-header .content) {
      min-height: 40px !important;
      padding: 4px 16px !important;
    }
    :deep(.originals-header .headline__title) { font-size: .875rem !important; line-height: 1.3; }
    :deep(.originals-header .dialog-header__close) { width: 28px; height: 28px; min-height: 28px; }
  }
  .operation-body { padding: 16px 20px 20px !important; }
  .operation-hero { padding: 0; margin-bottom: 16px; border: 0; background: transparent; gap: 16px; align-items: flex-start; }
  .operation-hero p { font-size: .75rem; line-height: 1.5; max-width: 70ch; }
  .originals-layout { grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); gap: 20px; align-items: start; }
  .originals-source { padding: 12px; margin-bottom: 16px; border-radius: 12px; }
  .originals-source strong { font-size: .8125rem; }
  .originals-source__text { gap: 4px; }
  .originals-action-picker { margin-bottom: 0; }
  .operation-section-heading { margin-bottom: 10px; }
  .operation-section-heading h3 { font-size: .75rem; font-weight: 600; }
  .originals-settings { padding: 16px; gap: 14px; border: 1px solid var(--operation-border); border-radius: 12px; background: rgba(var(--v-theme-on-surface), .02); }
  .originals-settings__heading { display: flex; align-items: center; gap: 8px; }
  .originals-settings__heading h3 { font-size: .8125rem; font-weight: 600; }
  .originals-settings :deep(.v-alert__content) { font-size: .75rem; line-height: 1.5; }
  .originals-submit { min-height: 34px; padding-inline: 14px; }
  .originals-history { padding: 14px; border: 1px solid var(--operation-border); border-radius: 12px; background: rgba(var(--v-theme-on-surface), .015); }
  .originals-history__hint { margin-bottom: 12px; }
  .operation-empty { min-height: 160px; padding: 20px 8px; }
  .operation-empty p { max-width: 28ch; }
  .operation-footer { padding: 9px 20px; }
}
.originals-workspace .originals-settings--delete {
  gap: 8px;
  padding: 12px;

  .originals-delete-source {
    margin-top: 4px;
    font-size: .6875rem;
    overflow-wrap: anywhere;
  }
  .v-checkbox :deep(.v-label) {
    font-size: .75rem;
    line-height: 1.4;
  }
  .originals-submit { min-height: 28px; padding-inline: 10px; }
}
@media (max-width: 700px) {
  .originals-workspace {
    .operation-body { padding: 12px !important; }
    .originals-layout { grid-template-columns: minmax(0, 1fr); gap: 16px; }
    .originals-history { padding: 12px; }
    .originals-settings { padding: 12px; }
    .operation-footer { padding-inline: 12px; }
  }
}
</style>
