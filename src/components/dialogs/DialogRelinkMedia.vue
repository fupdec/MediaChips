<template>
  <v-dialog v-model="dialog" width="960" scrollable :persistent="busy">
    <v-card rounded="xl" class="relink-dialog">
      <DialogHeader
        :header="t(media ? 'media.relink.locate' : 'media.relink.change_root')"
        icon="file-link-outline" :buttons="headerButtons" :closable="!busy" @close="dialog = false"
      />
      <v-card-text class="relink-dialog__body">
        <v-alert type="info" variant="tonal" density="compact" class="mb-4">
          {{ t('media.relink.hint') }}
        </v-alert>
        <div class="relink-dialog__paths" :class="{'relink-dialog__paths--single': media}">
          <v-text-field v-if="!media" v-model="oldRoot" :label="t('media.relink.old_root')"
            :disabled="busy" variant="outlined" density="comfortable" rounded="lg" />
          <div v-else class="text-caption mb-4 relink-path">{{ media.path }}</div>
          <v-text-field v-model="destination"
            :label="t(media ? 'media.relink.new_path' : 'media.relink.new_root')"
            :disabled="busy" variant="outlined" density="comfortable" rounded="lg" @update:model-value="normalizeDestination"
          >
            <template #append-inner>
              <v-btn icon="mdi-folder-open" variant="text" size="small" :disabled="busy"
                :title="t('common.select')" @click="browse = true" />
            </template>
          </v-text-field>
        </div>
        <v-alert v-if="error" type="error" variant="tonal" class="mt-4">{{ error }}</v-alert>
        <div v-if="checked && !candidates.length" class="mt-4">{{ t('media.relink.no_matches') }}</div>
        <v-list v-if="candidates.length" class="mt-4 relink-dialog__results" lines="three">
          <v-list-item v-for="item in candidates" :key="item.id" class="relink-dialog__result">
            <template #prepend>
              <v-checkbox-btn v-model="selected" :value="item.id" :disabled="busy || !selectable(item)"
                :aria-label="item.oldPath" />
            </template>
            <v-chip :color="item.status === 'same' ? 'success' : 'warning'" size="small" class="mb-1">
              {{ t(`media.relink.status_${item.status}`) }}
            </v-chip>
            <div class="text-caption relink-path">{{ item.oldPath }}</div>
            <div class="text-caption relink-path">→ {{ item.newPath }}</div>
            <div v-if="item.status === 'different'" class="text-caption mt-1">
              {{ t('media.relink.replacement_hint') }}
            </div>
            <v-checkbox v-if="item.status === 'unknown'" v-model="confirmed[item.id]"
              :label="t('media.relink.confirm_original')" :disabled="busy" hide-details density="compact"
              @update:model-value="(value) => confirmUnknown(item.id, value)" />
          </v-list-item>
        </v-list>
      </v-card-text>
    </v-card>
    <DialogBrowseFolder v-model="browse" :file-extensions="media ? fileExtensions : []"
      :initial-path="destination" @confirm="onBrowse" />
  </v-dialog>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {typedApi} from '@/services/typedApi'
import {normalizePastedFilePath} from '@/utils/filePathInput'
import {setNotification} from '@/services/notificationService'
import {parseMediaFilePath} from '@shared/mediaPath'
import type {MediaRelinkCandidate} from '@shared/mediaRelink'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import DialogBrowseFolder from './DialogBrowseFolder.vue'

const props = defineProps<{
  modelValue: boolean
  media?: {id: number; path?: string; ext?: string}
  initialDestination?: string
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  applied: [matches: MediaRelinkCandidate[]]
}>()
const {t} = useI18n()
const dialog = computed({get: () => props.modelValue, set: (value) => emit('update:modelValue', value)})
const oldRoot = ref('')
const destination = ref('')
const busy = ref(false)
const saving = ref(false)
const browse = ref(false)
const checked = ref(false)
const error = ref('')
const candidates = ref<MediaRelinkCandidate[]>([])
const selected = ref<number[]>([])
const confirmed = ref<Record<number, boolean>>({})
const fileExtensions = computed(() => {
  const ext = props.media?.ext || parseMediaFilePath(props.media?.path).ext
  return ext ? [ext.replace(/^\./, '')] : ['mp4', 'mkv', 'mov', 'avi', 'webm', 'jpg', 'png', 'mp3']
})
const canPreview = computed(() => !busy.value && Boolean(destination.value.trim()) && Boolean(props.media || oldRoot.value.trim()))
const headerButtons = computed(() => [
  {
    text: t('media.relink.check'),
    icon: 'folder-search-outline',
    color: 'primary',
    outlined: true,
    disabled: !canPreview.value,
    loading: busy.value && !saving.value,
    action: preview,
    order: 0,
  },
  {
    text: t('media.relink.apply', {count: selected.value.length}),
    icon: 'link-variant',
    color: 'success',
    disabled: busy.value || !selected.value.length,
    loading: saving.value,
    action: apply,
    order: 1,
  },
])
const selectable = (item: MediaRelinkCandidate) => item.status === 'same' || (item.status === 'unknown' && confirmed.value[item.id])
const normalizeDestination = (value: string) => { destination.value = String(normalizePastedFilePath(value) || '') }
const onBrowse = (paths: string[]) => { if (paths[0]) destination.value = paths[0] }
function resetPreview() {
  candidates.value = []
  selected.value = []
  confirmed.value = {}
  checked.value = false
  error.value = ''
}
watch([oldRoot, destination], resetPreview)
watch(dialog, (open) => {
  if (open) {
    destination.value = props.initialDestination || ''
    oldRoot.value = ''
    resetPreview()
  }
})
function confirmUnknown(id: number, value: boolean | null) {
  selected.value = selected.value.filter((item) => item !== id)
  if (value) selected.value.push(id)
}
async function preview() {
  if (!canPreview.value) return
  busy.value = true
  resetPreview()
  try {
    const body = props.media
      ? {id: props.media.id, oldPath: props.media.path || '', newPath: destination.value}
      : {oldRoot: oldRoot.value, newRoot: destination.value}
    candidates.value = (await typedApi.previewMediaRelink(body)).data.candidates
    selected.value = candidates.value.filter((item) => item.status === 'same').map((item) => item.id)
    checked.value = true
  } catch {
    error.value = t('media.relink.failed')
  } finally {
    busy.value = false
  }
}
async function apply() {
  if (busy.value) return
  const matches = candidates.value.filter((item) => selected.value.includes(item.id) && selectable(item))
  if (!matches.length) return
  busy.value = true
  saving.value = true
  error.value = ''
  try {
    await typedApi.applyMediaRelinks(matches.map((item) => ({...item, confirmedOriginal: confirmed.value[item.id] === true})))
    emit('applied', matches)
    setNotification({type: 'success', text: t('media.relink.done', {count: matches.length})})
    dialog.value = false
  } catch {
    error.value = t('media.relink.failed')
  } finally {
    busy.value = false
    saving.value = false
  }
}
</script>

<style scoped>
.relink-dialog {
  border: 1px solid rgba(var(--v-theme-primary), .14);
  overflow: hidden;
}

.relink-dialog__body {
  padding: 24px !important;
  background: linear-gradient(145deg, rgba(var(--v-theme-primary), .025), transparent);
}

.relink-dialog__body > .v-alert {
  border-radius: 14px;
  font-size: .8125rem;
  line-height: 1.6;
}

.relink-dialog__paths {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: 24px;
}

.relink-dialog__paths--single {
  grid-template-columns: minmax(0, 1fr);
}

.relink-dialog__paths > * { min-width: 0; }

.relink-dialog__paths :deep(.v-field) {
  background: rgba(var(--v-theme-surface), .7);
  border-radius: 12px;
}

.relink-dialog__results {
  padding: 0;
  background: transparent;
}

.relink-dialog__result {
  padding: 14px !important;
  border: 1px solid rgba(var(--v-theme-on-surface), .09);
  border-radius: 14px;
  background: rgba(var(--v-theme-surface), .75);
}

.relink-dialog__result + .relink-dialog__result { margin-top: 10px; }

.relink-path {
  overflow-wrap: anywhere;
  user-select: text;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  line-height: 1.6;
}

@media (max-width: 700px) {
  .relink-dialog__body { padding: 16px !important; }
  .relink-dialog__paths { grid-template-columns: minmax(0, 1fr); gap: 8px; }
}
</style>
