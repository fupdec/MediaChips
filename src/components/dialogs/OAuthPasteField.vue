<template>
  <div class="oauth-paste" role="group" :aria-label="t('drive.paste_submit')">
    <div class="oauth-paste__hint">
      <v-icon icon="mdi-content-paste" size="18" />
      <p>{{ t('drive.paste_hint') }}</p>
    </div>
    <form class="oauth-paste__row" @submit.prevent="submit()">
      <v-text-field v-model="url" :placeholder="t('drive.paste_placeholder')" density="compact" variant="outlined" rounded="lg"
                    hide-details autocomplete="off" spellcheck="false" :disabled="completing" @paste="onPaste" />
      <v-btn type="submit" variant="flat" color="primary" rounded="lg" :loading="completing" :disabled="!url.trim()">{{ t('drive.paste_submit') }}</v-btn>
    </form>
    <p v-if="error" class="oauth-paste__error" role="alert">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import {ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {apiClient} from '@/services/apiClient'

/** Finishes a sign-in whose loopback redirect the browser could not open
 * (MediaChips running on a NAS, in Docker or on another computer). */
const props = defineProps<{endpoint: string}>()
const emit = defineEmits<{completed: []}>()
const {t} = useI18n()
const url = ref(''), completing = ref(false), error = ref('')

const looksComplete = (value: string) => /[?&]state=[a-f0-9]{64}/.test(value) && /[?&](code|error)=/.test(value)
function onPaste(event: ClipboardEvent) {
  const text = event.clipboardData?.getData('text')?.trim()
  // Pasting a full redirect address finishes sign-in without an extra click.
  if (text && looksComplete(text)) { event.preventDefault(); url.value = text; void submit() }
}
async function submit() {
  const value = url.value.trim()
  if (completing.value || !value) return
  completing.value = true; error.value = ''
  try {
    await apiClient.post(props.endpoint, {url: value})
    url.value = ''
    emit('completed')
  } catch (err) {
    const data = (err as {response?: {data?: {code?: string; message?: string}}}).response?.data
    error.value = data?.code === 'invalid_oauth_url' ? t('drive.paste_invalid') : data?.message || t('drive.oauth_errors.unknown')
  } finally { completing.value = false }
}
</script>

<style scoped>
.oauth-paste { display: grid; gap: 8px; padding: 10px 12px; border-radius: 10px; background: rgba(var(--v-theme-primary), .05); font-size: .75rem; }
.oauth-paste__hint { display: flex; gap: 8px; align-items: flex-start; }
.oauth-paste__hint .v-icon { color: rgb(var(--v-theme-primary)); margin-top: 1px; }
.oauth-paste__hint p { margin: 0; line-height: 1.45; }
.oauth-paste__row { display: flex; gap: 8px; align-items: center; }
.oauth-paste__error { margin: 0; color: rgb(var(--v-theme-error)); }
</style>
