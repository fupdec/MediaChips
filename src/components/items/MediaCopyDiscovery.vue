<template>
  <section class="copy-discovery" data-testid="copy-discovery">
    <h3 v-if="showHeading" class="text-subtitle-2 mb-2">{{ t('copyDiscovery.title') }}</h3>
    <p v-if="showHeading" class="text-caption mb-3">{{ t('copyDiscovery.hint') }}</p>
    <v-textarea v-model="rootsText" :label="t('copyDiscovery.folders')" :hint="t('copyDiscovery.folders_hint')"
      persistent-hint rows="2" variant="outlined" density="compact" :disabled="pending" />
    <v-btn class="my-3" variant="tonal" color="primary" :disabled="!rootsText.trim() || pending" :loading="pending" @click="start">
      {{ t('copyDiscovery.start') }}
    </v-btn>
    <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-3" role="alert">{{ error }}</v-alert>
    <div v-if="collapseHistory && jobs.length" class="mb-3" data-testid="copy-discovery-summary">
      <p class="text-caption font-weight-medium">{{ t('copyDiscovery.summary', {count: jobs.length}) }}</p>
      <p class="text-caption" role="status">{{ t('copyDiscovery.progress', totals) }}</p>
    </div>
    <v-btn v-if="collapseHistory && jobs.some(job => !active(job))" size="small" variant="text"
      class="mb-2" :disabled="pending" data-testid="copy-discovery-clear-history" @click="clearHistory">
      {{ t('copyDiscovery.clear_history') }}
    </v-btn>
    <component v-for="group in jobGroups" :key="group.id" :is="group.history ? 'details' : 'div'" class="copy-discovery__group">
      <summary v-if="group.history" class="text-caption">{{ t('copyDiscovery.history', {count: group.jobs.length}) }}</summary>
      <div :class="{'copy-discovery__history': group.history}">
        <div v-for="job in group.jobs" :key="job.id" class="copy-discovery__job">
          <div class="d-flex align-center flex-wrap ga-2">
            <strong>{{ t('copyDiscovery.states.' + job.state) }}</strong>
            <span v-if="job.triggers?.length" class="text-caption">{{ job.triggers.map(trigger => t('copyDiscovery.triggers.' + trigger)).join(' · ') }}</span>
            <span class="text-caption">{{ job.method === 'sha256' ? 'SHA-256' : 'oshash' }}</span>
            <v-btn v-if="active(job)" size="small" variant="text" :disabled="pending" @click="run(() => api.cancel(job.id))">{{ t('copyDiscovery.cancel') }}</v-btn>
            <v-btn v-else-if="job.state !== 'completed' || job.counts.failed" size="small" variant="text" :disabled="pending" @click="run(() => api.retry(job.id))">{{ t('copyDiscovery.retry') }}</v-btn>
          </div>
          <p class="text-caption copy-discovery__roots">{{ job.roots.map(root => root.key).join(' · ') }}</p>
          <p class="text-caption my-1" role="status">{{ t('copyDiscovery.progress', {total: job.total, attached: job.counts.attached || 0, pending: (job.counts.candidate || 0) + (job.counts.checking || 0), ambiguous: job.counts.ambiguous || 0, failed: job.counts.failed || 0}) }}</p>
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
      </div>
    </component>
  </section>
</template>

<script setup lang="ts">
import {computed, ref, onMounted, onBeforeUnmount, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {copyDiscoveryApi as api} from '@/services/typedApi/copyDiscovery'
import type {CopyDiscoveryJob, CopyDiscoveryInput} from '@shared/copyDiscovery'
const props = withDefaults(defineProps<{mediaId?: number; showHeading?: boolean; showResults?: boolean; collapseHistory?: boolean}>(), {
  showHeading: true,
  showResults: true,
  collapseHistory: false,
})
const emit = defineEmits<{changed: []}>()
const {t, te} = useI18n()
const app = useAppStore()
const rootsText = ref('')
const jobs = ref<CopyDiscoveryJob[]>([])
const error = ref('')
const pending = ref(false)
let generation = 0
let stopped = false
let timer: ReturnType<typeof setTimeout> | undefined
const active = (job: CopyDiscoveryJob) => ['queued', 'discovering', 'verifying'].includes(job.state)
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
    if (current === generation && !stopped) timer = setTimeout(() => { void load() }, 2000)
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
  const current = generation
  pending.value = true; error.value = ''
  try {
    const result = await action()
    if (current !== generation || stopped) return
    jobs.value = [result.data, ...jobs.value.filter(job => job.id !== result.data.id)]
    emit('changed')
  } catch (err) { if (current === generation && !stopped) showError(err) }
  finally { if (current === generation) pending.value = false }
}
function start() {
  void run(() => {
  const roots: CopyDiscoveryInput['roots'] = rootsText.value.split('\n').map(value => value.trim()).filter(Boolean).map(key => {
    const nas = /^nas:\/\/([0-9a-f-]{36})\/(.*)$/i.exec(key)
    if (nas) return {connectionId: nas[1], key: nas[2].split('/').map(decodeURIComponent).join('/')}
    if (key.startsWith('gdrive://')) return {connectionId: 'google-drive', key: key.slice(9)}
    return {key}
  })
  return api.create({roots, ...(props.mediaId ? {mediaId: props.mediaId} : {})})
  })
}
onMounted(() => { void load() })
onBeforeUnmount(() => { stopped = true; generation++; clearTimeout(timer) })
watch([() => app.dbPath, () => app.localhost, () => props.mediaId], () => {
  generation++; clearTimeout(timer); jobs.value = []; pending.value = false; error.value = ''; rootsText.value = ''
  void load()
})
</script>

<style scoped>
.copy-discovery { margin-block: 16px; }
.copy-discovery__history { max-height: 320px; overflow: auto; }
.copy-discovery__group > summary { cursor: pointer; }
.copy-discovery__job { padding-block: 12px; border-top: 1px solid rgba(var(--v-theme-on-surface), .12); }
.copy-discovery__results { list-style: none; padding: 0; max-height: 320px; overflow: auto; }
.copy-discovery__results li { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; padding-block: 6px; }
.copy-discovery__path { flex: 1 1 240px; overflow-wrap: anywhere; font-size: 12px; }
.copy-discovery__roots { overflow-wrap: anywhere; opacity: .7; }
</style>
