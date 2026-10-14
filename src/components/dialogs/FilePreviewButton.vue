<template>
  <v-btn v-if="canPreview(file)" size="x-small" variant="plain" :rounded="0" :ripple="false"
         icon :aria-label="t('media.preview.open_without_import')"
         :disabled="disabled || opening"
         @click.stop="open">
    <v-icon size="16" icon="mdi-play-circle-outline" />
  </v-btn>
</template>

<script setup lang="ts">
import {ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {useFilePreview, type PreviewFile} from '@/composable/useFilePreview'
import {setNotification} from '@/services/notificationService'
import {getApiErrorMessage} from '@/types/vue'

const {file, disabled = false, previewAction} = defineProps<{
  file: PreviewFile
  disabled?: boolean
  previewAction?: () => Promise<void>
}>()
const {t} = useI18n()
const {canPreview, preview} = useFilePreview()
const opening = ref(false)
async function open() {
  if (disabled || opening.value) return
  opening.value = true
  try { await (previewAction ? previewAction() : preview(file)) }
  catch (error) { setNotification({type: 'error', title: getApiErrorMessage(error, t('player.video_playback_failed'))}) }
  finally { opening.value = false }
}
</script>
