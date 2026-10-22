<template>
  <slot name="activator" :open="open" />
  <v-dialog class="metadata-transfer-dialog" :aria-label="t('metadata_transfer.title')" v-model="visible" max-width="1000" :persistent="busy" scrollable>
    <v-card rounded="xl">
      <DialogHeader :closable="!busy" :header="t('metadata_transfer.title')" @close="!busy && (visible = false)" />
      <v-tabs v-model="tab" :disabled="busy">
        <v-tab value="import">{{ t('metadata_transfer.import') }}</v-tab>
        <v-tab value="export" :disabled="!mediaIds.length">{{ t('metadata_transfer.export') }}</v-tab>
        <v-tab value="sidecars" :disabled="!mediaIds.length">{{ t('metadata_transfer.sidecars') }}</v-tab>
      </v-tabs>
      <v-card-text>
        <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>
        <v-alert v-if="success" type="success" variant="tonal" class="mb-4">{{ success }}</v-alert>
        <template v-if="tab === 'import'">
          <p class="mb-4">{{ t('metadata_transfer.import_hint') }}</p>
          <v-file-input accept=".json,application/json" :label="t('metadata_transfer.choose_file')" :disabled="busy" @update:model-value="chooseFile" />
          <v-btn v-if="bundle && !preview" class="mb-4" :loading="busy" @click="refreshPreview">{{ t('metadata_transfer.refresh_preview') }}</v-btn>
          <template v-if="preview">
            <p class="mb-4">{{ t('metadata_transfer.summary', preview.counts) }}</p>
            <v-alert v-if="!preview.conflicts.length" type="info" variant="tonal">{{ t('metadata_transfer.no_conflicts') }}</v-alert>
            <template v-else>
              <p>{{ t('metadata_transfer.conflicts', {count: preview.conflicts.length}) }}</p>
              <div class="d-flex flex-wrap ga-2 my-3">
                <v-btn size="small" :disabled="busy" @click="resolveAll('keep')">{{ t('metadata_transfer.keep_all') }}</v-btn>
                <v-btn size="small" :disabled="busy" @click="resolveAll('replace')">{{ t('metadata_transfer.replace_all') }}</v-btn>
              </div>
              <v-expansion-panels multiple>
                <v-expansion-panel v-for="conflict in preview.conflicts" :key="conflict.key">
                  <v-expansion-panel-title>
                    <v-icon v-if="conflict.blocked" color="error" class="mr-2">mdi-alert-circle</v-icon>
                    {{ conflict.name }} · {{ conflict.entity }}
                  </v-expansion-panel-title>
                  <v-expansion-panel-text>
                    <v-alert v-if="conflict.blocked" type="error" variant="tonal" class="mb-3">{{ t('metadata_transfer.blocked') }}</v-alert>
                    <v-select v-else v-model="resolutions[conflict.key]" :items="resolutionOptions" :label="t('metadata_transfer.resolution')" :disabled="busy" />
                    <div v-for="field in changedFields(conflict)" :key="field" class="metadata-diff mb-4">
                      <strong>{{ field }}</strong>
                      <div class="metadata-diff__columns">
                        <div><span class="text-caption">{{ t('metadata_transfer.current') }}</span><pre>{{ display(conflict.current[field]) }}</pre></div>
                        <div><span class="text-caption">{{ t('metadata_transfer.incoming') }}</span><pre>{{ display(conflict.incoming[field]) }}</pre></div>
                      </div>
                    </div>
                  </v-expansion-panel-text>
                </v-expansion-panel>
              </v-expansion-panels>
            </template>
            <v-btn class="mt-4" color="primary" :loading="busy" :disabled="!canImport" @click="applyImport">{{ t('metadata_transfer.apply') }}</v-btn>
          </template>
        </template>
        <template v-else-if="tab === 'export'">
          <p class="mb-4">{{ t('metadata_transfer.export_hint', {count: mediaIds.length}) }}</p>
          <v-btn color="primary" prepend-icon="mdi-download" :loading="busy" :disabled="!mediaIds.length" @click="download">{{ t('metadata_transfer.download') }}</v-btn>
        </template>
        <template v-else>
          <p class="mb-3">{{ t('metadata_transfer.sidecars_hint') }}</p>
          <p class="text-caption mb-3">{{ t('metadata_transfer.mapping_hint') }}</p>
          <v-checkbox v-for="format in ['json', 'xmp', 'nfo']" :key="format" v-model="formats" :value="format" :label="format.toUpperCase()" hide-details :disabled="busy" />
          <v-btn class="my-4" :loading="busy" :disabled="!formats.length || !mediaIds.length" @click="previewSidecars">{{ t('metadata_transfer.preview_paths') }}</v-btn>
          <template v-if="sidecarPreview">
            <v-list lines="two" max-height="300" class="overflow-auto">
              <v-list-item v-for="file in sidecarPreview.files" :key="file.path" :title="file.path" :subtitle="file.exists ? t('metadata_transfer.file_exists') : t('metadata_transfer.new_file')" :prepend-icon="file.exists ? 'mdi-alert-circle' : 'mdi-file-plus-outline'" />
            </v-list>
            <v-btn class="mt-4" color="primary" :loading="busy" :disabled="sidecarPreview.files.some(f => f.exists)" @click="writeSidecars">{{ t('metadata_transfer.write_sidecars') }}</v-btn>
          </template>
        </template>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>
<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import {metadataTransferApi, type SidecarPreview} from '@/services/typedApi/metadataTransfer'
import {MetadataBundleSchema, type MetadataBundle, type MetadataPreview, type MetadataConflict, type MetadataResolution} from '@shared/metadataTransfer'
import {typedApi} from '@/services/typedApi'
import {useAppStore} from '@/stores/app'
import {reloadMediaTypesCatalog, reloadTagsCatalog} from '@/composable/appCatalogs'
import {useEventBus} from '@/utils/eventBus'
import {useItemsListSync} from '@/composable/itemsListSync'

const props = withDefaults(defineProps<{mediaIds?: number[]}>(), {mediaIds: () => []})
const {t} = useI18n()
const visible = ref(false), busy = ref(false), tab = ref('import'), error = ref(''), success = ref('')
const bundle = ref<MetadataBundle | null>(null), preview = ref<MetadataPreview | null>(null)
const resolutions = ref<Record<string, MetadataResolution>>({})
const formats = ref(['json']), sidecarPreview = ref<SidecarPreview | null>(null)
const canImport = computed(() => !!preview.value && preview.value.conflicts.every(c => !c.blocked && !!resolutions.value[c.key]))
const resolutionOptions = computed(() => [{title: t('metadata_transfer.keep'), value: 'keep'}, {title: t('metadata_transfer.replace'), value: 'replace'}])
watch(formats, () => { sidecarPreview.value = null }, {deep: true})
watch(() => props.mediaIds, () => { sidecarPreview.value = null }, {deep: true})
function open() { tab.value = props.mediaIds.length ? 'export' : 'import'; error.value = ''; success.value = ''; visible.value = true }
async function run(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true; error.value = ''; success.value = ''
  try { await action() } catch (err) {
    const e = err as {response?: {status?: number; data?: {message?: string}}; message?: string}
    error.value = e.response?.data?.message || e.message || t('metadata_transfer.failed')
    if (e.response?.status === 409) { preview.value = null; sidecarPreview.value = null }
  } finally { busy.value = false }
}
function chooseFile(input: File | File[] | null) {
  bundle.value = null; preview.value = null; resolutions.value = {}; success.value = ''
  const file = Array.isArray(input) ? input[0] : input
  if (!file) return
  void run(async () => {
    if (file.size > 50 * 1024 * 1024) throw new Error(t('metadata_transfer.too_large'))
    let input: unknown
    try { input = JSON.parse(await file.text()) } catch { throw new Error(t('metadata_transfer.invalid_format')) }
    const validated = MetadataBundleSchema.safeParse(input)
    if (!validated.success) throw new Error(t('metadata_transfer.invalid_format'))
    const parsed = validated.data
    const result = await metadataTransferApi.preview(parsed)
    bundle.value = parsed; preview.value = result.data
  })
}
function refreshPreview() {
  if (!bundle.value) return
  const document = bundle.value
  void run(async () => { resolutions.value = {}; preview.value = (await metadataTransferApi.preview(document)).data })
}
function resolveAll(value: MetadataResolution) {
  for (const c of preview.value?.conflicts ?? []) if (!c.blocked) resolutions.value[c.key] = value
}
const display = (value: unknown) => JSON.stringify(value, null, 2) ?? '—'
const changedFields = (c: MetadataConflict) => [...new Set([...Object.keys(c.current), ...Object.keys(c.incoming)])].filter(k => display(c.current[k]) !== display(c.incoming[k]))
function applyImport() {
  if (!canImport.value || !bundle.value || !preview.value) return
  const document = bundle.value, token = preview.value.token
  void run(async () => {
    await metadataTransferApi.import(document, token, {...resolutions.value})
    preview.value = null; bundle.value = null
    success.value = t('metadata_transfer.import_done')
    const app = useAppStore()
    try {
      app.meta = (await typedApi.getMeta()).data
      await Promise.all([reloadMediaTypesCatalog(), reloadTagsCatalog()])
      useItemsListSync().getItemsFromDb({type: 'media'})
      useEventBus().emit('markers:reload')
    } catch { error.value = t('metadata_transfer.refresh_failed') }
  })
}
function download() {
  void run(async () => {
    const {data} = await metadataTransferApi.export([...props.mediaIds])
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}))
    const link = document.createElement('a'); link.href = url; link.download = 'metadata.mediachips.json'; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    success.value = t('metadata_transfer.export_done')
  })
}
function previewSidecars() {
  void run(async () => { sidecarPreview.value = (await metadataTransferApi.sidecars([...props.mediaIds], [...formats.value])).data })
}
function writeSidecars() {
  if (!sidecarPreview.value) return
  const token = sidecarPreview.value.token
  void run(async () => {
    await metadataTransferApi.sidecars([...props.mediaIds], [...formats.value], token)
    sidecarPreview.value = null; success.value = t('metadata_transfer.sidecars_done')
  })
}
</script>
<style scoped>
.metadata-diff__columns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.metadata-diff pre { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; padding: 8px; background: rgba(var(--v-theme-on-surface), .05); border-radius: 6px; max-height: 220px; overflow: auto; }
@media (max-width: 600px) { .metadata-diff__columns { grid-template-columns: 1fr; } }
</style>
