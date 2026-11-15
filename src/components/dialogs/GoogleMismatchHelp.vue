<template>
  <div class="google-mismatch">
    <button v-if="!open" type="button" class="google-mismatch__link" @click="open = true">
      <v-icon icon="mdi-help-circle-outline" size="14" />{{ t('drive.mismatch_link') }}
    </button>
    <div v-else class="google-mismatch__card" role="group" :aria-label="t('drive.mismatch_title')">
      <header>
        <v-icon icon="mdi-alert-circle-outline" size="18" />
        <strong>{{ t('drive.mismatch_title') }}</strong>
        <v-btn size="x-small" variant="text" icon="mdi-close" :aria-label="t('common.close')" @click="open = false" />
      </header>
      <p>{{ t('drive.mismatch_reason') }}</p>
      <ol>
        <li><span>1</span><div>{{ t('drive.mismatch_step_create') }}
          <v-btn size="x-small" variant="tonal" color="primary" rounded="lg" append-icon="mdi-open-in-new" @click="openCreate">{{ t('drive.quick_link_client') }}</v-btn></div></li>
        <li><span>2</span><div>{{ t('drive.mismatch_step_download') }}</div></li>
        <li><span>3</span><div>{{ t('drive.mismatch_step_load') }}
          <v-btn size="x-small" variant="flat" color="primary" rounded="lg" prepend-icon="mdi-file-key-outline" @click="input?.click()">{{ t('drive.json_choose') }}</v-btn></div></li>
      </ol>
      <input ref="input" type="file" accept=".json,application/json" hidden @change="onFile">
    </div>
  </div>
</template>

<script setup lang="ts">
import {ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {openExternal} from '@/services/shellService'
import {useAppStore} from '@/stores/app'

/** Google reports redirect_uri_mismatch on its own page, so MediaChips cannot
 * detect it: offer the fix (a "Desktop app" client) while sign-in is pending. */
const emit = defineEmits<{json: [file: File]}>()
const {t} = useI18n()
const open = ref(false), input = ref<HTMLInputElement>()
const CREATE_CLIENT = 'https://console.cloud.google.com/auth/clients/create'
function openCreate() {
  if (useAppStore().isElectron) void openExternal(CREATE_CLIENT)
  else window.open(CREATE_CLIENT, '_blank', 'noopener')
}
function onFile(event: Event) {
  const target = event.target as HTMLInputElement, file = target.files?.[0]
  target.value = ''
  if (file) { open.value = false; emit('json', file) }
}
</script>

<style scoped>
.google-mismatch { font-size: .75rem; }
.google-mismatch__link {
  display: inline-flex; align-items: center; gap: 4px; padding: 0; border: 0; background: none; font: inherit; cursor: pointer;
  color: rgba(var(--v-theme-on-surface), .6); text-decoration: underline dotted; text-underline-offset: 3px;
}
.google-mismatch__link:hover { color: rgb(var(--v-theme-primary)); }
.google-mismatch__card { display: grid; gap: 8px; padding: 10px 12px; border-radius: 10px; background: rgba(var(--v-theme-warning), .08); }
.google-mismatch__card header { display: flex; align-items: center; gap: 8px; font-size: .8125rem; }
.google-mismatch__card header .v-icon { color: rgb(var(--v-theme-warning)); }
.google-mismatch__card header strong { flex: 1; }
.google-mismatch__card p { margin: 0; color: rgba(var(--v-theme-on-surface), .7); line-height: 1.45; }
.google-mismatch__card ol { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; line-height: 1.5; }
.google-mismatch__card li { display: flex; gap: 8px; align-items: flex-start; }
.google-mismatch__card li > span {
  flex: 0 0 auto; display: grid; place-items: center; width: 18px; height: 18px; margin-top: 1px; border-radius: 50%;
  font-size: .6875rem; font-weight: 600; background: rgba(var(--v-theme-on-surface), .1);
}
.google-mismatch__card li .v-btn { margin-left: 4px; vertical-align: baseline; }
</style>
