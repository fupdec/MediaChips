<template>
  <div class="watched-folders mx-4">
    <settings-category-divider
      :title="t('settings_labels.tools.folders')"
      icon="folder-eye-outline"
    />

    <p class="watched-folders__hint text-caption text-medium-emphasis mb-4">
      {{ t('settings_labels.tools.watch_folders_hint') }}
      {{ ' ' }}
      {{ t('settings_labels.tools.watch_folders_slow_warning') }}
    </p>

    <settings-switch
      :disabled="watcherStore.busy"
      option="watchFolders"
      icon-text="eye-outline"
      icon-color="primary"
      :title="t('settings_labels.tools.watch_folders')"
      :hint="t('settings_labels.tools.watch_folders_scan_warning')"
    />

    <div class="watched-folders__toolbar mb-4">
      <v-btn
        color="success"
        class="pr-4"
        rounded="pill"
        variant="flat"
        @click="openAddFolderDialog"
      >
        <v-icon start>mdi-plus</v-icon>
        {{ t('settings_labels.tools.add_folder') }}
      </v-btn>

      <v-btn
        color="primary"
        class="pr-4"
        rounded="pill"
        variant="tonal"
        :disabled="!canRescanFolders || watcherStore.busy"
        :loading="watcherStore.busy"
        @click="rescanWatchedFolders"
      >
        <v-icon start>mdi-folder-sync-outline</v-icon>
        {{ t('settings_labels.tools.rescan_folders') }}
      </v-btn>

      <div
        v-if="watcherStore.folders.length"
        class="watched-folders__summary text-caption text-medium-emphasis"
      >
        <span class="watched-folders__summary-count">{{ watcherStore.folders.length }}</span>
        <span>{{ watchingSummary }}</span>
      </div>
    </div>

    <div class="watched-folders__list">
      <div
        v-if="!watcherStore.folders.length"
        class="settings-empty text-center py-10 px-4"
      >
        <div class="settings-empty__icon mb-3" aria-hidden="true">
          <v-icon icon="mdi-folder-eye-outline" size="28"/>
        </div>
        <div class="text-body-1 font-weight-medium mb-1">
          {{ t('settings_labels.tools.folders_empty') }}
        </div>
        <div class="text-caption text-medium-emphasis">
          {{ t('settings_labels.tools.folders_empty_hint') }}
        </div>
      </div>

      <div
        v-for="folder in watcherStore.folders"
        :key="folder.id ?? folder.path"
        class="watched-folders-card"
        :class="{
          'watched-folders-card--watching': isFolderWatchEnabled(folder),
          'watched-folders-card--paused': !isFolderWatchEnabled(folder),
        }"
      >
        <button
          type="button"
          class="watched-folders-card__icon"
          :aria-label="isFolderWatchEnabled(folder)
            ? t('settings_labels.tools.watching')
            : t('settings_labels.tools.paused')"
          @click="toggleFolderWatch(folder)"
        >
          <v-icon size="20" :icon="folderIconMdi(folder.icon)"/>
        </button>

        <div class="watched-folders-card__meta">
          <div class="watched-folders-card__title-row">
            <span class="watched-folders-card__title">
              {{ folder.name || folder.path }}
            </span>
            <v-chip
              size="x-small"
              variant="tonal"
              :color="isFolderWatchEnabled(folder) ? 'success' : 'warning'"
              class="watched-folders-card__badge"
            >
              {{ isFolderWatchEnabled(folder)
                ? t('settings_labels.tools.watching')
                : t('settings_labels.tools.paused') }}
            </v-chip>
          </div>

          <div class="watched-folders-card__stats">
            <span
              class="watched-folders-card__stat watched-folders-card__stat--mono"
              :title="folder.path"
            >
              {{ folder.path }}
            </span>
            <span
              v-if="(folder.excludedPaths || []).length"
              class="watched-folders-card__stat"
            >
              <v-icon icon="mdi-folder-cancel-outline" size="14" class="mr-1"/>
              {{ t('settings_labels.tools.excludes_count', {
                count: (folder.excludedPaths || []).length,
              }) }}
            </span>
            <span
              v-for="type in folder.types"
              :key="type.id"
              class="watched-folders-card__stat"
            >
              <v-icon size="14" class="mr-1" :icon="`mdi-${type.icon}`"/>
              {{ type.name }}
            </span>
          </div>
        </div>

        <div class="watched-folders-card__actions">
          <v-btn
            icon
            variant="text"
            size="small"
            rounded="pill"
            :aria-label="t('common.edit')"
            @click="editFolder(folder)"
          >
            <v-icon icon="mdi-pencil" size="18"/>
          </v-btn>
          <v-btn
            icon
            variant="text"
            size="small"
            rounded="pill"
            color="error"
            :aria-label="t('common.remove')"
            @click="confirmRemoveFolder(folder)"
          >
            <v-icon icon="mdi-delete-outline" size="18"/>
          </v-btn>
        </div>
      </div>
    </div>

    <v-dialog
      v-model="showFolderDialog"
      :fullscreen="$vuetify.display.xs"
      scrollable
      width="640"
      :z-index="2400"
      :transition="false"
      :retain-focus="false"
      persistent
    >
      <v-card rounded="xl">
        <DialogHeader
          :header="isEditMode
            ? t('settings_labels.tools.editing_folder')
            : t('settings_labels.tools.adding_folder')"
          :buttons="dialogButtons"
          closable
          @close="closeFolderDialog"
        />

        <v-card-text class="pa-sm-4 pa-2">
          <v-form ref="folderForm" v-model="formValid">
            <div class="d-flex flex-wrap ga-2 mb-4">
              <v-btn
                v-if="isElectron"
                color="primary"
                rounded="pill"
                variant="flat"
                @click.stop="chooseDirectoryNative"
              >
                <v-icon start>mdi-folder-open</v-icon>
                {{ t('settings_labels.database.select_folder') }}
              </v-btn>
              <v-btn
                color="primary"
                rounded="pill"
                :variant="isElectron ? 'tonal' : 'flat'"
                @click.stop="openRootBrowse"
              >
                <v-icon start>mdi-folder-search-outline</v-icon>
                {{ t('media.adding.browse_folders') }}
              </v-btn>
            </div>

            <v-text-field
              v-model="folderData.path"
              :rules="[(v) => !!v || t('validation.path_required')]"
              :label="t('settings_labels.tools.path_to_folder')"
              required
              autofocus
              variant="outlined"
              density="compact"
              rounded="pill"
              class="mb-4"
              @update:model-value="onFolderPathInput"
            />

            <v-text-field
              v-model="folderData.name"
              :label="t('settings_labels.tools.folder_name_optional')"
              variant="outlined"
              density="compact"
              rounded="pill"
              class="mb-4"
            />

            <div class="text-caption mt-2 mb-1">{{ t('meta.fields.icon') }}</div>
            <div class="d-flex align-center ga-3 mb-2">
              <v-avatar
                size="42"
                rounded="lg"
                color="primary"
                variant="tonal"
              >
                <v-icon size="22" :icon="folderIconMdi(folderData.icon)"/>
              </v-avatar>
              <v-btn
                color="primary"
                rounded="pill"
                variant="flat"
                @click.stop="showIconPicker = true"
              >
                {{ t('meta.fields.select_icon') }}
              </v-btn>
            </div>

            <div class="watched-folders-excludes mt-6">
              <div class="text-subtitle-2 mb-1">
                {{ t('settings_labels.tools.excluded_paths') }}
              </div>
              <p class="text-caption text-medium-emphasis mb-3">
                {{ t('settings_labels.tools.excluded_paths_hint') }}
              </p>

              <div class="d-flex flex-wrap ga-2 mb-3">
                <v-btn
                  :disabled="!folderData.path"
                  color="primary"
                  rounded="pill"
                  variant="tonal"
                  size="small"
                  @click.stop="openExcludeBrowse"
                >
                  <v-icon start size="18">mdi-folder-plus-outline</v-icon>
                  {{ t('settings_labels.tools.add_excluded_path') }}
                </v-btn>
              </div>

              <v-textarea
                v-model="excludeDraft"
                :disabled="!folderData.path"
                :label="t('settings_labels.tools.excluded_path_paste')"
                :hint="t('settings_labels.tools.excluded_paths_paste_hint')"
                :error-messages="excludeError ? [excludeError] : []"
                variant="outlined"
                density="compact"
                rounded="lg"
                rows="3"
                auto-grow
                persistent-hint
                class="mb-3"
              />
              <div class="d-flex mb-3">
                <v-btn
                  :disabled="!excludeDraft.trim() || !folderData.path"
                  color="primary"
                  rounded="pill"
                  variant="flat"
                  size="small"
                  @click="addExcludeFromDraft"
                >
                  <v-icon start size="18">mdi-plus</v-icon>
                  {{ t('settings_labels.tools.add_excluded_paths') }}
                </v-btn>
              </div>

              <div
                v-if="folderData.excludedPaths.length"
                class="d-flex flex-wrap ga-2"
              >
                <v-chip
                  v-for="path in folderData.excludedPaths"
                  :key="path"
                  closable
                  variant="tonal"
                  color="warning"
                  class="watched-folders-excludes__chip"
                  @click:close="removeExclude(path)"
                >
                  <v-icon start size="16">mdi-folder-cancel-outline</v-icon>
                  <span class="watched-folders-excludes__chip-text" :title="path">
                    {{ path }}
                  </span>
                </v-chip>
              </div>
              <div
                v-else
                class="settings-empty settings-empty--compact text-center py-6 px-3"
              >
                <div class="text-caption text-medium-emphasis">
                  {{ t('settings_labels.tools.excluded_paths_empty') }}
                </div>
              </div>
            </div>
          </v-form>
        </v-card-text>
      </v-card>
    </v-dialog>

    <DialogConfirm
      v-if="showDeleteDialog"
      variant="delete"
      :dialog="showDeleteDialog"
      :text="deleteConfirmText"
      @close="showDeleteDialog = false"
      @confirm="removeFolder"
    />

    <DialogBrowseFolder
      v-model="showBrowseDialog"
      :multiple="browseMode === 'exclude'"
      :initial-path="browseInitialPath"
      :z-index="2700"
      persistent
      :header="browseMode === 'exclude'
        ? t('settings_labels.tools.excluded_paths')
        : t('settings_labels.database.select_folder')"
      :confirm-text="browseMode === 'exclude'
        ? t('settings_labels.tools.add_excluded_paths')
        : t('common.select')"
      @confirm="onBrowseConfirm"
    />

    <DialogIcons
      v-model="showIconPicker"
      hide-activator
      :icon="folderData.icon"
      :z-index="2600"
      @apply="onIconApply"
    />
  </div>
</template>

<script setup lang="ts">
import {ref, computed, onMounted, nextTick} from 'vue'
import {typedApi} from '@/services/typedApi'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {useWatcherStore} from '@/stores/watcher'
import {useSettingsStore} from '@/stores/settings'
import {useEventBus} from '@/utils/eventBus'

import DialogHeader from '@/components/elements/DialogHeader.vue'
import DialogConfirm from '@/components/dialogs/DialogConfirm.vue'
import DialogBrowseFolder from '@/components/dialogs/DialogBrowseFolder.vue'
import DialogIcons from '@/components/dialogs/DialogIcons.vue'
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'
import SettingsSwitch from '@/components/ui/SettingsSwitch.vue'
import {normalizePastedFilePath} from '@/utils/filePathInput'
import {getWatchedFolders as fetchWatchedFolders} from '@/services/watcherService'
import {setNotification} from '@/services/notificationService'
import type {VFormInstance} from '@/types/vue'
import {
  isFolderWatchEnabled,
  type WatchedFolderEntry,
} from '@/services/watcherUtils'
import type {WatchedFolderUpdatePayload} from '@shared/api/responses'
import {
  folderIconMdi,
  isStrictChildPath,
  normalizeExcludedPathsClient,
} from '@/utils/watchedFolderExcludes'

const DEFAULT_FOLDER_ICON = 'folder-outline'

interface FolderFormData {
  id: number | null
  path: string
  name: string
  icon: string
  excludedPaths: string[]
  selectedTypes: number[]
}

const appStore = useAppStore()
const watcherStore = useWatcherStore()
const settingsStore = useSettingsStore()
const eventBus = useEventBus()
const {t} = useI18n()
const isElectron = computed(() => Boolean(appStore.isElectron) && Boolean(window.electronAPI?.invoke))

const folderForm = ref<VFormInstance>(null)
const formValid = ref(false)
const showFolderDialog = ref(false)
const showBrowseDialog = ref(false)
const showDeleteDialog = ref(false)
const showIconPicker = ref(false)
const isEditMode = ref(false)
const browseMode = ref<'root' | 'exclude'>('root')
const excludeDraft = ref('')
const excludeError = ref('')
const watcherBusy = ref(false)

const folderData = ref<FolderFormData>({
  id: null,
  path: '',
  name: '',
  icon: DEFAULT_FOLDER_ICON,
  excludedPaths: [],
  selectedTypes: [],
})

const currentFolder = ref<WatchedFolderEntry | null>(null)

const deleteConfirmText = computed(() =>
  t('settings_labels.tools.remove_watched_folder_confirm'),
)

const watchingCount = computed(() =>
  watcherStore.folders.filter((folder) => isFolderWatchEnabled(folder)).length,
)

const canRescanFolders = computed(() =>
  settingsStore.watchFolders === '1'
  && watchingCount.value > 0,
)

const watchingSummary = computed(() =>
  t('settings_labels.tools.watching_summary', {
    watching: watchingCount.value,
    total: watcherStore.folders.length,
  }),
)

const rescanWatchedFolders = () => {
  if (!canRescanFolders.value || watcherStore.busy) return
  eventBus.emit('rescan:watcher')
}

const browseInitialPath = computed(() => {
  if (browseMode.value === 'exclude' && folderData.value.path) {
    return folderData.value.path
  }
  return folderData.value.path
})

const dialogButtons = computed(() => [{
  icon: isEditMode.value ? 'content-save' : 'plus',
  text: isEditMode.value ? t('common.save') : t('common.add'),
  color: 'success',
  variant: 'flat',
  action: isEditMode.value ? saveFolder : addNewFolder,
}])

const getWatchedFolders = async () => {
  watcherStore.folders = await fetchWatchedFolders()
}

const updateWatchedFolder = async (id: number, data: WatchedFolderUpdatePayload) => {
  const response = await typedApi.updateWatchedFolder(id, data)
  return response.data
}

const onFolderPathInput = (value: string) => {
  folderData.value.path = normalizePastedFilePath(value) as string
  folderData.value.excludedPaths = normalizeExcludedPathsClient(
    folderData.value.path,
    folderData.value.excludedPaths,
  )
  excludeError.value = ''
}

const onIconApply = (icon: string) => {
  folderData.value.icon = String(icon || DEFAULT_FOLDER_ICON).replace(/^mdi-/, '') || DEFAULT_FOLDER_ICON
  showIconPicker.value = false
}

const openRootBrowse = () => {
  browseMode.value = 'root'
  // Defer past the current click so Vuetify does not treat it as outside-click on the nested dialog.
  window.setTimeout(() => {
    showBrowseDialog.value = true
  }, 0)
}

const openExcludeBrowse = () => {
  if (!folderData.value.path) return
  browseMode.value = 'exclude'
  window.setTimeout(() => {
    showBrowseDialog.value = true
  }, 0)
}

const tryAddExcludes = (rawPaths: string[]): {added: number; invalid: number} => {
  if (!folderData.value.path) {
    excludeError.value = t('settings_labels.tools.excluded_path_need_root')
    return {added: 0, invalid: rawPaths.length}
  }

  const candidates = rawPaths
    .map((raw) => normalizePastedFilePath(raw) as string)
    .map((raw) => String(raw || '').trim())
    .filter(Boolean)

  if (!candidates.length) {
    return {added: 0, invalid: 0}
  }

  const valid: string[] = []
  let invalid = 0
  for (const next of candidates) {
    if (!isStrictChildPath(folderData.value.path, next)) {
      invalid += 1
      continue
    }
    valid.push(next)
  }

  const before = folderData.value.excludedPaths.length
  folderData.value.excludedPaths = normalizeExcludedPathsClient(
    folderData.value.path,
    [...folderData.value.excludedPaths, ...valid],
  )
  const added = folderData.value.excludedPaths.length - before

  if (invalid > 0 && added === 0) {
    excludeError.value = t('settings_labels.tools.excluded_path_invalid')
  } else if (invalid > 0) {
    excludeError.value = t('settings_labels.tools.excluded_paths_partial_invalid', {
      invalid,
      added,
    })
  } else {
    excludeError.value = ''
  }

  return {added, invalid}
}

const addExcludeFromDraft = () => {
  if (!excludeDraft.value.trim()) return
  const lines = excludeDraft.value.split(/\r?\n/)
  const {added} = tryAddExcludes(lines)
  if (added > 0) {
    excludeDraft.value = ''
  }
}

const removeExclude = (path: string) => {
  folderData.value.excludedPaths = folderData.value.excludedPaths.filter((item) => item !== path)
}

const onBrowseConfirm = (paths: string[]) => {
  const cleaned = (paths || []).map((p) => String(p || '').trim()).filter(Boolean)
  if (!cleaned.length) return

  if (browseMode.value === 'exclude') {
    tryAddExcludes(cleaned)
    showBrowseDialog.value = false
    return
  }

  const next = cleaned[0]
  folderData.value = {
    ...folderData.value,
    path: next,
    name: folderData.value.name || next.split(/[\\/]/).pop() || '',
    excludedPaths: normalizeExcludedPathsClient(
      next,
      folderData.value.excludedPaths,
    ),
  }
  showBrowseDialog.value = false
}

const chooseDirectoryNative = async () => {
  if (!window.electronAPI?.invoke) return
  try {
    const result = await window.electronAPI.invoke('showOpenDialog', ['openDirectory'])
    if (result?.filePaths?.length) {
      onBrowseConfirm(result.filePaths)
    }
  } catch (error) {
    console.error('Error choosing directory:', error)
    setNotification({
      type: 'error',
      text: t('notifications_text.select_directory_failed'),
    })
  }
}

const openAddFolderDialog = () => {
  resetFolderData()
  isEditMode.value = false
  showFolderDialog.value = true
  nextTick(() => {
    folderForm.value?.resetValidation()
  })
}

const folderPayloadExtras = () => {
  const icon = folderData.value.icon === DEFAULT_FOLDER_ICON
    ? null
    : folderData.value.icon
  return {
    icon,
    excludedPaths: normalizeExcludedPathsClient(
      folderData.value.path,
      folderData.value.excludedPaths,
    ),
  }
}

const addNewFolder = async () => {
  const validation = await folderForm.value?.validate()
  if (!validation?.valid) return

  const folderName = folderData.value.name || folderData.value.path
  const extras = folderPayloadExtras()

  const {runWatchFolderRiskGate} = await import('@/composable/useWatchFolderRiskGate')
  const gate = await runWatchFolderRiskGate({
    path: folderData.value.path,
    excludedPaths: extras.excludedPaths,
  })
  if (gate.action === 'skip') {
    return
  }

  folderData.value.excludedPaths = gate.excludedPaths
  const gatedExtras = folderPayloadExtras()

  await typedApi.createWatchedFolder({
    folder: {
      path: folderData.value.path,
      name: folderName,
      ...gatedExtras,
    },
    types: [1],
  }).then(async () => {
    setNotification({
      type: 'success',
      title: t('notifications_text.folder_added'),
      text: folderName,
    })
    await getWatchedFolders()
  }).catch((error) => {
    console.error('Error adding watched folder:', error)
    setNotification({
      type: 'error',
      title: t('notifications_text.folder_add_failed'),
      text: folderName,
    })
    throw error
  })

  showFolderDialog.value = false
}

const editFolder = (folder: WatchedFolderEntry) => {
  currentFolder.value = folder
  folderData.value = {
    id: folder.id ?? null,
    path: folder.path,
    name: folder.name || '',
    icon: String(folder.icon || DEFAULT_FOLDER_ICON).replace(/^mdi-/, '') || DEFAULT_FOLDER_ICON,
    excludedPaths: [...(folder.excludedPaths || [])],
    selectedTypes: [1],
  }
  excludeDraft.value = ''
  excludeError.value = ''
  isEditMode.value = true
  showFolderDialog.value = true
}

const saveFolder = async () => {
  const validation = await folderForm.value?.validate()
  if (!validation?.valid || folderData.value.id == null) return

  const extras = folderPayloadExtras()
  const {runWatchFolderRiskGate} = await import('@/composable/useWatchFolderRiskGate')
  const gate = await runWatchFolderRiskGate({
    path: folderData.value.path,
    excludedPaths: extras.excludedPaths,
  })
  if (gate.action === 'skip') {
    return
  }
  folderData.value.excludedPaths = gate.excludedPaths

  watcherBusy.value = true
  try {
    await updateWatchedFolder(folderData.value.id, {
      path: folderData.value.path,
      name: folderData.value.name,
      ...folderPayloadExtras(),
    })

    showFolderDialog.value = false
    await getWatchedFolders()

    setNotification({
      type: 'success',
      text: t('notifications_text.folder_updated'),
    })
  } catch (_error) {
    setNotification({
      type: 'error',
      text: t('notifications_text.folder_update_failed'),
    })
  } finally {
    watcherBusy.value = false
  }
}

const confirmRemoveFolder = (folder: WatchedFolderEntry) => {
  currentFolder.value = folder
  showDeleteDialog.value = true
}

const removeFolder = async () => {
  if (!currentFolder.value?.id) return

  watcherBusy.value = true
  try {
    await typedApi.deleteWatchedFolder(currentFolder.value.id)
    await getWatchedFolders()
    setNotification({
      type: 'success',
      text: t('notifications_text.folder_removed'),
    })
  } catch (_error) {
    setNotification({
      type: 'error',
      text: t('notifications_text.folder_remove_failed'),
    })
  } finally {
    showDeleteDialog.value = false
    watcherBusy.value = false
  }
}

const toggleFolderWatch = async (folder: WatchedFolderEntry) => {
  if (folder.id == null) return

  watcherBusy.value = true
  try {
    await typedApi.updateWatchedFolder(folder.id, {watch: !isFolderWatchEnabled(folder)})
    await getWatchedFolders()
  } catch (_error) {
    setNotification({
      type: 'error',
      text: t('notifications_text.folder_toggle_failed'),
    })
  } finally {
    watcherBusy.value = false
  }
}

const closeFolderDialog = () => {
  showFolderDialog.value = false
  resetFolderData()
}

const resetFolderData = () => {
  folderData.value = {
    id: null,
    path: '',
    name: '',
    icon: DEFAULT_FOLDER_ICON,
    excludedPaths: [],
    selectedTypes: [],
  }
  excludeDraft.value = ''
  excludeError.value = ''
}

onMounted(() => {
  getWatchedFolders()
})
</script>

<style scoped lang="scss">
.settings-empty {
  border-radius: 22px;
  border: 1px dashed rgba(var(--v-theme-on-surface), 0.14);
  background:
    radial-gradient(80% 120% at 50% 0%, rgba(var(--v-theme-primary), 0.08), transparent 65%),
    rgba(var(--v-theme-on-surface), 0.02);
}

.settings-empty--compact {
  border-radius: 16px;
  background: rgba(var(--v-theme-on-surface), 0.02);
}

.settings-empty__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 18px;
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.12);
}

.watched-folders__hint {
  max-width: 52rem;
  line-height: 1.45;
}

.watched-folders__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 12px;
}

.watched-folders__summary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-right: auto;
  font-variant-numeric: tabular-nums;
}

.watched-folders__summary-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 0.8125rem;
  font-weight: 700;
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.12);
}

.watched-folders__list {
  display: grid;
  gap: 10px;
}

.watched-folders-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 18px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background: rgba(var(--v-theme-surface), 0.72);
  box-shadow: 0 1px 0 rgba(var(--v-theme-on-surface), 0.03);
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

.watched-folders-card:hover {
  border-color: rgba(var(--v-theme-primary), 0.22);
  background: rgba(var(--v-theme-primary), 0.04);
  box-shadow: 0 8px 24px rgba(var(--v-theme-on-surface), 0.06);
  transform: translateY(-1px);
}

.watched-folders-card--watching {
  border-color: rgba(var(--v-theme-success), 0.28);
  background:
    linear-gradient(135deg, rgba(var(--v-theme-success), 0.1), rgba(var(--v-theme-success), 0.03));
  box-shadow: 0 0 0 1px rgba(var(--v-theme-success), 0.12);
}

.watched-folders-card--paused {
  opacity: 0.92;
}

.watched-folders-card__icon {
  flex: 0 0 42px;
  width: 42px;
  height: 42px;
  border: 1px solid rgba(var(--v-theme-primary), 0.16);
  border-radius: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgb(var(--v-theme-primary));
  background:
    linear-gradient(145deg, rgba(var(--v-theme-primary), 0.18), rgba(var(--v-theme-primary), 0.05));
  cursor: pointer;
}

.watched-folders-card--watching .watched-folders-card__icon {
  color: rgb(var(--v-theme-success));
  border-color: rgba(var(--v-theme-success), 0.2);
  background:
    linear-gradient(145deg, rgba(var(--v-theme-success), 0.18), rgba(var(--v-theme-success), 0.05));
}

.watched-folders-card__meta {
  flex: 1 1 auto;
  min-width: 0;
}

.watched-folders-card__title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.watched-folders-card__title {
  font-size: 0.975rem;
  font-weight: 650;
  line-height: 1.3;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.watched-folders-card__badge {
  flex: 0 0 auto;
  font-weight: 600;
}

.watched-folders-card__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-top: 4px;
}

.watched-folders-card__stat {
  display: inline-flex;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 0.75rem;
  line-height: 1.35;
}

.watched-folders-card__stat--mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.7rem;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.watched-folders-card__actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 2px;
  padding: 4px;
  border-radius: 999px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background: rgba(var(--v-theme-surface), 0.85);
}

.watched-folders-excludes__chip {
  max-width: 100%;
}

.watched-folders-excludes__chip-text {
  max-width: min(420px, 70vw);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 700px) {
  .watched-folders-card {
    flex-wrap: wrap;
  }

  .watched-folders-card__actions {
    margin-left: auto;
  }
}
</style>
