<template>
  <div class="mt-2">
    <div class="d-flex flex-wrap align-center ga-2">
      <v-chip v-if="status?.state !== 'absent' && status" size="small" :color="status.state === 'ready' ? 'success' : 'warning'">
        {{ t('sources.offline.' + status.state) }} · {{ (status.size / 1024 ** 2).toFixed(1) }} MB
      </v-chip>
      <v-btn size="small" variant="tonal" prepend-icon="mdi-download" :loading="pending" :disabled="pending || !!job" @click="save">
        {{ t(status?.state === 'ready' ? 'sources.offline.verify' : 'sources.offline.save') }}
      </v-btn>
      <v-btn v-if="status && status.state !== 'absent'" size="small" variant="text" :disabled="pending || !!job" @click="remove">{{ t('sources.offline.remove') }}</v-btn>
      <v-btn v-if="job" size="small" variant="text" :disabled="pending" @click="cancel">{{ t('common.cancel') }}</v-btn>
    </div>
    <div v-if="job" class="mt-2 text-caption" role="status">
      <v-progress-linear :model-value="status?.size ? Math.min(100, job.processed / status.size * 100) : 0" :indeterminate="!status?.size" />
      {{ t('sources.offline.downloading', {size: (job.processed / 1024 ** 2).toFixed(1)}) }}
    </div>
    <div v-if="status?.state === 'ready'" class="text-caption text-medium-emphasis mt-1">{{ t('sources.offline.verified_hint') }}</div>
    <div v-if="error" class="text-error text-caption mt-1" role="alert">{{ error }}</div>
    <div v-if="notice" class="text-caption mt-1" role="status">{{ notice }}</div>
  </div>
</template>
<script setup lang="ts">
import {onBeforeUnmount, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {sourceCatalogApi as api} from '@/services/typedApi/sourceCatalog'
import type {OfflineStatus, SourceJob} from '@shared/sourceCatalog'
const props = defineProps<{mediaId: number}>()
const {t, te} = useI18n()
const app = useAppStore()
const status = ref<OfflineStatus>()
const job = ref<SourceJob>()
const pending = ref(false)
const error = ref('')
const notice = ref('')
let generation = 0
let timer: ReturnType<typeof setTimeout> | undefined
const errorText = (code?: string) => code && te(`sources.update_errors.${code}`) ? t(`sources.update_errors.${code}`) : t('sources.update_errors.failed')
async function load(current: number) {
  const [copy, jobs] = await Promise.all([api.offline(props.mediaId), api.jobs()])
  if (current !== generation) return
  status.value = copy.data
  job.value = jobs.data.find(row => row.kind === 'offline' && row.targetId === String(props.mediaId) && row.state === 'running')
  if (job.value) poll(current)
}
function poll(current: number) {
  clearTimeout(timer)
  timer = setTimeout(async () => {
    if (!job.value || current !== generation) return
    try {
      const {data} = await api.job(job.value.id)
      if (current !== generation) return
      if (data.state === 'running') { job.value = data; poll(current); return }
      job.value = undefined
      if (data.state === 'failed') error.value = errorText(data.error)
      else notice.value = t(data.state === 'completed' ? 'sources.offline.saved' : 'sources.refresh.cancelled')
      await load(current)
    } catch { if (current === generation) { error.value = errorText(); poll(current) } }
  }, 1500)
}
async function action(run: (current: number) => Promise<void>) {
  const current = generation
  pending.value = true; error.value = ''; notice.value = ''
  try { await run(current) } catch (err) {
    if (current === generation) error.value = errorText((err as {response?: {data?: {code?: string}}})?.response?.data?.code)
  } finally { if (current === generation) pending.value = false }
}
const save = () => action(async current => { const {data} = await api.saveOffline(props.mediaId); if (current === generation) { job.value = data; poll(current) } })
const remove = () => action(async current => { await api.removeOffline(props.mediaId); await load(current) })
const cancel = () => action(async () => { if (job.value) await api.cancel(job.value.id) })
watch([() => props.mediaId, () => app.dbPath, () => app.localhost], async () => {
  const current = ++generation
  clearTimeout(timer); status.value = undefined; job.value = undefined; pending.value = false; error.value = ''; notice.value = ''
  try { await load(current) } catch { if (current === generation) error.value = errorText() }
}, {immediate: true})
onBeforeUnmount(() => { generation++; clearTimeout(timer) })
</script>
