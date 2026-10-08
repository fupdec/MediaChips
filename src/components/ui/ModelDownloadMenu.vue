<template>
  <v-menu v-model="menuOpen" :close-on-content-click="false" location="bottom end" :offset="8" max-width="480">
    <template #activator="{props: menuProps}">
      <v-btn-group class="model-download-menu" :class="{'model-download-menu--default': size === 'default'}" rounded="pill" variant="flat" color="primary" density="compact">
        <slot :importing="importing"/>
        <v-btn v-bind="menuProps" icon="mdi-chevron-down" class="model-download-menu__toggle" :size="size"
          color="primary" variant="tonal" :disabled="disabled || importing" :loading="importing"
          :aria-label="t('ai.models.manual_options')"/>
      </v-btn-group>
    </template>
    <v-card class="model-download-panel" color="surface" rounded="xl" elevation="8">
      <div class="model-download-panel__models">
        <section v-for="kind in kinds" :key="kind" class="model-download-panel__model">
          <div class="model-download-panel__heading">
            <div class="model-download-panel__icon">
              <v-icon :icon="modelIcons[kind]" size="20"/>
            </div>
            <div class="text-body-2 font-weight-bold">{{ t('ai.models.' + kind) }}</div>
            <span class="model-download-panel__format">{{ kind === 'clip' ? 'ZIP' : kind === 'localAi' ? 'GGUF' : 'ONNX' }}</span>
          </div>
          <div class="model-download-panel__files">
            <span v-for="file in MANUAL_MODELS[kind].files" :key="file" class="model-download-panel__file">{{ file }}</span>
          </div>
          <div class="model-download-panel__actions">
            <v-btn prepend-icon="mdi-open-in-new" variant="text" color="primary" size="small" rounded="lg"
              :href="MANUAL_MODELS[kind].url" target="_blank" rel="noopener noreferrer">{{ t('ai.models.download_browser') }}</v-btn>
            <v-btn prepend-icon="mdi-file-import-outline" variant="tonal" color="primary" size="small" rounded="lg"
              :disabled="importing || disabled" @click="selectFile(kind)">{{ t('ai.models.import_file') }}</v-btn>
          </div>
        </section>
      </div>
      <div class="model-download-panel__hint">
        <v-icon icon="mdi-information-outline" size="18"/>
        <span>{{ t('ai.models.manual_hint') }}</span>
      </div>
    </v-card>
  </v-menu>
  <DialogBrowseFolder
    v-model="pickerOpen"
    :header="t('ai.models.import_file') + ' — ' + t('ai.models.' + selectedKind)"
    :confirm-text="t('ai.models.import_file')"
    :file-extensions="fileExtensions"
    @confirm="importSelectedFile"
  />
</template>
<script setup lang="ts">
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {MANUAL_MODELS, type ManualModelKind} from '@shared/manualModels'
import DialogBrowseFolder from '@/components/dialogs/DialogBrowseFolder.vue'
import {apiClient} from '@/services/apiClient'
import {setNotification} from '@/services/notificationService'
import {modelDownloadError} from '@/services/manualModels'
const modelIcons: Record<ManualModelKind, string> = {
  localAi: 'mdi-robot-outline', clip: 'mdi-image-search-outline',
  faceDetect: 'mdi-face-recognition', faceEmbed: 'mdi-account-search-outline',
  faceAlign: 'mdi-face-man', faceGender: 'mdi-account-outline',
}
const props = withDefaults(defineProps<{kinds: ManualModelKind[]; disabled?: boolean; size?: 'small' | 'default'}>(), {size: 'small'})
const emit = defineEmits<{installed: []}>()
const {t} = useI18n()
const importing = ref(false)
const menuOpen = ref(false)
const pickerOpen = ref(false)
const selectedKind = ref<ManualModelKind>(props.kinds[0])
const fileExtensions = computed(() => selectedKind.value === 'clip'
  ? ['zip'] : selectedKind.value === 'localAi' ? ['gguf', 'zip'] : ['onnx', 'zip'])
function selectFile(kind: ManualModelKind) {
  if (importing.value || props.disabled) return
  selectedKind.value = kind
  menuOpen.value = false
  pickerOpen.value = true
}
async function importSelectedFile(paths: string[]) {
  if (paths.length !== 1 || importing.value || props.disabled) return
  const kind = selectedKind.value
  pickerOpen.value = false
  importing.value = true
  try {
    await apiClient.post('/api/Task/importModel', {path: paths[0]}, {
      params: {kind}, timeout: 0,
    })
    emit('installed')
    setNotification({type: 'success', text: t('ai.models.import_done')})
  } catch (error: any) {
    modelDownloadError(kind, new Error(error.response?.data?.message || error.message), t)
  } finally { importing.value = false }
}
</script>

<style scoped>
.model-download-menu { height: 32px; }
.model-download-menu :deep(.v-btn) {
  height: 100%;
  border-radius: 0 !important;
}
.model-download-menu :deep(.model-download-menu__toggle) {
  width: 32px;
  min-width: 32px;
}
.model-download-menu--default { height: 36px; }
.model-download-menu--default :deep(.model-download-menu__toggle) {
  width: 36px;
  min-width: 36px;
}
.model-download-panel {
  width: min(480px, calc(100vw - 24px));
  color: rgb(var(--v-theme-on-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}
.model-download-panel__models { max-height: min(60vh, 540px); overflow-y: auto; }
.model-download-panel__model { padding: 16px; }
.model-download-panel__model + .model-download-panel__model {
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}
.model-download-panel__heading { display: flex; align-items: center; gap: 10px; }
.model-download-panel__icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: rgba(var(--v-theme-primary), 0.08);
  color: rgb(var(--v-theme-primary));
}
.model-download-panel__format {
  margin-left: auto;
  padding: 3px 7px;
  border-radius: 6px;
  background: rgba(var(--v-theme-on-surface), 0.05);
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
}
.model-download-panel__files { display: flex; flex-wrap: wrap; gap: 5px; margin: 12px 0; }
.model-download-panel__file {
  padding: 4px 7px;
  border-radius: 6px;
  background: rgba(var(--v-theme-on-surface), 0.04);
  color: rgba(var(--v-theme-on-surface), 0.65);
  font-family: monospace;
  font-size: 11px;
  line-height: 1.5;
  overflow-wrap: anywhere;
  max-width: 100%;
}
.model-download-panel__actions { display: flex; flex-wrap: wrap; gap: 6px; }
.model-download-panel__hint {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 12px 16px;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background: rgba(var(--v-theme-on-surface), 0.025);
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 12px;
  line-height: 1.6;
}
.model-download-panel__hint .v-icon { flex-shrink: 0; margin-top: 2px; }
</style>
