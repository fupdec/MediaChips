<template>
  <div class="mx-4 pb-4">
    <settings-category-divider
      :title="t('settings_labels.database.find_missing_media')"
      icon="file-search-outline"
    />

    <v-alert
      type="info"
      variant="tonal"
      density="compact"
      rounded="xl"
      class="mb-4"
    >
      <span class="text-caption">
        {{ t('settings_labels.database.find_missing_media_hint') }}
      </span>
    </v-alert>

    <div class="text-body-2 mb-4">
      <template v-if="statusLoaded && status.missing != null">
        {{ t('settings_labels.database.find_missing_media_status', {
          missing: status.missing,
          total: status.total,
          withHash: status.withHash,
        }) }}
      </template>
      <template v-else-if="statusLoaded">
        {{ t('settings_labels.database.find_missing_media_status_not_loaded', {
          total: status.total,
        }) }}
      </template>
      <template v-else>
        {{ t('settings_labels.database.status_not_loaded') }}
      </template>
    </div>

    <div class="d-flex flex-wrap ga-2 mb-4">
      <v-btn
        @click="refreshStatus"
        :loading="statusLoading"
        :disabled="statusLoading || active"
        color="secondary"
        rounded
        variant="outlined"
        class="pr-4"
      >
        <v-icon icon="mdi-refresh" start/>
        {{ t('settings_labels.database.refresh_status') }}
      </v-btn>

      <v-btn
        v-if="appStore.isElectron"
        @click="selectFoldersNative"
        color="primary"
        rounded
        variant="outlined"
        class="pr-4"
        :disabled="active"
      >
        <v-icon icon="mdi-folder-open" start/>
        {{ t('media.adding.select_folders') }}
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

    <v-textarea
      :model-value="searchPaths"
      @update:model-value="onSearchPathsInput"
      :label="t('settings_labels.database.find_missing_media_paths_label')"
      :hint="t('media.adding.paths_hint')"
      :disabled="active"
      variant="outlined"
      rounded="lg"
      no-resize
      rows="4"
      class="mb-4"
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

    <div v-if="active && currentPath" class="text-caption text-medium-emphasis mb-4 selectable">
      {{ phaseLabel }} · {{ currentPath }}
    </div>

    <div v-if="active || lastSummary" class="text-caption text-medium-emphasis mb-4">
      <template v-if="active">
        {{ t('settings_labels.database.find_missing_media_progress', counters) }}
      </template>
      <template v-else-if="lastSummary">
        {{ t('settings_labels.database.find_missing_media_complete', lastSummary) }}
      </template>
    </div>

    <div class="d-flex flex-wrap ga-2 mb-4">
      <v-btn
        v-if="!active"
        @click="startSearch"
        :disabled="!canStart"
        color="primary"
        rounded
        variant="flat"
        class="pr-4"
      >
        <v-icon icon="mdi-magnify" start/>
        {{ t('settings_labels.database.find_missing_media_start') }}
      </v-btn>

      <v-btn
        v-else
        @click="stopSearch"
        color="error"
        rounded
        variant="flat"
        class="pr-4"
      >
        <v-icon icon="mdi-stop" start/>
        {{ t('common.stop') }}
      </v-btn>

      <v-btn
        v-if="matches.length > 0 && !active"
        @click="relinkSelected"
        :disabled="selectedIds.length === 0 || relinking"
        :loading="relinking"
        color="success"
        rounded
        variant="flat"
        class="pr-4"
      >
        <v-icon icon="mdi-folder-move" start/>
        {{ t('settings_labels.database.find_missing_media_relink', {count: selectedIds.length}) }}
      </v-btn>
    </div>

    <v-card v-if="matches.length > 0" variant="outlined" class="pa-2">
      <v-card-actions class="pa-0 px-2">
        <v-checkbox
          v-model="selectAll"
          :label="t('settings_labels.database.find_missing_media_select_all')"
          hide-details
          density="compact"
          @update:model-value="toggleSelectAll"
        />
      </v-card-actions>

      <v-virtual-scroll
        :height="Math.min(matches.length * 72, 360)"
        :items="matches"
        item-height="72"
      >
        <template #default="{ item }">
          <div class="match-row pa-2">
            <v-checkbox
              :model-value="selectedIds.includes(item.id)"
              hide-details
              density="compact"
              class="match-row__checkbox"
              @update:model-value="(value) => toggleMatch(item.id, value)"
            />

            <div class="match-row__content">
              <div class="d-flex align-center ga-2 mb-1">
                <v-chip
                  :color="item.confidence === 'hash' ? 'success' : 'warning'"
                  size="x-small"
                  label
                >
                  {{ item.confidence === 'hash'
                    ? t('settings_labels.database.find_missing_media_match_hash')
                    : t('settings_labels.database.find_missing_media_match_size') }}
                </v-chip>
              </div>

              <div class="text-caption selectable text-success">{{ item.newPath }}</div>
              <div class="text-caption selectable text-medium-emphasis">{{ item.oldPath }}</div>
            </div>
          </div>
        </template>
      </v-virtual-scroll>
    </v-card>

    <DialogBrowseFolder
      v-model="showBrowseDialog"
      multiple
      :header="t('media.adding.select_folders')"
      @confirm="onBrowseConfirm"
    />
  </div>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {useTasksStore} from '@/stores/tasks'
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'
import DialogBrowseFolder from '@/components/dialogs/DialogBrowseFolder.vue'
import {normalizePastedFilePathsText} from '@/utils/filePathInput'
import {showOpenDialog} from '@/services/electronDialogService'
import {setNotification} from '@/services/notificationService'
import type {
  MissingMediaMatch,
  MissingMediaSearchEvent,
  MissingMediaStatus,
  MissingMediaSummary,
  RelinkMissingMediaResponse,
} from '@/types/settings'

const {t} = useI18n()
const appStore = useAppStore()
const tasksStore = useTasksStore()

const status = ref<MissingMediaStatus>({
  total: 0,
  missing: null,
  withHash: null,
  withoutHash: null,
})
const statusLoaded = ref(false)
const statusLoading = ref(false)

const searchPaths = ref('')
const showBrowseDialog = ref(false)

const onSearchPathsInput = (value: string) => {
  searchPaths.value = normalizePastedFilePathsText(value) as string
}

const matches = ref<MissingMediaMatch[]>([])
const selectedIds = ref<Array<MissingMediaMatch['id']>>([])
const selectAll = ref(false)

const active = ref(false)
const relinking = ref(false)
const progress = ref(0)
const currentPath = ref('')
const currentPhase = ref('')
const lastSummary = ref<MissingMediaSummary | null>(null)
const counters = ref({
  scanned: 0,
  matched: 0,
  missing: 0,
})

let abortController: AbortController | null = null
let taskId: string | null = null

const canStart = computed(() => (
  (status.value.missing ?? 0) > 0 &&
  searchPaths.value.trim().length > 0
))

const phaseLabel = computed(() => {
  if (currentPhase.value === 'loading_missing') {
    return t('settings_labels.database.find_missing_media_phase_loading')
  }
  return t('settings_labels.database.find_missing_media_phase_scanning')
})

const parsePaths = () => searchPaths.value
  .split('\n')
  .map((item) => item.trim())
  .filter(Boolean)

const fetchStatus = async (full = true) => {
  const query = full ? '?full=true' : ''
  const response = await fetch(`${appStore.localhost}/api/Task/missingMediaStatus${query}`)

  if (!response.ok) {
    throw new Error(response.statusText || 'Failed to load missing media status')
  }

  status.value = await response.json() as MissingMediaStatus
  statusLoaded.value = true
}

const refreshStatus = async () => {
  statusLoading.value = true
  try {
    await fetchStatus(true)
  } catch (error) {
    console.error('Failed to load missing media status:', error)
  } finally {
    statusLoading.value = false
  }
}

const onBrowseConfirm = (paths: string[]) => {
  if (!paths.length) return
  const existing = parsePaths()
  searchPaths.value = [...new Set([...existing, ...paths])].join('\n')
}

const selectFoldersNative = async () => {
  const paths = await showOpenDialog(['openDirectory', 'multiSelections'])
  if (!paths?.length) return
  const existing = parsePaths()
  const nativePaths = String(paths).split('\n').map((p) => p.trim()).filter(Boolean)
  searchPaths.value = [...new Set([...existing, ...nativePaths])].join('\n')
}

const toggleMatch = (id: MissingMediaMatch['id'], value: boolean | null) => {
  if (value) {
    if (!selectedIds.value.includes(id)) {
      selectedIds.value = [...selectedIds.value, id]
    }
  } else {
    selectedIds.value = selectedIds.value.filter((item) => item !== id)
  }

  selectAll.value = selectedIds.value.length === matches.value.length && matches.value.length > 0
}

const toggleSelectAll = (value: boolean | null) => {
  selectedIds.value = value ? matches.value.map((item) => item.id) : []
}

watch(matches, (items) => {
  selectedIds.value = items.map((item) => item.id)
  selectAll.value = items.length > 0
})

const stopSearch = () => {
  abortController?.abort()
}

const startSearch = async () => {
  const folders = parsePaths()
  if (!folders.length || active.value) return

  active.value = true
  progress.value = 0
  currentPath.value = ''
  currentPhase.value = 'loading_missing'
  lastSummary.value = null
  matches.value = []
  selectedIds.value = []
  counters.value = {
    scanned: 0,
    matched: 0,
    missing: status.value.missing ?? 0,
  }

  abortController = new AbortController()

  taskId = tasksStore.setTask({
    title: t('settings_labels.database.find_missing_media'),
    subtitle: t('settings_labels.database.find_missing_media_progress', counters.value),
    icon: 'file-search-outline',
    progress: 0,
    action: stopSearch,
  })

  try {
    const response = await fetch(`${appStore.localhost}/api/Task/streamFindMissingMedia`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      signal: abortController.signal,
      body: JSON.stringify({folders}),
    })

    if (!response.ok || !response.body) {
      throw new Error(response.statusText || 'Missing media search request failed')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    const handleEvent = (event: MissingMediaSearchEvent) => {
      if (event.type === 'progress') {
        currentPhase.value = event.phase || currentPhase.value
        counters.value = {
          scanned: event.scanned || counters.value.scanned,
          matched: event.matched || matches.value.length,
          missing: event.missing ?? counters.value.missing,
        }
        currentPath.value = event.current || currentPath.value

        if (event.phase === 'loading_missing' && event.total) {
          progress.value = Math.min((event.processed! / event.total) * 20, 20)
        } else if (event.scanned) {
          progress.value = Math.min(20 + (event.scanned % 1000) / 10, 95)
        }

        if (taskId) {
          tasksStore.updateTask(taskId, {
            subtitle: t('settings_labels.database.find_missing_media_progress', counters.value),
            progress: progress.value,
          })
        }
      }

      if (event.type === 'match' && event.match) {
        matches.value = [...matches.value, event.match]
        counters.value.matched = matches.value.length
      }

      if (event.type === 'complete') {
        if (Array.isArray(event.matches) && event.matches.length) {
          matches.value = event.matches
        }

        lastSummary.value = {
          scanned: event.scanned || 0,
          matched: event.matched || matches.value.length,
          missing: event.missing || 0,
          stopped: event.stopped === true,
        }
        progress.value = 100

        if (taskId) {
          tasksStore.updateTask(taskId, {
            subtitle: event.stopped
              ? t('common.stop')
              : t('settings_labels.database.find_missing_media_complete', lastSummary.value),
            progress: 100,
            color: event.stopped ? 'warning' : 'success',
            done: true,
            action: () => {},
          })
        }
      }

      if (event.type === 'error') {
        throw new Error(event.message || 'Missing media search failed')
      }
    }

    while (true) {
      const {value, done} = await reader.read()
      if (done) break

      buffer += decoder.decode(value, {stream: true})
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue
        handleEvent(JSON.parse(line) as MissingMediaSearchEvent)
      }
    }

    if (buffer.trim()) {
      handleEvent(JSON.parse(buffer) as MissingMediaSearchEvent)
    }

    await fetchStatus()
  } catch (error) {
    const err = error as Error
    if (err.name !== 'AbortError') {
      console.error('Missing media search failed:', error)
      setNotification({
        type: 'error',
        title: t('settings_labels.database.find_missing_media'),
        text: err.message,
      })

      if (taskId) {
        tasksStore.updateTask(taskId, {
          subtitle: err.message,
          color: 'error',
          done: true,
          action: () => {},
        })
      }
    } else if (taskId) {
      tasksStore.updateTask(taskId, {
        subtitle: t('common.stop'),
        color: 'warning',
        done: true,
        action: () => {},
      })
    }
  } finally {
    active.value = false
    abortController = null
    currentPath.value = ''
    await fetchStatus().catch(() => {})
  }
}

const relinkSelected = async () => {
  const selectedMatches = matches.value.filter((item) => selectedIds.value.includes(item.id))
  if (!selectedMatches.length || relinking.value) return

  relinking.value = true

  try {
    const response = await fetch(`${appStore.localhost}/api/Task/relinkMissingMedia`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({matches: selectedMatches}),
    })

    if (!response.ok) {
      throw new Error(response.statusText || 'Failed to relink media paths')
    }

    const data = await response.json() as RelinkMissingMediaResponse
    const relinkedIds = new Set(selectedMatches.map((item) => item.id))
    matches.value = matches.value.filter((item) => !relinkedIds.has(item.id))
    selectedIds.value = matches.value.map((item) => item.id)
    selectAll.value = matches.value.length > 0

    setNotification({
      type: 'success',
      title: t('settings_labels.database.find_missing_media_relink_done'),
      text: t('settings_labels.database.find_missing_media_relink_done_text', {
        count: data.updated || selectedMatches.length,
      }),
    })

    await fetchStatus()
  } catch (error) {
    const err = error as Error
    console.error('Failed to relink missing media:', error)
    setNotification({
      type: 'error',
      title: t('settings_labels.database.find_missing_media_relink_done'),
      text: err.message,
    })
  } finally {
    relinking.value = false
  }
}
</script>

<style scoped>
.selectable {
  user-select: text;
  word-break: break-all;
}

.match-row {
  display: flex;
  gap: 8px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.match-row__checkbox {
  flex: 0 0 auto;
  margin-top: 2px;
}

.match-row__content {
  min-width: 0;
}
</style>
