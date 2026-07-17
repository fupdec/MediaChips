<template>
  <div id="settings-import-stash" class="mx-4 pb-4">
    <settings-category-divider
      :title="t('settings_labels.database.import_stash')"
      icon="database-import"
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

    <v-checkbox
      v-model="createMissingMedia"
      :label="t('settings_labels.database.import_stash_create_missing')"
      density="compact"
      hide-details
      class="mb-4"
      :disabled="active"
    />

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

    <div v-if="lastSummary" class="text-body-2 mb-4">
      {{ t('settings_labels.database.import_stash_complete', lastSummary) }}
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
      <v-btn
        v-if="!active"
        @click="startImport"
        :disabled="!canStart"
        color="primary"
        rounded
        variant="flat"
        class="pr-4"
      >
        <v-icon icon="mdi-play" start/>
        {{ t('settings_labels.database.import_stash_start') }}
      </v-btn>

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
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'
import DialogBrowseFolder from '@/components/dialogs/DialogBrowseFolder.vue'
import {showOpenDialog} from '@/services/electronDialogService'
import {normalizePastedFilePath} from '@/utils/filePathInput'
import {checkFileExists} from '@/services/fileService'
import {setNotification} from '@/services/notificationService'
import {API_ROUTES} from '@shared/api/routes'

const {t} = useI18n()
const appStore = useAppStore()

const dbPath = ref('')
const isFileExists = ref<boolean | null>(null)
const createMissingMedia = ref(true)
const showBrowseDialog = ref(false)
const active = ref(false)
const currentPath = ref('')
const phase = ref('')
const lastError = ref('')
const lastSummary = ref<Record<string, number> | null>(null)
const counters = ref({processed: 0, total: 0})

let abortController: AbortController | null = null

const progress = computed(() => {
  if (!counters.value.total) return 0
  return Math.min(100, Math.round((counters.value.processed / counters.value.total) * 100))
})

const canStart = computed(() => Boolean(dbPath.value) && isFileExists.value !== false && !active.value)

const phaseLabel = computed(() => {
  const key = `settings_labels.database.import_stash_phase_${phase.value}`
  const translated = t(key)
  return translated === key ? phase.value : translated
})

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

const startImport = async () => {
  if (active.value) return
  await validatePath()
  if (!dbPath.value || isFileExists.value === false) return

  active.value = true
  lastError.value = ''
  lastSummary.value = null
  currentPath.value = ''
  phase.value = 'starting'
  counters.value = {processed: 0, total: 0}
  abortController = new AbortController()

  try {
    const response = await fetch(`${appStore.localhost}${API_ROUTES.taskStreamImportFromStash}`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      signal: abortController.signal,
      body: JSON.stringify({
        path: dbPath.value,
        createMissingMedia: createMissingMedia.value,
      }),
    })

    if (!response.ok || !response.body) {
      throw new Error(response.statusText || 'Stash import failed')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const {done, value} = await reader.read()
      if (done) break
      buffer += decoder.decode(value, {stream: true})
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        let event: Record<string, unknown>
        try {
          event = JSON.parse(trimmed) as Record<string, unknown>
        } catch {
          continue
        }

        if (event.type === 'progress') {
          phase.value = String(event.phase || '')
          counters.value = {
            processed: Number(event.processed) || 0,
            total: Number(event.total) || 0,
          }
          currentPath.value = event.current ? String(event.current) : ''
        } else if (event.type === 'complete') {
          lastSummary.value = {
            performers: Number(event.performers) || 0,
            studios: Number(event.studios) || 0,
            tags: Number(event.tags) || 0,
            mediaCreated: Number(event.mediaCreated) || 0,
            mediaMatched: Number(event.mediaMatched) || 0,
            mediaUpdated: Number(event.mediaUpdated) || 0,
            mediaSkipped: Number(event.mediaSkipped) || 0,
            markers: Number(event.markers) || 0,
          }
                          setNotification({
                            type: 'success',
                            text: t('settings_labels.database.import_stash_success'),
                          })
        } else if (event.type === 'error') {
          lastError.value = String(event.message || 'Stash import failed')
        }
      }
    }
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
</script>
