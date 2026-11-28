<template>
  <v-dialog v-model="dialog" width="960" scrollable :persistent="busy">
    <v-card rounded="xl" class="detach-dialog">
      <DialogHeader :header="t('media.detach_copies.title')" icon="link-variant-off" :buttons="headerButtons" :closable="!busy" @close="dialog = false" />
      <v-card-text class="detach-dialog__body">
        <v-alert type="info" variant="tonal" density="compact" class="mb-4">{{ t('media.detach_copies.hint') }}</v-alert>
        <v-text-field v-model="prefix" :label="t('media.detach_copies.prefix')" :hint="t('media.detach_copies.prefix_hint')" persistent-hint
          :disabled="busy" variant="outlined" density="comfortable" rounded="lg" @keyup.enter="preview">
          <template #append-inner>
            <v-btn icon="mdi-folder-open" variant="text" size="small" :disabled="busy" :title="t('common.select')" @click="browse = true" />
          </template>
        </v-text-field>
        <v-checkbox v-model="onlyUnavailable" :label="t('media.detach_copies.only_unavailable')" :disabled="busy" hide-details density="compact" />
        <v-alert v-if="error" type="error" variant="tonal" class="mt-4">{{ error }}</v-alert>
        <template v-if="result">
          <div v-if="!result.totalCopies" class="mt-4">{{ t('media.detach_copies.nothing') }}</div>
          <div v-else class="mt-4 text-body-2">{{ t('media.detach_copies.summary', {cards: result.totalCards, copies: result.totalCopies}) }}</div>
          <div v-if="result.skippedAllMatch" class="mt-1 text-caption text-medium-emphasis">
            {{ t('media.detach_copies.skipped', {count: result.skippedAllMatch}) }}
          </div>
          <div v-if="result.totalCards > result.cards.length" class="mt-1 text-caption text-medium-emphasis">
            {{ t('media.detach_copies.shown', {shown: result.cards.length, total: result.totalCards}) }}
          </div>
          <v-list v-if="result.cards.length" class="mt-2 detach-dialog__results" lines="three">
            <v-list-item v-for="card in result.cards" :key="card.mediaId">
              <div class="text-body-2 mb-1">{{ card.title || `#${card.mediaId}` }}</div>
              <div v-for="copy in card.detach" :key="copy.copyId" class="text-caption detach-path text-error">− {{ copy.path }}</div>
              <div v-for="copy in card.keep" :key="copy.path" class="text-caption detach-path text-success">+ {{ copy.path }}</div>
            </v-list-item>
          </v-list>
        </template>
      </v-card-text>
    </v-card>
    <DialogBrowseFolder v-model="browse" :initial-path="prefix" @confirm="onBrowse" />
  </v-dialog>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {typedApi} from '@/services/typedApi'
import {setNotification} from '@/services/notificationService'
import {normalizePastedFilePath} from '@/utils/filePathInput'
import type {DetachCopiesPreview} from '@shared/mediaCopiesBulk'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import DialogBrowseFolder from './DialogBrowseFolder.vue'

const props = defineProps<{modelValue: boolean}>()
const emit = defineEmits<{'update:modelValue': [value: boolean]; applied: []}>()
const {t} = useI18n()
const dialog = computed({get: () => props.modelValue, set: (value) => emit('update:modelValue', value)})
const prefix = ref('')
const onlyUnavailable = ref(false)
const busy = ref(false)
const saving = ref(false)
const browse = ref(false)
const error = ref('')
const result = ref<DetachCopiesPreview | null>(null)

const query = () => ({prefix: prefix.value.trim(), onlyUnavailable: onlyUnavailable.value})
const canPreview = computed(() => !busy.value && Boolean(prefix.value.trim()))
const headerButtons = computed(() => [
  {text: t('media.detach_copies.check'), icon: 'magnify', color: 'primary', outlined: true, disabled: !canPreview.value,
    loading: busy.value && !saving.value, action: preview, order: 0},
  {text: t('media.detach_copies.apply', {count: result.value?.totalCopies || 0}), icon: 'link-variant-off', color: 'error',
    disabled: busy.value || !result.value?.totalCopies, loading: saving.value, action: apply, order: 1},
])
const onBrowse = (paths: string[]) => { if (paths[0]) prefix.value = String(normalizePastedFilePath(paths[0]) || '') }
function reset() { result.value = null; error.value = '' }
watch([prefix, onlyUnavailable], reset)
watch(dialog, (open) => { if (open) { prefix.value = ''; onlyUnavailable.value = false; reset() } })

async function preview() {
  if (!canPreview.value) return
  busy.value = true
  reset()
  try {
    result.value = (await typedApi.previewDetachCopies(query())).data
  } catch {
    error.value = t('media.detach_copies.failed')
  } finally {
    busy.value = false
  }
}
async function apply() {
  if (busy.value || !result.value?.totalCopies) return
  busy.value = true
  saving.value = true
  error.value = ''
  try {
    const done = (await typedApi.applyDetachCopies({...query(), expectedCopies: result.value.totalCopies})).data
    emit('applied')
    setNotification({type: done.failed.length ? 'warning' : 'success',
      text: t(done.failed.length ? 'media.detach_copies.done_partial' : 'media.detach_copies.done', {copies: done.copies, cards: done.cards, failed: done.failed.length})})
    dialog.value = false
  } catch (err) {
    const code = (err as {response?: {data?: {code?: string}}})?.response?.data?.code
    error.value = t(code === 'plan_changed' ? 'media.detach_copies.plan_changed' : 'media.detach_copies.failed')
  } finally {
    busy.value = false
    saving.value = false
  }
}
</script>

<style scoped>
.detach-dialog { overflow: hidden; }
.detach-dialog__body { padding: 24px !important; }
.detach-dialog__results { max-height: 380px; overflow-y: auto; }
.detach-path { word-break: break-all; }
</style>
