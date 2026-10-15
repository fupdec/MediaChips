<template>
  <v-dialog v-model="dialog" width="960" scrollable :persistent="busy">
    <v-card rounded="xl">
      <DialogHeader
        :header="t(media ? 'media.relink.locate' : 'media.relink.change_root')"
        icon="file-link-outline" :closable="!busy" @close="dialog = false"
      />
      <v-card-text>
        <v-alert type="info" variant="tonal" density="compact" class="mb-4">
          {{ t('media.relink.hint') }}
        </v-alert>
        <v-text-field v-if="!media" v-model="oldRoot" :label="t('media.relink.old_root')"
          :disabled="busy" variant="outlined" />
        <div v-else class="text-caption mb-4 relink-path">{{ media.path }}</div>
        <v-text-field v-model="destination"
          :label="t(media ? 'media.relink.new_path' : 'media.relink.new_root')"
          :disabled="busy" variant="outlined" @update:model-value="normalizeDestination"
        >
          <template #append-inner>
            <v-btn icon="mdi-folder-open" variant="text" size="small" :disabled="busy"
              :title="t('common.select')" @click="browse = true" />
          </template>
        </v-text-field>
        <v-btn color="primary" variant="tonal" :loading="busy" :disabled="!canPreview" @click="preview">
          {{ t('media.relink.check') }}
        </v-btn>
        <v-alert v-if="error" type="error" variant="tonal" class="mt-4">{{ error }}</v-alert>
        <div v-if="checked && !candidates.length" class="mt-4">{{ t('media.relink.no_matches') }}</div>
        <v-list v-if="candidates.length" class="mt-4" lines="three">
          <v-list-item v-for="item in candidates" :key="item.id" class="px-0">
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
      <v-card-actions class="pa-4">
        <v-spacer />
        <v-btn color="success" variant="flat" :disabled="busy || !selected.length" :loading="saving" @click="apply">
          {{ t('media.relink.apply', {count: selected.length}) }}
        </v-btn>
      </v-card-actions>
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
.relink-path { overflow-wrap: anywhere; user-select: text; }
</style>
