<template>
  <div id="settings-import-jellyfin" class="mx-4 pb-4">
    <settings-category-divider
      :title="t('settings_labels.database.import_jellyfin')"
      icon="server"
    />

    <v-alert
      type="info"
      variant="tonal"
      density="compact"
      rounded="xl"
      class="mb-4"
    >
      <span class="text-caption">
        {{ t('settings_labels.database.import_jellyfin_hint') }}
      </span>
    </v-alert>

    <v-alert
      type="warning"
      variant="tonal"
      density="compact"
      rounded="xl"
      class="mb-4"
    >
      <span class="text-caption">
        {{ t('settings_labels.database.import_jellyfin_backup_warning') }}
      </span>
    </v-alert>

    <v-text-field
      v-model="baseUrl"
      :label="t('settings_labels.database.import_jellyfin_url')"
      :hint="t('settings_labels.database.import_jellyfin_url_hint')"
      persistent-hint
      variant="outlined"
      density="comfortable"
      rounded="lg"
      class="mb-2"
      :disabled="active"
    />

    <v-text-field
      v-model="apiKey"
      :label="t('settings_labels.database.import_jellyfin_api_key')"
      :hint="t('settings_labels.database.import_jellyfin_api_key_hint')"
      persistent-hint
      variant="outlined"
      density="comfortable"
      rounded="lg"
      class="mb-4"
      type="password"
      autocomplete="off"
      :disabled="active"
    />

    <div class="d-flex flex-wrap ga-2 mb-4">
      <v-btn
        @click="loadLibraries"
        color="primary"
        rounded
        variant="outlined"
        class="pr-4"
        :disabled="!canLoadLibraries || loadingLibraries || active"
        :loading="loadingLibraries"
      >
        <v-icon icon="mdi-library" start/>
        {{ t('settings_labels.database.import_jellyfin_load_libraries') }}
      </v-btn>

      <v-btn
        @click="saveConnection"
        color="primary"
        rounded
        variant="tonal"
        class="pr-4"
        :disabled="!canLoadLibraries || active"
      >
        <v-icon icon="mdi-content-save-outline" start/>
        {{ t('settings_labels.database.sync_save_connection') }}
      </v-btn>
    </div>

    <v-select
      v-if="libraries.length"
      v-model="selectedLibraryIds"
      :items="libraryItems"
      item-title="title"
      item-value="value"
      :label="t('settings_labels.database.import_jellyfin_libraries')"
      :hint="t('settings_labels.database.import_jellyfin_libraries_hint')"
      persistent-hint
      multiple
      chips
      closable-chips
      variant="outlined"
      density="comfortable"
      rounded="lg"
      class="mb-4"
      :disabled="active"
    />

    <v-checkbox
      v-model="createMissingMedia"
      :label="t('settings_labels.database.import_jellyfin_create_missing')"
      density="compact"
      hide-details
      class="mb-2"
      :disabled="active"
    />

    <div class="text-caption text-medium-emphasis mb-4">
      {{ t('settings_labels.database.sync_push_matched_hint') }}
    </div>

    <v-progress-linear
      v-if="active"
      :model-value="progress"
      color="primary"
      height="8"
      rounded
      striped
      class="mb-2"
    />

    <div v-if="active" class="text-caption text-medium-emphasis mb-2">
      {{ t('settings_labels.database.import_jellyfin_progress', {
        phase: phaseLabel,
        processed: counters.processed,
        total: counters.total,
      }) }}
    </div>

    <div v-if="active && currentPath" class="text-caption text-medium-emphasis mb-4 selectable">
      {{ currentPath }}
    </div>

    <div v-if="lastSummaryText" class="text-body-2 mb-2">
      {{ lastSummaryText }}
    </div>
    <div v-if="lastSyncAt" class="text-caption text-medium-emphasis mb-4">
      {{ t('settings_labels.database.sync_last_at', {time: lastSyncAt}) }}
    </div>

    <v-alert
      v-if="lastError"
      type="error"
      variant="tonal"
      density="compact"
      rounded="xl"
      class="mb-4"
    >
      <span class="text-caption">{{ lastError }}</span>
    </v-alert>

    <div class="d-flex flex-wrap ga-2">
      <template v-if="!active">
        <v-btn
          @click="startSync"
          :disabled="!canStart"
          color="primary"
          rounded
          variant="flat"
          class="pr-4"
        >
          <v-icon icon="mdi-cloud-download-outline" start/>
          {{ t('settings_labels.database.sync_from_remote') }}
        </v-btn>

        <v-btn
          @click="startPush"
          :disabled="!canStart"
          color="primary"
          rounded
          variant="tonal"
          class="pr-4"
        >
          <v-icon icon="mdi-cloud-upload-outline" start/>
          {{ t('settings_labels.database.sync_push_to_remote') }}
        </v-btn>

        <v-btn
          @click="startImport"
          :disabled="!canStart"
          color="primary"
          rounded
          variant="outlined"
          class="pr-4"
        >
          <v-icon icon="mdi-play" start/>
          {{ t('settings_labels.database.import_jellyfin_start') }}
        </v-btn>
      </template>

      <v-btn
        v-else
        @click="stopImport"
        color="error"
        rounded
        variant="tonal"
        class="pr-4"
      >
        <v-icon icon="mdi-stop" start/>
        {{ t('common.cancel') }}
      </v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed, onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'
import {setNotification} from '@/services/notificationService'
import {setOption} from '@/services/settingsService'
import {typedApi} from '@/services/typedApi'
import {useDialogsStore} from '@/stores/dialogs'
import {useSettingsStore} from '@/stores/settings'

const {t} = useI18n()
const dialogsStore = useDialogsStore()
const settingsStore = useSettingsStore()

const baseUrl = ref('')
const apiKey = ref('')
const createMissingMedia = ref(false)
const libraries = ref<Array<{id: string; name: string}>>([])
const selectedLibraryIds = ref<string[]>([])
const loadingLibraries = ref(false)
const active = ref(false)
const mode = ref<'import' | 'sync' | 'push'>('import')
const currentPath = ref('')
const phase = ref('')
const lastError = ref('')
const lastSummary = ref<Record<string, number> | null>(null)
const lastSyncAt = ref('')
const counters = ref({processed: 0, total: 0})

let abortController: AbortController | null = null

const progress = computed(() => {
  if (!counters.value.total) return 0
  return Math.min(100, Math.round((counters.value.processed / counters.value.total) * 100))
})

const canLoadLibraries = computed(() => Boolean(baseUrl.value.trim() && apiKey.value.trim()))
const canStart = computed(() => canLoadLibraries.value && !active.value)

const libraryItems = computed(() =>
  libraries.value.map((lib) => ({title: lib.name, value: lib.id})),
)

const phaseLabel = computed(() => {
  const key = `settings_labels.database.import_jellyfin_phase_${phase.value}`
  const translated = t(key)
  return translated === key ? phase.value : translated
})

const lastSummaryText = computed(() => {
  if (!lastSummary.value) return ''
  if (mode.value === 'push' || 'pushed' in lastSummary.value) {
    return t('settings_labels.database.sync_push_complete', lastSummary.value)
  }
  return t('settings_labels.database.import_jellyfin_complete', lastSummary.value)
})

function parseLibraryIds(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.map((id) => String(id).trim()).filter(Boolean)
  } catch {
    return []
  }
}

function saveConnection() {
  setOption(baseUrl.value.trim(), 'jellyfinBaseUrl')
  setOption(apiKey.value.trim(), 'jellyfinApiKey')
  setOption(JSON.stringify(selectedLibraryIds.value), 'jellyfinLibraryIds')
  setOption(createMissingMedia.value ? '1' : '0', 'jellyfinCreateMissingMedia')
  setNotification({
    type: 'success',
    text: t('settings_labels.database.sync_connection_saved'),
  })
}

function persistLastRun(kind: 'sync' | 'push', summary: Record<string, number>) {
  const at = new Date().toISOString()
  if (kind === 'sync') {
    setOption(at, 'jellyfinLastSyncAt')
    setOption(JSON.stringify(summary), 'jellyfinLastSyncSummary')
    lastSyncAt.value = at
  } else {
    setOption(at, 'jellyfinLastPushAt')
    setOption(JSON.stringify(summary), 'jellyfinLastPushSummary')
    lastSyncAt.value = at
  }
}

const stopImport = () => {
  abortController?.abort()
}

const loadLibraries = async () => {
  if (!canLoadLibraries.value || loadingLibraries.value) return
  loadingLibraries.value = true
  lastError.value = ''
  try {
    const {data} = await typedApi.listMediaServerLibraries('jellyfin', {
      baseUrl: baseUrl.value.trim(),
      apiKey: apiKey.value.trim(),
    })
    libraries.value = data.libraries || []
    if (!selectedLibraryIds.value.length) {
      selectedLibraryIds.value = libraries.value.map((lib) => lib.id)
    }
  } catch (error) {
    lastError.value = (error as Error)?.message || String(error)
    libraries.value = []
  } finally {
    loadingLibraries.value = false
  }
}

async function runPull(createMissing: boolean, runMode: 'import' | 'sync') {
  if (active.value || !canStart.value) return
  saveConnection()

  mode.value = runMode
  active.value = true
  lastError.value = ''
  lastSummary.value = null
  currentPath.value = ''
  phase.value = 'starting'
  counters.value = {processed: 0, total: 0}
  abortController = new AbortController()

  try {
    await typedApi.streamMediaServerImport(
      'jellyfin',
      {
        baseUrl: baseUrl.value.trim(),
        apiKey: apiKey.value.trim(),
        libraryIds: selectedLibraryIds.value.length ? selectedLibraryIds.value : undefined,
        createMissingMedia: createMissing,
      },
      {signal: abortController.signal},
      (event) => {
        if (event.type === 'progress') {
          phase.value = String(event.phase || '')
          counters.value = {
            processed: Number(event.processed) || 0,
            total: Number(event.total) || 0,
          }
          currentPath.value = event.current ? String(event.current) : ''
        } else if (event.type === 'complete') {
          const summary = {
            people: Number(event.people) || 0,
            genres: Number(event.genres) || 0,
            studios: Number(event.studios) || 0,
            series: Number(event.series) || 0,
            mediaCreated: Number(event.mediaCreated) || 0,
            mediaMatched: Number(event.mediaMatched) || 0,
            mediaUpdated: Number(event.mediaUpdated) || 0,
            mediaSkipped: Number(event.mediaSkipped) || 0,
            markers: Number(event.markers) || 0,
          }
          lastSummary.value = summary
          persistLastRun('sync', summary)
          setNotification({
            type: 'success',
            text: t(runMode === 'sync'
              ? 'settings_labels.database.sync_success'
              : 'settings_labels.database.import_jellyfin_success'),
          })
        } else if (event.type === 'error') {
          lastError.value = String(event.message || 'Jellyfin import failed')
        }
      },
    )
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') {
      lastError.value = t('settings_labels.database.import_jellyfin_cancelled')
    } else {
      lastError.value = (error as Error)?.message || String(error)
      console.error('Jellyfin import failed:', error)
    }
  } finally {
    active.value = false
    abortController = null
    currentPath.value = ''
  }
}

const startImport = () => runPull(createMissingMedia.value, 'import')
const startSync = () => runPull(false, 'sync')

const startPush = () => {
  if (active.value || !canStart.value) return
  dialogsStore.confirm.text = t('settings_labels.database.sync_push_confirm')
  dialogsStore.confirm.action = () => {
    void runPush()
  }
  dialogsStore.confirm.show = true
}

const runPush = async () => {
  if (active.value || !canStart.value) return
  saveConnection()

  mode.value = 'push'
  active.value = true
  lastError.value = ''
  lastSummary.value = null
  currentPath.value = ''
  phase.value = 'starting'
  counters.value = {processed: 0, total: 0}
  abortController = new AbortController()

  try {
    await typedApi.streamMediaServerPush(
      'jellyfin',
      {
        baseUrl: baseUrl.value.trim(),
        apiKey: apiKey.value.trim(),
      },
      {signal: abortController.signal},
      (event) => {
        if (event.type === 'progress') {
          phase.value = String(event.phase || '')
          counters.value = {
            processed: Number(event.processed) || 0,
            total: Number(event.total) || 0,
          }
          currentPath.value = event.current ? String(event.current) : ''
        } else if (event.type === 'complete') {
          const summary = {
            pushed: Number(event.pushed) || 0,
            skipped: Number(event.skipped) || 0,
            failed: Number(event.failed) || 0,
          }
          lastSummary.value = summary
          persistLastRun('push', summary)
          setNotification({
            type: 'success',
            text: t('settings_labels.database.sync_push_success'),
          })
        } else if (event.type === 'error') {
          lastError.value = String(event.message || t('settings_labels.database.sync_push_failed'))
        }
      },
    )
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') {
      lastError.value = t('settings_labels.database.sync_push_cancelled')
    } else {
      lastError.value = (error as Error)?.message || t('settings_labels.database.sync_push_failed')
      console.error('Jellyfin push failed:', error)
    }
  } finally {
    active.value = false
    abortController = null
    currentPath.value = ''
  }
}

onMounted(() => {
  baseUrl.value = settingsStore.jellyfinBaseUrl || ''
  apiKey.value = settingsStore.jellyfinApiKey || ''
  selectedLibraryIds.value = parseLibraryIds(settingsStore.jellyfinLibraryIds || '[]')
  createMissingMedia.value = settingsStore.jellyfinCreateMissingMedia === '1'
  lastSyncAt.value = settingsStore.jellyfinLastPushAt || settingsStore.jellyfinLastSyncAt || ''
  const rawSummary = settingsStore.jellyfinLastPushSummary || settingsStore.jellyfinLastSyncSummary
  if (rawSummary) {
    try {
      lastSummary.value = JSON.parse(rawSummary)
      mode.value = settingsStore.jellyfinLastPushSummary ? 'push' : 'sync'
    } catch {
      lastSummary.value = null
    }
  }
})
</script>
