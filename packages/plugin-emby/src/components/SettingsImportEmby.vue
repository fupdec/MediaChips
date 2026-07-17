<template>
  <div id="settings-import-emby" class="mx-4 pb-4">
    <settings-category-divider
      :title="t('settings_labels.database.import_emby')"
      icon="television-box"
    />

    <v-alert
      type="info"
      variant="tonal"
      density="compact"
      rounded="xl"
      class="mb-4"
    >
      <span class="text-caption">
        {{ t('settings_labels.database.import_emby_hint') }}
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
        {{ t('settings_labels.database.import_emby_backup_warning') }}
      </span>
    </v-alert>

    <v-text-field
      v-model="baseUrl"
      :label="t('settings_labels.database.import_emby_url')"
      :hint="t('settings_labels.database.import_emby_url_hint')"
      persistent-hint
      variant="outlined"
      density="comfortable"
      rounded="lg"
      class="mb-2"
      :disabled="active"
    />

    <v-text-field
      v-model="apiKey"
      :label="t('settings_labels.database.import_emby_api_key')"
      :hint="t('settings_labels.database.import_emby_api_key_hint')"
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
        {{ t('settings_labels.database.import_emby_load_libraries') }}
      </v-btn>
    </div>

    <v-select
      v-if="libraries.length"
      v-model="selectedLibraryIds"
      :items="libraryItems"
      item-title="title"
      item-value="value"
      :label="t('settings_labels.database.import_emby_libraries')"
      :hint="t('settings_labels.database.import_emby_libraries_hint')"
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
      :label="t('settings_labels.database.import_emby_create_missing')"
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
      {{ t('settings_labels.database.import_emby_progress', {
        phase: phaseLabel,
        processed: counters.processed,
        total: counters.total,
      }) }}
    </div>

    <div v-if="active && currentPath" class="text-caption text-medium-emphasis mb-4 selectable">
      {{ currentPath }}
    </div>

    <div v-if="lastSummary" class="text-body-2 mb-4">
      {{ t('settings_labels.database.import_emby_complete', lastSummary) }}
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
        {{ t('settings_labels.database.import_emby_start') }}
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
  </div>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'
import {setNotification} from '@/services/notificationService'

const LIST_LIBRARIES_PATH = '/api/emby/listLibraries'
const STREAM_IMPORT_PATH = '/api/emby/streamImport'

const {t} = useI18n()
const appStore = useAppStore()

const baseUrl = ref('')
const apiKey = ref('')
const createMissingMedia = ref(true)
const libraries = ref<Array<{id: string; name: string}>>([])
const selectedLibraryIds = ref<string[]>([])
const loadingLibraries = ref(false)
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

const canLoadLibraries = computed(() => Boolean(baseUrl.value.trim() && apiKey.value.trim()))
const canStart = computed(() => canLoadLibraries.value && !active.value)

const libraryItems = computed(() =>
  libraries.value.map((lib) => ({title: lib.name, value: lib.id})),
)

const phaseLabel = computed(() => {
  const key = `settings_labels.database.import_emby_phase_${phase.value}`
  const translated = t(key)
  return translated === key ? phase.value : translated
})

const stopImport = () => {
  abortController?.abort()
}

const loadLibraries = async () => {
  if (!canLoadLibraries.value || loadingLibraries.value) return
  loadingLibraries.value = true
  lastError.value = ''
  try {
    const response = await fetch(`${appStore.localhost}${LIST_LIBRARIES_PATH}`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        baseUrl: baseUrl.value.trim(),
        apiKey: apiKey.value.trim(),
      }),
    })
    const payload = await response.json() as {
      ok?: boolean
      libraries?: Array<{id: string; name: string}>
      error?: string
    }
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || response.statusText || 'Failed to load libraries')
    }
    libraries.value = payload.libraries || []
    selectedLibraryIds.value = libraries.value.map((lib) => lib.id)
  } catch (error) {
    lastError.value = (error as Error)?.message || String(error)
    libraries.value = []
    selectedLibraryIds.value = []
  } finally {
    loadingLibraries.value = false
  }
}

const startImport = async () => {
  if (active.value || !canStart.value) return

  active.value = true
  lastError.value = ''
  lastSummary.value = null
  currentPath.value = ''
  phase.value = 'starting'
  counters.value = {processed: 0, total: 0}
  abortController = new AbortController()

  try {
    const response = await fetch(`${appStore.localhost}${STREAM_IMPORT_PATH}`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      signal: abortController.signal,
      body: JSON.stringify({
        baseUrl: baseUrl.value.trim(),
        apiKey: apiKey.value.trim(),
        libraryIds: selectedLibraryIds.value.length ? selectedLibraryIds.value : undefined,
        createMissingMedia: createMissingMedia.value,
      }),
    })

    if (!response.ok || !response.body) {
      throw new Error(response.statusText || 'Emby import failed')
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
          setNotification({
            type: 'success',
            text: t('settings_labels.database.import_emby_success'),
          })
        } else if (event.type === 'error') {
          lastError.value = String(event.message || 'Emby import failed')
        }
      }
    }
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') {
      lastError.value = t('settings_labels.database.import_emby_cancelled')
    } else {
      lastError.value = (error as Error)?.message || String(error)
      console.error('Emby import failed:', error)
    }
  } finally {
    active.value = false
    abortController = null
    currentPath.value = ''
  }
}
</script>
