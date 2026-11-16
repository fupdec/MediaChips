<template>
  <v-btn class="media-originals-button" variant="tonal" color="primary" size="small"
    prepend-icon="mdi-file-multiple-outline" :aria-label="`${t('copies.originals')} · ${count ?? '—'}`"
    @click="open">
    {{ t('copies.originals') }}
    <span class="media-originals-button__count">{{ count ?? '—' }}</span>
  </v-btn>
</template>

<script setup lang="ts">
import {ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {useDialogsStore} from '@/stores/dialogs'
import {mediaCopiesApi} from '@/services/typedApi/mediaCopies'
import type {MediaItem} from '@/types/stores'

const props = defineProps<{media: MediaItem}>()
const {t} = useI18n()
const app = useAppStore()
const dialogs = useDialogsStore()
const count = ref<number | null>(null)
watch([
  () => props.media.id,
  () => props.media.path,
  () => app.dbPath,
  () => app.localhost,
  () => dialogs.mediaCardAction.kind,
], async (_value, _previous, onCleanup) => {
  let current = true
  onCleanup(() => { current = false })
  count.value = null
  try {
    const {data} = await mediaCopiesApi.list(props.media.id)
    if (current) count.value = data.copies.length
  } catch {
    // Keep the dialog available for recovery without inventing a file count.
    if (current) count.value = null
  }
}, {immediate: true})
function open() {
  dialogs.mediaCardAction = {kind: 'copies', mediaIds: [props.media.id], media: props.media}
}
</script>

<style scoped>
.media-originals-button.v-btn {
  align-self: flex-start;
  width: fit-content;
  flex: 0 0 auto;
  height: 28px !important;
  min-height: 28px !important;
  margin: 8px 0 12px;
  padding: 0 9px !important;
  border-radius: 8px;
  font-size: .75rem !important;
  letter-spacing: normal;
  text-transform: none;
}
.media-originals-button :deep(.v-btn__content) { font-size: inherit; }
.media-originals-button :deep(.v-icon) { font-size: 16px; }

.media-originals-button__count { margin-inline-start: 10px; padding: 1px 7px; border-radius: 6px; background: rgba(var(--v-theme-primary), .1); font-variant-numeric: tabular-nums; }
</style>
