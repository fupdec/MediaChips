<template>
  <div class="mx-4">
    <SettingsGroupPanel icon="text-box-search-outline" :title="t('aboutApp.logs_title')" :hint="t('aboutApp.logs_hint')">
      <div class="d-flex flex-wrap align-center ga-2 mb-2">
        <v-btn-toggle
          v-if="hasShellLog"
          v-model="source"
          mandatory
          density="comfortable"
          variant="outlined"
          divided
          rounded="xl"
        >
          <v-btn value="server" size="small">{{ t('aboutApp.logs_source_server') }}</v-btn>
          <v-btn value="main" size="small">{{ t('aboutApp.logs_source_app') }}</v-btn>
        </v-btn-toggle>

        <v-spacer/>

        <v-btn size="small" variant="tonal" rounded="xl" :loading="loading" @click="load">
          <v-icon start size="small">mdi-refresh</v-icon>
          {{ t('aboutApp.logs_refresh') }}
        </v-btn>
        <v-btn size="small" variant="tonal" rounded="xl" :disabled="!lines.length" @click="copy">
          <v-icon start size="small">mdi-content-copy</v-icon>
          {{ t('aboutApp.logs_copy') }}
        </v-btn>
        <v-btn size="small" variant="tonal" rounded="xl" :disabled="!available" @click="download">
          <v-icon start size="small">mdi-download</v-icon>
          {{ t('aboutApp.logs_download') }}
        </v-btn>
      </div>

      <v-alert v-if="errorText" type="error" variant="tonal" density="compact" rounded="xl" class="text-body-2 mb-2">
        {{ errorText }}
      </v-alert>

      <pre ref="viewer" class="server-logs__viewer text-caption" tabindex="0">{{ viewerText }}</pre>

      <div v-if="logPath" class="text-caption text-medium-emphasis mt-1 server-logs__path">{{ logPath }}</div>
    </SettingsGroupPanel>
  </div>
</template>

<script setup lang="ts">
import {computed, nextTick, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import SettingsGroupPanel from '@/components/ui/SettingsGroupPanel.vue'
import {typedApi} from '@/services/typedApi'
import type {AppLogSource} from '@/services/typedApi/system'
import {useNotificationsStore} from '@/stores/notifications'

const {t} = useI18n({useScope: 'global'})
const notificationsStore = useNotificationsStore()

const LINES_TO_SHOW = 500

// The desktop shell has its own log; in a browser / Docker only the server log exists.
const hasShellLog = computed(() => Boolean(window.electronAPI))
const source = ref<AppLogSource>('server')
const loading = ref(false)
const available = ref(false)
const lines = ref<string[]>([])
const logPath = ref('')
const errorText = ref('')
const viewer = ref<HTMLElement | null>(null)

const viewerText = computed(() => {
  if (lines.value.length) return lines.value.join('\n')
  if (loading.value) return ''
  return available.value ? t('aboutApp.logs_empty') : t('aboutApp.logs_unavailable')
})

async function load() {
  loading.value = true
  errorText.value = ''
  try {
    const result = await typedApi.getLogs({source: source.value, lines: LINES_TO_SHOW})
    available.value = result.available
    lines.value = result.lines
    logPath.value = result.path || ''
    await nextTick()
    if (viewer.value) viewer.value.scrollTop = viewer.value.scrollHeight
  } catch (error) {
    console.error('Failed to load log:', error)
    available.value = false
    lines.value = []
    errorText.value = t('aboutApp.logs_load_failed')
  } finally {
    loading.value = false
  }
}

async function copy() {
  try {
    await navigator.clipboard.writeText(lines.value.join('\n'))
    notificationsStore.setNotification({type: 'success', text: t('aboutApp.logs_copied')})
  } catch (error) {
    console.error('Failed to copy log:', error)
  }
}

async function download() {
  try {
    const text = await typedApi.downloadLogs(source.value)
    const url = URL.createObjectURL(new Blob([text], {type: 'text/plain;charset=utf-8'}))
    const link = document.createElement('a')
    link.href = url
    link.download = `mediachips-${source.value}.log.txt`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (error) {
    console.error('Failed to download log:', error)
    errorText.value = t('aboutApp.logs_load_failed')
  }
}

watch(source, () => { void load() })
onMounted(() => { void load() })
</script>

<style scoped>
.server-logs__viewer {
  margin: 0;
  padding: 10px 12px;
  min-height: 120px;
  max-height: 360px;
  overflow: auto;
  white-space: pre;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  border-radius: 12px;
  background: rgba(var(--v-theme-on-surface), 0.05);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.server-logs__path {
  word-break: break-all;
}
</style>
