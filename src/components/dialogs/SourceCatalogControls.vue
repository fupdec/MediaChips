<template>
  <v-expansion-panels class="catalog-controls mt-2 mb-4" variant="accordion">
    <v-expansion-panel elevation="0">
      <v-expansion-panel-title hide-actions v-slot="{expanded}">
        <v-icon size="16" class="catalog-controls__chevron" aria-hidden="true">{{ expanded ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
        <span>{{ t('sources.refresh.title') }}</span>
      </v-expansion-panel-title>
      <v-expansion-panel-text class="catalog-controls__body">
        <div class="catalog-controls__row catalog-controls__schedule">
          <v-btn color="primary" variant="tonal" size="x-small" prepend-icon="mdi-folder-sync-outline" :disabled="pending || !!running" @click="refresh">{{ t('sources.refresh.manual') }}</v-btn>
          <span class="catalog-controls__label">{{ t('sources.refresh.schedule') }}</span>
          <v-select v-model="interval" :items="intervals" :aria-label="t('sources.refresh.schedule')" :disabled="pending || !!running"
                    class="catalog-controls__interval" variant="outlined" rounded="pill" density="compact" hide-details single-line
                    :menu-props="{contentClass: 'media-detail-select-menu', maxHeight: 260}" :list-props="{density: 'compact', slim: true}" />
          <v-btn variant="text" size="x-small" :disabled="pending || !!running" @click="saveSchedule">{{ t('common.save') }}</v-btn>
          <v-icon size="14" class="catalog-controls__hint" :aria-label="t('sources.refresh.hint')" v-tooltip:top="t('sources.refresh.hint')" tabindex="0">mdi-information-outline</v-icon>
        </div>
        <div v-if="running" class="catalog-controls__running" role="status">
          <v-progress-linear indeterminate height="3" rounded color="primary" />
          <div class="catalog-controls__row">
            <span>{{ t('sources.refresh.running', {count: running.processed}) }}</span>
            <v-btn variant="text" size="x-small" :disabled="pending" @click="cancel">{{ t('common.cancel') }}</v-btn>
          </div>
        </div>
        <div v-if="error" class="catalog-controls__notice text-error" role="alert"><v-icon size="14" aria-hidden="true">mdi-alert-circle-outline</v-icon>{{ error }}</div>
        <div v-else-if="notice" class="catalog-controls__notice text-success" role="status"><v-icon size="14" aria-hidden="true">mdi-check-circle-outline</v-icon>{{ notice }}</div>
        <section v-for="root in roots" :key="root.id" class="catalog-controls__root">
          <div class="catalog-controls__row">
            <strong>{{ root.name || t('sources.refresh.folder') }}</strong>
            <span v-if="root.lastCompletedAt" class="catalog-controls__date">{{ t('sources.refresh.completed', {date: new Date(root.lastCompletedAt).toLocaleString()}) }}</span>
            <span v-if="root.nextRunAt" class="catalog-controls__date">{{ t('sources.refresh.next', {date: new Date(root.nextRunAt).toLocaleString()}) }}</span>
            <v-btn v-if="root.intervalMinutes" variant="text" size="x-small" :disabled="pending || !!running" @click="disableSchedule(root)">{{ t('sources.refresh.disable') }}</v-btn>
          </div>
          <div v-if="root.lastError" class="catalog-controls__root-error text-error" role="alert">{{ errorText(root.lastError) }}</div>
          <template v-if="root.lastResult">
            <p class="catalog-controls__result">{{ t('sources.refresh.result', root.lastResult) }}</p>
            <details v-if="root.lastResult.changes.length" class="catalog-controls__details">
              <summary>{{ t('sources.refresh.details') }}</summary>
              <ul>
                <li v-for="change in root.lastResult.changes" :key="change.kind + change.resourceKey">
                  {{ t('sources.refresh.' + change.kind) }}: {{ change.name }}
                </li>
              </ul>
              <p v-if="root.lastResult.truncated">{{ t('sources.refresh.truncated') }}</p>
            </details>
          </template>
        </section>
        <div class="catalog-controls__row catalog-controls__storage">
          <v-icon size="14" class="catalog-controls__storage-icon" aria-hidden="true">mdi-harddisk</v-icon>
          <span class="catalog-controls__label">{{ t('sources.offline.limit') }}</span>
          <v-text-field v-model.number="limitGiB" type="number" min="0" step="0.1" :aria-label="t('sources.offline.limit')"
                        class="catalog-controls__limit" variant="outlined" rounded="pill" density="compact" hide-details single-line :disabled="pending" />
          <v-btn variant="text" size="x-small" :disabled="pending || !Number.isFinite(limitGiB) || limitGiB < 0" @click="saveLimit">{{ t('common.save') }}</v-btn>
          <span class="catalog-controls__used">{{ t('sources.offline.used', {size: (usedBytes / 1024 ** 3).toFixed(2)}) }}</span>
          <v-icon size="14" class="catalog-controls__hint" :aria-label="t('sources.offline.storage_hint')" v-tooltip:top="t('sources.offline.storage_hint')" tabindex="0">mdi-information-outline</v-icon>
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


<style scoped lang="scss">
.catalog-controls {
  min-width: 0;
  font-size: .75rem;

  :deep(.v-expansion-panel) {
    overflow: hidden;
    border: 1px solid rgba(var(--v-theme-primary), .16);
    border-radius: 16px !important;
    background: rgba(var(--v-theme-primary), .03);
    box-shadow: 0 1px 0 rgba(var(--v-theme-primary), .04), 0 8px 22px -16px rgba(0, 0, 0, .22);
  }
  :deep(.v-expansion-panel-title) { justify-content: flex-start; min-height: 28px; padding: 6px 10px; gap: 6px; font-size: .75rem; font-weight: 500; line-height: 1.3; }
  .catalog-controls__body :deep(.v-expansion-panel-text__wrapper) { padding: 0; overflow-wrap: anywhere; border-top: 1px solid rgba(var(--v-theme-primary), .1); }
  :deep(.v-field) { font-size: .75rem; --v-field-padding-start: 10px; --v-field-padding-end: 6px; }
  :deep(.v-field__input) { min-height: 28px; padding-block: 3px; line-height: 20px; }
  :deep(.v-field__append-inner) { padding-top: 0; align-items: center; }
  :deep(.v-field__outline) { --v-field-border-opacity: .16; }
  :deep(.v-btn) { max-width: 100%; height: auto; min-height: 26px; padding-inline: 8px; font-size: .6875rem; letter-spacing: 0; text-transform: none; }
  :deep(.v-btn__content) { white-space: normal; }
  &__chevron, &__hint, &__storage-icon { flex-shrink: 0; opacity: .6; }
  &__row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; padding: 6px 12px; }
  &__label, &__date { font-size: .6875rem; color: rgba(var(--v-theme-on-surface), .6); }
  &__interval { flex: 0 1 200px; min-width: 100px; max-width: 100%; }
  &__interval :deep(.v-select__selection-text) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__running { font-size: .6875rem; }
  &__notice { display: flex; align-items: flex-start; gap: 5px; padding: 2px 12px 6px; font-size: .6875rem; line-height: 1.5; }
  &__notice .v-icon { margin-top: 1px; flex-shrink: 0; }
  &__root { border-top: 1px solid rgba(var(--v-theme-primary), .1); }
  &__root strong { font-weight: 500; overflow-wrap: anywhere; }
  &__root-error, &__result, &__details { padding: 0 12px 6px; font-size: .6875rem; line-height: 1.5; }
  &__details { color: rgba(var(--v-theme-on-surface), .65); }
  &__details summary { cursor: pointer; width: fit-content; }
  &__details ul { padding-left: 16px; margin-top: 4px; }
  &__storage { border-top: 1px solid rgba(var(--v-theme-primary), .1); }
  &__limit { flex: 0 1 90px; min-width: 70px; max-width: 100%; }
  &__used { padding: 2px 8px; border: 1px solid rgba(var(--v-theme-primary), .12); border-radius: 999px; background: rgba(var(--v-theme-surface), .92); font-size: .6875rem; color: rgba(var(--v-theme-on-surface), .65); }

  @media (max-width: 599px) {
    &__row { padding-inline: 10px; gap: 4px 6px; }
    &__schedule { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; }
    &__schedule > .v-btn:first-child, &__schedule > .catalog-controls__label { grid-column: 1 / -1; justify-self: start; }
    &__interval { width: 100%; }
  }
}
</style>
