<template>
  <v-expansion-panels class="catalog-controls my-3" variant="accordion">
    <v-expansion-panel :title="t('sources.refresh.title')">
      <v-expansion-panel-text>
        <p class="text-body-2 mb-3">{{ t('sources.refresh.hint') }}</p>
        <div class="d-flex flex-wrap align-center ga-3">
          <v-btn prepend-icon="mdi-folder-sync-outline" :disabled="pending || !!running" @click="refresh">{{ t('sources.refresh.manual') }}</v-btn>
          <v-select v-model="interval" :items="intervals" :label="t('sources.refresh.schedule')" :disabled="pending || !!running"
                    style="flex: 1 1 180px; min-width: 0; max-width: 100%" density="compact" hide-details />
          <v-btn variant="text" :disabled="pending || !!running" @click="saveSchedule">{{ t('common.save') }}</v-btn>
        </div>
        <div v-if="running" class="mt-3" role="status">
          <v-progress-linear indeterminate class="mb-2" />
          {{ t('sources.refresh.running', {count: running.processed}) }}
          <v-btn variant="text" size="small" :disabled="pending" @click="cancel">{{ t('common.cancel') }}</v-btn>
        </div>
        <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mt-3" role="alert">{{ error }}</v-alert>
        <v-alert v-else-if="notice" type="success" variant="tonal" density="compact" class="mt-3" role="status">{{ notice }}</v-alert>
        <div v-for="root in roots" :key="root.id" class="mt-4">
          <div class="d-flex flex-wrap align-center ga-2">
            <strong>{{ root.name || t('sources.refresh.folder') }}</strong>
            <span v-if="root.lastCompletedAt" class="text-caption">{{ t('sources.refresh.completed', {date: new Date(root.lastCompletedAt).toLocaleString()}) }}</span>
            <span v-if="root.nextRunAt" class="text-caption">{{ t('sources.refresh.next', {date: new Date(root.nextRunAt).toLocaleString()}) }}</span>
            <v-btn v-if="root.intervalMinutes" variant="text" size="small" :disabled="pending || !!running" @click="disableSchedule(root)">{{ t('sources.refresh.disable') }}</v-btn>
          </div>
          <div v-if="root.lastError" class="text-error text-caption">{{ errorText(root.lastError) }}</div>
          <template v-if="root.lastResult">
            <p class="text-body-2">{{ t('sources.refresh.result', root.lastResult) }}</p>
            <details v-if="root.lastResult.changes.length">
              <summary>{{ t('sources.refresh.details') }}</summary>
              <ul class="pl-5 text-body-2">
                <li v-for="change in root.lastResult.changes" :key="change.kind + change.resourceKey">
                  {{ t('sources.refresh.' + change.kind) }}: {{ change.name }}
                </li>
              </ul>
              <p v-if="root.lastResult.truncated" class="text-caption">{{ t('sources.refresh.truncated') }}</p>
            </details>
          </template>
        </div>
        <v-divider class="my-4" />
        <p class="text-body-2 mb-3">{{ t('sources.offline.storage_hint') }}</p>
        <div class="d-flex flex-wrap align-center ga-3">
          <v-text-field v-model.number="limitGiB" type="number" min="0" step="0.1" :label="t('sources.offline.limit')"
                        density="compact" hide-details style="flex: 1 1 150px; min-width: 0; max-width: 200px" :disabled="pending" />
          <v-btn variant="text" :disabled="pending || !Number.isFinite(limitGiB) || limitGiB < 0" @click="saveLimit">{{ t('common.save') }}</v-btn>
          <span class="text-caption">{{ t('sources.offline.used', {size: (usedBytes / 1024 ** 3).toFixed(2)}) }}</span>
        </div>
      </v-expansion-panel-text>
    </v-expansion-panel>
  </v-expansion-panels>
</template>
<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {sourceCatalogApi as api} from '@/services/typedApi/sourceCatalog'
import type {CatalogRoot, SourceJob} from '@shared/sourceCatalog'
import {useAppStore} from '@/stores/app'
const props = defineProps<{connectionId: string; rootKey: string; name: string}>()
const emit = defineEmits<{updated: []}>()
const app = useAppStore()
const {t, te} = useI18n()
const roots = ref<CatalogRoot[]>([])
const interval = ref(0)
const running = ref<SourceJob>()
const pending = ref(false)
const error = ref('')
const notice = ref('')
const limitGiB = ref(5)
const usedBytes = ref(0)
const intervals = computed(() => [0, 60, 1440, 10080].map(value => ({value, title: t(`sources.refresh.intervals.${value}`)})))
let generation = 0
let timer: ReturnType<typeof setTimeout> | undefined
const errorText = (code: string) => te(`sources.update_errors.${code}`) ? t(`sources.update_errors.${code}`) : t('sources.update_errors.failed')
const failure = (err: unknown) => errorText((err as {response?: {data?: {code?: string}}})?.response?.data?.code || 'failed')
async function load(current = generation) {
  const [catalog, cache, jobs] = await Promise.all([api.roots(), api.cache(), api.jobs()])
  if (current !== generation) return
  roots.value = catalog.data.filter(root => root.connectionId === props.connectionId)
  interval.value = roots.value.find(root => root.rootKey === props.rootKey)?.intervalMinutes || 0
  limitGiB.value = cache.data.limitBytes / 1024 ** 3
  usedBytes.value = cache.data.usedBytes
  running.value = jobs.data.find(job => job.kind === 'catalog' && job.state === 'running' && roots.value.some(root => root.id === job.targetId))
  if (running.value) poll(current)
}
function poll(current: number) {
  clearTimeout(timer)
  timer = setTimeout(async () => {
    if (!running.value || current !== generation) return
    try {
      const {data} = await api.job(running.value.id)
      if (current !== generation) return
      if (data.state === 'running') { running.value = data; poll(current); return }
      running.value = undefined
      if (data.state === 'failed') error.value = errorText(data.error || 'failed')
      if (data.state === 'cancelled') notice.value = t('sources.refresh.cancelled')
      if (data.state === 'completed') { notice.value = t('sources.refresh.result', data.result!); emit('updated') }
      await load(current)
    } catch (err) { if (current === generation) { error.value = failure(err); poll(current) } }
  }, 1500)
}
async function action(run: () => Promise<void>) {
  const current = generation
  pending.value = true; error.value = ''; notice.value = ''
  try { await run() } catch (err) { if (current === generation) error.value = failure(err) }
  finally { if (current === generation) pending.value = false }
}
const input = () => ({connectionId: props.connectionId, rootKey: props.rootKey, name: props.name.slice(0, 256), intervalMinutes: interval.value})
async function refresh() {
  const current = generation
  await action(async () => {
    const {data: root} = await api.saveRoot(input())
    if (current !== generation) return
    const {data} = await api.refresh(root.id)
    if (current !== generation) return
    roots.value = [...roots.value.filter(row => row.id !== root.id), root]
    running.value = data; poll(current)
  })
}
async function saveSchedule() { const current = generation; await action(async () => { await api.saveRoot(input()); await load(current); if (current === generation) notice.value = t('sources.refresh.saved') }) }
async function disableSchedule(root: CatalogRoot) {
  const current = generation
  await action(async () => { await api.saveRoot({connectionId: root.connectionId, rootKey: root.rootKey, name: root.name, intervalMinutes: 0}); await load(current) })
}
async function saveLimit() { const current = generation; await action(async () => { await api.setLimit(Math.round(limitGiB.value * 1024 ** 3)); await load(current) }) }
async function cancel() { const id = running.value?.id; if (id) await action(async () => { await api.cancel(id) }) }
watch([() => props.connectionId, () => props.rootKey, () => app.dbPath, () => app.localhost], async () => {
  const current = ++generation
  clearTimeout(timer); roots.value = []; running.value = undefined; pending.value = false; error.value = ''; notice.value = ''
  try { await load(current) } catch (err) { if (current === generation) error.value = failure(err) }
}, {immediate: true})
onBeforeUnmount(() => { generation++; clearTimeout(timer) })
</script>

<style scoped>
.catalog-controls { min-width: 0; }
.catalog-controls :deep(.v-expansion-panel-text__wrapper) { overflow-wrap: anywhere; }
.catalog-controls :deep(.v-btn) { max-width: 100%; height: auto; min-height: 36px; white-space: normal; }
.catalog-controls :deep(.v-btn__content) { white-space: normal; }
</style>
