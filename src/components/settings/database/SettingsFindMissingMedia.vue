<template>
  <SettingsHealthTask id="settings-find-missing-media">
    <SettingsHealthSectionHeader
      documentation-id="settings.files.find_missing"
      :title="t('settings_labels.database.find_missing_media')"
      icon="file-search-outline"
      :hint="t('settings_labels.database.find_missing_media_hint')"
    />

    <v-form class="search-form" @submit.prevent="startSearch">
      <v-text-field
        v-model="originalFolder"
        :label="t('maintenanceView.originalFolder')"
        :hint="t('maintenanceView.originalFolderHint')"
        :disabled="active || relinking"
        persistent-hint
        variant="outlined"
        rounded="lg"
      />

      <div>
        <v-textarea
          :model-value="searchPaths"
          :label="t('maintenanceView.searchFolders')"
          :hint="t('media.adding.paths_hint')"
          :disabled="active || relinking"
          persistent-hint
          variant="outlined"
          rounded="lg"
          auto-grow
          rows="2"
          max-rows="6"
          @update:model-value="onSearchPathsInput"
        />
        <div class="d-flex flex-wrap ga-2 mt-2">
          <v-btn
            v-if="appStore.isElectron"
            :disabled="active || relinking"
            color="primary"
            variant="tonal"
            rounded
            prepend-icon="mdi-folder-open-outline"
            @click="selectFoldersNative"
          >
            {{ t('media.adding.select_folders') }}
          </v-btn>
          <v-btn
            :disabled="active || relinking"
            color="primary"
            :variant="appStore.isElectron ? 'text' : 'tonal'"
            rounded
            prepend-icon="mdi-folder-search-outline"
            @click="showBrowseDialog = true"
          >
            {{ t('media.adding.browse_folders') }}
          </v-btn>
        </div>
      </div>

      <div class="search-actions">
        <v-btn
          v-if="active"
          :disabled="stopping"
          color="error"
          variant="tonal"
          rounded
          prepend-icon="mdi-stop"
          @click="stopSearch"
        >
          {{ t(stopping ? 'maintenanceView.stoppingSearch' : 'common.stop') }}
        </v-btn>
        <v-btn
          v-else
          :disabled="!canStart"
          type="submit"
          color="primary"
          variant="flat"
          rounded
          prepend-icon="mdi-magnify"
        >
          {{ t('settings_labels.database.find_missing_media_start') }}
        </v-btn>
      </div>
    </v-form>

    <div v-if="active" class="search-status mt-4">
      <div role="status">
        <div class="text-subtitle-2">{{ phaseLabel }}</div>
        <div class="text-caption text-medium-emphasis">
          {{ t('settings_labels.database.find_missing_media_progress', counters) }}
        </div>
      </div>
      <v-progress-linear
        :model-value="progress"
        :indeterminate="!hasKnownProgress"
        :aria-label="phaseLabel"
        color="primary"
        height="4"
        rounded
        class="mt-2"
      />
      <div v-if="currentPath" class="file-path text-caption text-medium-emphasis mt-2">{{ currentPath }}</div>
    </div>

    <v-alert v-if="searchError" type="error" variant="tonal" density="compact" class="mt-4">
      {{ searchError }}
    </v-alert>

    <div v-if="!active && lastSummary" class="search-status mt-4" role="status">
      <div v-if="lastSummary.stopped" class="text-subtitle-2">{{ t('maintenanceView.searchStopped') }}</div>
      <div v-else-if="relinkedCount && !matches.length" class="text-subtitle-2">
        {{ t('settings_labels.database.find_missing_media_relink_done') }}
      </div>
      <div v-else-if="!lastSummary.missing" class="text-subtitle-2">{{ t('maintenanceView.noMissingFiles') }}</div>
      <div v-else-if="!matches.length" class="text-subtitle-2">{{ t('maintenanceView.noFileMatches') }}</div>
      <div class="text-caption text-medium-emphasis">{{ t('maintenanceView.searchSummary', lastSummary) }}</div>
      <div v-if="relinkedCount" class="text-caption text-success">
        {{ t('settings_labels.database.find_missing_media_relink_done_text', {count: relinkedCount}) }}
      </div>
    </div>

    <section v-if="!active && matches.length" class="match-review mt-4" aria-labelledby="missing-media-review">
      <div class="match-review__header">
        <h3 id="missing-media-review" class="text-subtitle-1 font-weight-medium">
          {{ t('maintenanceView.reviewMatches') }}
        </h3>
        <p class="text-body-2 text-medium-emphasis mt-1">{{ t('maintenanceView.relinkHint') }}</p>
        <v-alert type="warning" variant="tonal" density="compact" class="mt-3">
          {{ t('media.relink.weak_selection') }}
        </v-alert>
        <v-checkbox
          v-if="bulkMatches.length"
          :model-value="allBulkSelected"
          :indeterminate="someBulkSelected && !allBulkSelected"
          :label="t('maintenanceView.confirmUniqueMatches')"
          :disabled="relinking"
          hide-details
          density="compact"
          @update:model-value="toggleSelectAll"
        />
      </div>

      <ul class="match-list">
        <li v-for="item in matches" :key="item.id" class="match-row">
          <v-checkbox
            :model-value="selectedIdSet.has(item.id)"
            :aria-label="item.oldPath"
            :disabled="!item.newPath || relinking"
            hide-details
            density="compact"
            class="match-row__checkbox"
            @update:model-value="(value) => toggleMatch(item.id, value)"
          />

          <div class="match-row__content">
            <v-chip :color="item.confidence === 'oshash' ? 'success' : 'warning'" size="x-small" label>
              {{ item.confidence === 'oshash'
                ? t('settings_labels.database.find_missing_media_match_hash')
                : t('settings_labels.database.find_missing_media_match_size') }}
            </v-chip>
            <div class="file-path text-body-2 text-medium-emphasis mt-1">
              {{ t('maintenanceView.oldPath', {path: item.oldPath}) }}
            </div>
            <v-select
              v-if="item.ambiguous"
              v-model="item.newPath"
              :items="item.candidatePaths || []"
              :label="t('media.relink.choose_candidate')"
              :disabled="relinking"
              density="compact"
              variant="outlined"
              hide-details
              class="mt-2"
              @update:model-value="toggleMatch(item.id, false)"
            />
            <div v-if="item.newPath" class="file-path text-body-2 mt-1">
              {{ t('maintenanceView.newPath', {path: item.newPath}) }}
            </div>
          </div>
        </li>
      </ul>

      <div class="match-review__footer">
        <span class="text-body-2 text-medium-emphasis" role="status">
          {{ t('maintenanceView.selectedMatches', {count: selectedIds.length, total: matches.length}) }}
        </span>
        <v-btn
          :disabled="!selectedIds.length || relinking"
          :loading="relinking"
          color="primary"
          rounded
          variant="flat"
          prepend-icon="mdi-folder-move-outline"
          @click="relinkSelected"
        >
          {{ t('settings_labels.database.find_missing_media_relink', {count: selectedIds.length}) }}
        </v-btn>
      </div>
    </section>

    <DialogBrowseFolder
      v-model="showBrowseDialog"
      multiple
      :header="t('media.adding.select_folders')"
      @confirm="onBrowseConfirm"
    />
  </SettingsHealthTask>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {useTasksStore} from '@/stores/tasks'
import {typedApi} from '@/services/typedApi'
import SettingsHealthSectionHeader from '@/components/settings/database/SettingsHealthSectionHeader.vue'
import SettingsHealthTask from '@/components/settings/database/SettingsHealthTask.vue'
import DialogBrowseFolder from '@/components/dialogs/DialogBrowseFolder.vue'
import {normalizePastedFilePathsText} from '@/utils/filePathInput'
import {showOpenDialog} from '@/services/electronDialogService'
import {setNotification} from '@/services/notificationService'
import type {
  MissingMediaMatch,
  MissingMediaSearchEvent,
  MissingMediaSummary,
} from '@/types/settings'

const {t} = useI18n()
const appStore = useAppStore()
const tasksStore = useTasksStore()

const originalFolder = ref('')
const searchPaths = ref('')
const showBrowseDialog = ref(false)

const onSearchPathsInput = (value: string) => {
  searchPaths.value = normalizePastedFilePathsText(value) as string
}

const matches = ref<MissingMediaMatch[]>([])
const selectedIds = ref<Array<MissingMediaMatch['id']>>([])
const selectedIdSet = computed(() => new Set(selectedIds.value))
const searchError = ref('')
const relinkedCount = ref(0)

const active = ref(false)
const stopping = ref(false)
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
  originalFolder.value.trim().length > 0 &&
  searchFolders.value.length > 0 &&
  !relinking.value
))

const hasKnownProgress = computed(() => currentPhase.value === 'loading_missing' && progress.value > 0)

const phaseLabel = computed(() => {
  if (stopping.value) return t('maintenanceView.stoppingSearch')
  if (currentPhase.value === 'loading_missing') {
    return t('maintenanceView.checkingFolder')
  }
  return t('settings_labels.database.find_missing_media_phase_scanning')
})

const searchFolders = computed(() => [...new Set(searchPaths.value
  .split('\n')
  .map((item) => item.trim())
  .filter(Boolean))])

const onBrowseConfirm = (paths: string[]) => {
  if (!paths.length) return
  const existing = searchFolders.value
  searchPaths.value = [...new Set([...existing, ...paths])].join('\n')
}

const selectFoldersNative = async () => {
  const paths = await showOpenDialog(['openDirectory', 'multiSelections'])
  if (!paths?.length) return
  const existing = searchFolders.value
  const nativePaths = String(paths).split('\n').map((p) => p.trim()).filter(Boolean)
  searchPaths.value = [...new Set([...existing, ...nativePaths])].join('\n')
}

const bulkMatches = computed(() => {
  const pathCounts = new Map<string, number>()
  for (const item of matches.value) {
    const paths = item.ambiguous ? item.candidatePaths ?? [] : [item.newPath]
    for (const path of paths) pathCounts.set(path, (pathCounts.get(path) ?? 0) + 1)
  }
  return matches.value.filter((item) => !item.ambiguous && item.newPath && pathCounts.get(item.newPath) === 1)
})
const allBulkSelected = computed(() => bulkMatches.value.every((item) => selectedIdSet.value.has(item.id)))
const someBulkSelected = computed(() => bulkMatches.value.some((item) => selectedIdSet.value.has(item.id)))

const toggleMatch = (id: MissingMediaMatch['id'], value: boolean | null) => {
  const match = matches.value.find((item) => item.id === id)
  selectedIds.value = matches.value
    .filter((item) => selectedIdSet.value.has(item.id) && item.id !== id && (!value || item.newPath !== match?.newPath))
    .map((item) => item.id)
  if (value && match?.newPath) selectedIds.value.push(id)
}

const toggleSelectAll = (value: boolean | null) => {
  const bulkIds = new Set(bulkMatches.value.map((item) => item.id))
  const individualIds = selectedIds.value.filter((id) => !bulkIds.has(id))
  selectedIds.value = value ? [...individualIds, ...bulkIds] : individualIds
}

const stopSearch = () => {
  if (!abortController) return
  stopping.value = true
  abortController.abort()
}

const startSearch = async () => {
  const folders = searchFolders.value
  const previousFolder = originalFolder.value.trim()
  if (!canStart.value || !folders.length || active.value) return

  active.value = true
  searchError.value = ''
  relinkedCount.value = 0
  progress.value = 0
  currentPath.value = ''
  currentPhase.value = 'loading_missing'
  lastSummary.value = null
  matches.value = []
  selectedIds.value = []
  counters.value = {
    scanned: 0,
    matched: 0,
    missing: 0,
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
    const handleEvent = (event: MissingMediaSearchEvent) => {
      if (event.type === 'phase') currentPhase.value = event.phase

      if (event.type === 'progress') {
        currentPhase.value = event.phase || currentPhase.value
        counters.value = {
          scanned: event.scanned ?? counters.value.scanned,
          matched: event.matched ?? matches.value.length,
          missing: event.missing ?? counters.value.missing,
        }
        currentPath.value = event.current || currentPath.value

        if (event.phase === 'loading_missing' && event.total) {
          progress.value = Math.min(((event.processed ?? 0) / event.total) * 100, 100)
        }

        if (taskId) {
          tasksStore.updateTask(taskId, {
            subtitle: t('settings_labels.database.find_missing_media_progress', counters.value),
            progress: hasKnownProgress.value ? progress.value : 0,
          })
        }
      }

      if (event.type === 'match' && event.match) {
        matches.value.push(event.match)
        counters.value.matched = matches.value.length
      }

      if (event.type === 'complete') {
        if (Array.isArray(event.matches)) {
          matches.value = event.matches
        }

        lastSummary.value = {
          scanned: event.scanned ?? 0,
          matched: event.matched ?? matches.value.length,
          missing: event.missing ?? 0,
          stopped: event.stopped === true,
        }
        progress.value = 100

        if (taskId) {
          tasksStore.updateTask(taskId, {
            subtitle: event.stopped
              ? t('maintenanceView.searchStopped')
              : t('maintenanceView.searchSummary', lastSummary.value),
            progress: 100,
            color: event.stopped ? 'warning' : 'success',
            done: true,
            action: undefined,
          })
        }
      }

      if (event.type === 'error') {
        throw new Error(event.message || 'Missing media search failed')
      }
    }

    await typedApi.streamFindMissingMedia(
      {folders, originalFolder: previousFolder},
      {signal: abortController.signal},
      handleEvent as (event: import('@/services/typedApi/tasks').GenerationStreamEvent) => void,
    )
    if (!lastSummary.value && !stopping.value) throw new Error(t('maintenanceView.searchIncomplete'))
  } catch (error) {
    const err = error as Error
    if (err.name !== 'AbortError' && !stopping.value) {
      console.error('Missing media search failed:', error)
      searchError.value = t('maintenanceView.searchFailed', {message: err.message})

      if (taskId) {
        tasksStore.updateTask(taskId, {
          subtitle: err.message,
          color: 'error',
          done: true,
          action: undefined,
        })
      }
    }
  } finally {
    if (stopping.value && !lastSummary.value) {
      lastSummary.value = {...counters.value, stopped: true}
      if (taskId) {
        tasksStore.updateTask(taskId, {
          subtitle: t('maintenanceView.searchStopped'),
          color: 'warning',
          done: true,
          action: undefined,
        })
      }
    }
    stopping.value = false
    taskId = null
    active.value = false
    abortController = null
    currentPath.value = ''
  }
}

const relinkSelected = async () => {
  const selectedMatches = matches.value.filter((item) => selectedIdSet.value.has(item.id))
  if (!selectedMatches.length || relinking.value) return

  relinking.value = true

  try {
    const {data} = await typedApi.relinkMissingMedia({matches: selectedMatches.map((item) => ({...item, confirmedOriginal: true}))})
    const relinkedIds = new Set(selectedMatches.map((item) => item.id))
    matches.value = matches.value.filter((item) => !relinkedIds.has(item.id))
    selectedIds.value = []
    relinkedCount.value += data.updated ?? selectedMatches.length

    setNotification({
      type: 'success',
      title: t('settings_labels.database.find_missing_media_relink_done'),
      text: t('settings_labels.database.find_missing_media_relink_done_text', {
        count: data.updated ?? selectedMatches.length,
      }),
    })
  } catch (error) {
    const err = error as Error
    console.error('Failed to relink missing media:', error)
    setNotification({
      type: 'error',
      title: t('maintenanceView.relinkFailed'),
      text: err.message,
    })
  } finally {
    relinking.value = false
  }
}
</script>

<style scoped>
.search-form {
  display: grid;
  gap: 16px;
}

.search-actions {
  display: flex;
  justify-content: flex-end;
}

.search-status,
.match-review {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 12px;
  background: rgb(var(--v-theme-surface));
}

.search-status,
.match-review__header,
.match-review__footer {
  padding: 12px;
}

.match-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 28rem;
  overflow-y: auto;
  border-block: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.match-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
}

.match-row + .match-row {
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.match-row__checkbox {
  flex: 0 0 auto;
}

.match-row__content {
  flex: 1;
  min-width: 0;
}

.file-path {
  user-select: text;
  overflow-wrap: anywhere;
}

.match-review__footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
</style>
