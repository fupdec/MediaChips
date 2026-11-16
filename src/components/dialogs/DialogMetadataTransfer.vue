<template>
  <slot name="activator" :open="open" />
  <v-dialog class="metadata-transfer-dialog" :aria-label="t('metadata_transfer.title')" v-model="visible" max-width="860" :persistent="busy" scrollable>
    <v-card rounded="xl">
      <DialogHeader icon="swap-horizontal" :closable="!busy" :header="t('metadata_transfer.title')" @close="!busy && (visible = false)" />
      <v-card-text class="metadata-transfer__body">
        <div class="metadata-transfer__toolbar">
          <SettingsSegmentedControl
            v-model="tab"
            :label="t('metadata_transfer.title')"
            :disabled="busy"
            :items="[
              {value: 'import', title: t('metadata_transfer.import'), icon: 'mdi-import'},
              {value: 'export', title: t('metadata_transfer.export'), icon: 'mdi-export', disabled: !mediaIds.length},
              {value: 'sidecars', title: t('metadata_transfer.sidecars'), icon: 'mdi-file-document-outline', disabled: !mediaIds.length},
            ]"
            compact
          />
          <v-btn variant="text" color="primary" size="small" prepend-icon="mdi-help-circle-outline"
            @click="appShell.showDocumentation('settings.files.metadata_transfer')">{{ t('documentation.title') }}</v-btn>
        </div>
        <div class="metadata-transfer__content">
          <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>
          <v-alert v-if="success" type="success" variant="tonal" class="mb-4">{{ success }}</v-alert>
          <template v-if="tab === 'import'">
            <p class="mb-4">{{ t('metadata_transfer.import_hint') }}</p>
            <div class="d-flex flex-wrap align-center ga-2 mb-3">
              <v-btn variant="outlined" prepend-icon="mdi-folder-open-outline" :disabled="busy" @click="browse = true">{{ t('metadata_transfer.choose_file') }}</v-btn>
              <span v-if="fileName" class="metadata-transfer__filename">{{ fileName }}</span>
            </div>
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
                      <v-select v-else density="compact" variant="outlined" v-model="resolutions[conflict.key]" :items="resolutionOptions" :label="t('metadata_transfer.resolution')" :disabled="busy" />
                      <div v-for="field in changedFields(conflict)" :key="field" class="metadata-diff mb-4">
                        <strong>{{ field }}</strong>
                        <div class="metadata-diff__columns">
                          <div><span class="metadata-diff__label">{{ t('metadata_transfer.current') }}</span><pre>{{ display(conflict.current[field]) }}</pre></div>
                          <div><span class="metadata-diff__label">{{ t('metadata_transfer.incoming') }}</span><pre>{{ display(conflict.incoming[field]) }}</pre></div>
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
            <p class="metadata-transfer__note mb-3">{{ t('metadata_transfer.mapping_hint') }}</p>
            <div class="metadata-transfer__formats">
              <v-checkbox density="compact" color="primary" v-for="format in ['json', 'xmp', 'nfo']" :key="format" v-model="formats" :value="format" :label="format.toUpperCase()" hide-details :disabled="busy" />
            </div>
            <v-btn class="mt-3" variant="tonal" color="primary" prepend-icon="mdi-file-search-outline" :loading="busy" :disabled="!formats.length || !mediaIds.length" @click="previewSidecars">{{ t('metadata_transfer.preview_paths') }}</v-btn>
            <template v-if="sidecarPreview">
              <v-list lines="two" density="compact" max-height="300" class="metadata-transfer__paths mt-3 overflow-auto">
                <v-list-item v-for="file in sidecarPreview.files" :key="file.path" :title="file.path" :subtitle="file.exists ? t('metadata_transfer.file_exists') : t('metadata_transfer.new_file')" :prepend-icon="file.exists ? 'mdi-alert-circle' : 'mdi-file-plus-outline'" />
              </v-list>
              <v-btn class="mt-4" color="primary" :loading="busy" :disabled="sidecarPreview.files.some(f => f.exists)" @click="writeSidecars">{{ t('metadata_transfer.write_sidecars') }}</v-btn>
            </template>
          </template>
        </div>
      </v-card-text>
    </v-card>
    <DialogBrowseFolder v-model="browse" :file-extensions="['json']" :header="t('metadata_transfer.choose_file')"
      @confirm="chooseFile" />
  </v-dialog>
</template>
<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import DialogBrowseFolder from '@/components/dialogs/DialogBrowseFolder.vue'
import {useAppShell} from '@/composable/appShell'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import SettingsSegmentedControl from '@/components/ui/SettingsSegmentedControl.vue'
import {metadataTransferApi, type SidecarPreview} from '@/services/typedApi/metadataTransfer'
import type {MetadataBundle, MetadataPreview, MetadataConflict, MetadataResolution} from '@shared/metadataTransfer'
import {typedApi} from '@/services/typedApi'
import {useAppStore} from '@/stores/app'
import {reloadMediaTypesCatalog, reloadTagsCatalog} from '@/composable/appCatalogs'
import {useEventBus} from '@/utils/eventBus'
import {useItemsListSync} from '@/composable/itemsListSync'

const props = withDefaults(defineProps<{mediaIds?: number[]; modelValue?: boolean}>(), {mediaIds: () => []})
const emit = defineEmits<{'update:modelValue': [value: boolean]}>()
const {t} = useI18n()
const appShell = useAppShell()
const browse = ref(false), filePath = ref('')
const fileName = computed(() => filePath.value.split(/[\\/]/).pop())
const visible = ref(false), busy = ref(false), tab = ref('import'), error = ref(''), success = ref('')
const bundle = ref<MetadataBundle | null>(null), preview = ref<MetadataPreview | null>(null)
const resolutions = ref<Record<string, MetadataResolution>>({})
const formats = ref(['json']), sidecarPreview = ref<SidecarPreview | null>(null)
const canImport = computed(() => !!preview.value && preview.value.conflicts.every(c => !c.blocked && !!resolutions.value[c.key]))
const resolutionOptions = computed(() => [{title: t('metadata_transfer.keep'), value: 'keep'}, {title: t('metadata_transfer.replace'), value: 'replace'}])
watch(formats, () => { sidecarPreview.value = null }, {deep: true})
watch(() => props.mediaIds, () => { sidecarPreview.value = null }, {deep: true})
function open() { tab.value = props.mediaIds.length ? 'export' : 'import'; error.value = ''; success.value = ''; visible.value = true }
watch(() => props.modelValue, (value) => {
  if (value) open()
  else if (value === false) visible.value = false
}, {immediate: true})
watch(visible, (value) => {
  if (!value) browse.value = false
  emit('update:modelValue', value)
})
async function run(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true; error.value = ''; success.value = ''
  try { await action() } catch (err) {
    const e = err as {response?: {status?: number; data?: {message?: string}}; message?: string}
    error.value = e.response?.data?.message || e.message || t('metadata_transfer.failed')
    if (e.response?.status === 409) { preview.value = null; sidecarPreview.value = null }
  } finally { busy.value = false }
}
function chooseFile([path]: string[]) {
  if (!path || busy.value) return
  filePath.value = path
  bundle.value = null; preview.value = null; resolutions.value = {}
  void run(async () => {
    try {
      const {data} = await metadataTransferApi.previewFile(path)
      bundle.value = data.bundle; preview.value = data.preview
    } catch (err) {
      const response = (err as {response?: {status?: number; data?: {message?: string}}}).response
      if (response?.status === 413) throw new Error(t('metadata_transfer.too_large'), {cause: err})
      if (response?.data?.message === 'Invalid metadata document') throw new Error(t('metadata_transfer.invalid_format'), {cause: err})
      throw err
    }
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
.metadata-transfer-dialog .metadata-transfer__body {
  padding: 16px 20px 20px;
  font-size: .8125rem;
  line-height: 1.6;
}
.metadata-transfer__toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
.metadata-transfer__filename { overflow-wrap: anywhere; }
.metadata-transfer__content {
  margin-top: 16px;
  padding: 16px;
  border: 1px solid rgba(var(--v-theme-on-surface), .08);
  border-radius: 14px;
  background: rgba(var(--v-theme-on-surface), .025);
}
.metadata-transfer__content p {
  max-width: 76ch;
  font-size: .8125rem;
  line-height: 1.55;
  letter-spacing: normal;
}
.metadata-transfer__content .metadata-transfer__note {
  padding: 8px 12px;
  border-inline-start: 2px solid rgba(var(--v-theme-primary), .35);
  border-radius: 6px;
  background: rgba(var(--v-theme-primary), .04);
  color: rgba(var(--v-theme-on-surface), .72);
  font-size: .75rem;
}
.metadata-transfer__formats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.metadata-transfer__formats .v-checkbox {
  flex: 0 0 auto;
  padding-inline: 2px 10px;
  border: 1px solid rgba(var(--v-theme-on-surface), .12);
  border-radius: 8px;
  background: rgb(var(--v-theme-surface));
}
.metadata-transfer__paths {
  border: 1px solid rgba(var(--v-theme-on-surface), .12);
  border-radius: 8px;
}
.metadata-transfer__paths :deep(.v-list-item-title) {
  white-space: normal;
  overflow-wrap: anywhere;
}
.metadata-transfer__content :deep(.v-label),
.metadata-transfer__content :deep(.v-field__input),
.metadata-transfer__content :deep(.v-alert__content),
.metadata-transfer__content :deep(.v-expansion-panel-title),
.metadata-transfer__content :deep(.v-list-item-title) {
  font-size: .8125rem;
  letter-spacing: normal;
}
.metadata-transfer__paths :deep(.v-list-item-subtitle),
.metadata-diff__label { font-size: .75rem; }
.metadata-transfer__content :deep(.v-btn) {
  min-height: 34px;
  font-size: .8125rem;
  letter-spacing: normal;
  border-radius: 10px;
  box-shadow: none;
}
.metadata-transfer__content :deep(.v-input) { font-size: .8125rem; }
@media (max-width: 600px) {
  .metadata-transfer-dialog .metadata-transfer__body { padding: 16px; }
  .metadata-transfer__content { padding: 14px; margin-top: 12px; }
}

.metadata-diff__columns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.metadata-diff pre { white-space: pre-wrap; overflow-wrap: anywhere; font-size: .75rem; padding: 8px; background: rgba(var(--v-theme-on-surface), .05); border-radius: 6px; max-height: 220px; overflow: auto; }
@media (max-width: 600px) { .metadata-diff__columns { grid-template-columns: 1fr; } }
</style>
