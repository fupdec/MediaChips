<template>
  <div id="settings-import-stash" class="mx-4 pb-4">
    <settings-category-divider
      :title="t('settings_labels.database.import_stash')"
      icon="package-variant"
    />

    <v-alert
      type="info"
      variant="tonal"
      density="compact"
      rounded="xl"
      class="mb-4"
    >
      <span class="text-caption">
        {{ t('settings_labels.database.import_stash_hint') }}
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
        {{ t('settings_labels.database.import_stash_backup_warning') }}
      </span>
    </v-alert>

    <v-text-field
      :model-value="dbPath"
      @update:model-value="onPathInput"
      @blur="validatePath"
      :label="t('settings_labels.database.import_stash_path')"
      :hint="t('settings_labels.database.import_stash_path_hint')"
      persistent-hint
      variant="outlined"
      density="comfortable"
      rounded="lg"
      class="mb-2"
      :disabled="active"
      :error="isFileExists === false"
      :error-messages="isFileExists === false ? t('settings_labels.database.file_missing') : ''"
    />

    <div class="d-flex flex-wrap ga-2 mb-4">
      <v-btn
        v-if="appStore.isElectron"
        @click="selectFileNative"
        color="primary"
        rounded
        variant="outlined"
        class="pr-4"
        :disabled="active"
      >
        <v-icon icon="mdi-file-search-outline" start/>
        {{ t('settings_labels.database.import_stash_select_file') }}
      </v-btn>

      <v-btn
        @click="showBrowseDialog = true"
        color="primary"
        rounded
        :variant="appStore.isElectron ? 'tonal' : 'outlined'"
        class="pr-4"
        :disabled="active"
      >
        <v-icon icon="mdi-folder-search-outline" start/>
        {{ t('media.adding.browse_folders') }}
      </v-btn>
    </div>

    <v-text-field
      v-model="graphqlUrl"
      :label="t('settings_labels.database.import_stash_graphql_url')"
      :hint="t('settings_labels.database.import_stash_graphql_url_hint')"
      persistent-hint
      variant="outlined"
      density="comfortable"
      rounded="lg"
      class="mb-2"
      :disabled="active"
    />

    <v-text-field
      v-model="apiKey"
      :label="t('settings_labels.database.import_stash_api_key')"
      :hint="t('settings_labels.database.import_stash_api_key_hint')"
      persistent-hint
      variant="outlined"
      density="comfortable"
      rounded="lg"
      class="mb-4"
      type="password"
      autocomplete="off"
      :disabled="active"
    />

    <v-checkbox
      v-model="createMissingMedia"
      :label="t('settings_labels.database.import_stash_create_missing')"
      density="compact"
      hide-details
      class="mb-2"
      :disabled="active"
    />

    <div class="text-caption text-medium-emphasis mb-4">
      {{ t('settings_labels.database.sync_push_matched_hint') }}
    </div>

    <div class="d-flex flex-wrap ga-2 mb-4">
      <v-btn
        @click="saveConnection"
        color="primary"
        rounded
        variant="tonal"
        class="pr-4"
        :disabled="active"
      >
        <v-icon icon="mdi-content-save-outline" start/>
        {{ t('settings_labels.database.sync_save_connection') }}
      </v-btn>
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
      {{ t('settings_labels.database.import_stash_progress', {
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
          :disabled="!canSync"
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
          :disabled="!canPush"
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
          :disabled="!canSync"
          color="primary"
          rounded
          variant="outlined"
          class="pr-4"
        >
          <v-icon icon="mdi-play" start/>
          {{ t('settings_labels.database.import_stash_start') }}
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

    <DialogBrowseFolder
      v-model="showBrowseDialog"
      :header="t('settings_labels.database.import_stash_select_file')"
      :file-extensions="['sqlite', 'db']"
      :confirm-text="t('common.select')"
      @confirm="onBrowseConfirm"
    />
  </div>
</template>

<script setup lang="ts">
import {computed, onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {useSettingsStore} from '@/stores/settings'
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'
import DialogBrowseFolder from '@/components/dialogs/DialogBrowseFolder.vue'
import {showOpenDialog} from '@/services/electronDialogService'
import {normalizePastedFilePath} from '@/utils/filePathInput'
import {checkFileExists} from '@/services/fileService'
import {setNotification} from '@/services/notificationService'
import {setOption} from '@/services/settingsService'
import {typedApi} from '@/services/typedApi'

const {t} = useI18n()
const appStore = useAppStore()
const settingsStore = useSettingsStore()

const dbPath = ref('')
const graphqlUrl = ref('')
const apiKey = ref('')
const isFileExists = ref<boolean | null>(null)
const createMissingMedia = ref(false)
const showBrowseDialog = ref(false)
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

const canSync = computed(() => Boolean(dbPath.value) && isFileExists.value !== false && !active.value)
const canPush = computed(() => Boolean(graphqlUrl.value.trim() && apiKey.value.trim()) && !active.value)

const phaseLabel = computed(() => {
  const key = `settings_labels.database.import_stash_phase_${phase.value}`
  const translated = t(key)
  return translated === key ? phase.value : translated
})

const lastSummaryText = computed(() => {
  if (!lastSummary.value) return ''
  if (mode.value === 'push' || 'pushed' in lastSummary.value) {
    return t('settings_labels.database.sync_push_complete', lastSummary.value)
  }
  return t('settings_labels.database.import_stash_complete', lastSummary.value)
})

function saveConnection() {
  setOption(dbPath.value.trim(), 'stashDbPath')
  setOption(graphqlUrl.value.trim(), 'stashGraphqlUrl')
  setOption(apiKey.value.trim(), 'stashApiKey')
  setOption(createMissingMedia.value ? '1' : '0', 'stashCreateMissingMedia')
  setNotification({
    type: 'success',
    text: t('settings_labels.database.sync_connection_saved'),
  })
}

function persistLastRun(kind: 'sync' | 'push', summary: Record<string, number>) {
  const at = new Date().toISOString()
  if (kind === 'sync') {
    setOption(at, 'stashLastSyncAt')
    setOption(JSON.stringify(summary), 'stashLastSyncSummary')
  } else {
    setOption(at, 'stashLastPushAt')
    setOption(JSON.stringify(summary), 'stashLastPushSummary')
  }
  lastSyncAt.value = at
}

const onPathInput = (value: string) => {
  dbPath.value = normalizePastedFilePath(value) as string
  isFileExists.value = null
  lastError.value = ''
}

const validatePath = async () => {
  const path = normalizePastedFilePath(dbPath.value) as string
  dbPath.value = path
  if (!path) {
    isFileExists.value = null
    return
  }
  isFileExists.value = await checkFileExists(path)
}

const selectFileNative = async () => {
  const selected = await showOpenDialog(['openFile'])
  if (!selected) return
  const first = String(selected).split('\n')[0]?.trim()
  if (!first) return
  dbPath.value = first
  await validatePath()
}

const onBrowseConfirm = async (paths: string[]) => {
  const next = paths[0]
  if (!next) return
  dbPath.value = normalizePastedFilePath(next) as string
  showBrowseDialog.value = false
  await validatePath()
}

const stopImport = () => {
  abortController?.abort()
}

async function runPull(createMissing: boolean, runMode: 'import' | 'sync') {
  if (active.value) return
  await validatePath()
  if (!dbPath.value || isFileExists.value === false) return
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
    await typedApi.streamStashImport(
      {
        path: dbPath.value,
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
            performers: Number(event.performers) || 0,
            studios: Number(event.studios) || 0,
            tags: Number(event.tags) || 0,
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
              : 'settings_labels.database.import_stash_success'),
          })
        } else if (event.type === 'error') {
          lastError.value = String(event.message || 'Stash import failed')
        }
      },
    )
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') {
      lastError.value = t('settings_labels.database.import_stash_cancelled')
    } else {
      lastError.value = (error as Error)?.message || String(error)
      console.error('Stash import failed:', error)
    }
  } finally {
    active.value = false
    abortController = null
    currentPath.value = ''
  }
}

const startImport = () => runPull(createMissingMedia.value, 'import')
const startSync = () => runPull(false, 'sync')

const startPush = async () => {
  if (!canPush.value) return
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
    await typedApi.streamStashPush(
      {
        graphqlUrl: graphqlUrl.value.trim(),
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
          lastError.value = String(event.message || 'Stash push failed')
        }
      },
    )
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') {
      lastError.value = t('settings_labels.database.sync_push_cancelled')
    } else {
      lastError.value = (error as Error)?.message || String(error)
      console.error('Stash push failed:', error)
    }
  } finally {
    active.value = false
    abortController = null
    currentPath.value = ''
  }
}

onMounted(async () => {
  dbPath.value = settingsStore.stashDbPath || ''
  graphqlUrl.value = settingsStore.stashGraphqlUrl || ''
  apiKey.value = settingsStore.stashApiKey || ''
  createMissingMedia.value = settingsStore.stashCreateMissingMedia === '1'
  lastSyncAt.value = settingsStore.stashLastPushAt || settingsStore.stashLastSyncAt || ''
  const rawSummary = settingsStore.stashLastPushSummary || settingsStore.stashLastSyncSummary
  if (rawSummary) {
    try {
      lastSummary.value = JSON.parse(rawSummary)
      mode.value = settingsStore.stashLastPushSummary ? 'push' : 'sync'
    } catch {
      lastSummary.value = null
    }
  }
  if (dbPath.value) await validatePath()
})
</script>
