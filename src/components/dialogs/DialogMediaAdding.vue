<template>
  <v-dialog
    v-model="isDialogVisible"
    class="align-start media-adding-overlay"
    :style="{top: `${appLayoutRect.top}px`}"
    :fullscreen="xs"
    scrollable
    :eager="keepSourcesMounted"
    :persistent="sourceBusy"
    width="880"
  >
    <template v-if="!hideActivator" v-slot:activator="{ props: activatorProps }">
      <AppBarButton
        v-bind="activatorProps"
        :action="()=>isDialogVisible=true"
        :text="t('media.adding.add_media')"
        :color="buttonColor"
        :size="buttonSize"
        :variant="buttonVariant"
        icon="plus"
      />
    </template>
    <template #default>
      <v-card rounded="xl" class="media-adding-dialog">
        <!-- Заголовок диалога с кнопками действий -->
        <DialogHeader
          @close="closeDialog"
          :header="dialogHeader"
          :subheader="selectionCount ? t('media.adding.browser_selected_count', {count: selectionCount}) : t('media.adding.select_source_hint')"
          :buttons="headerButtons"
          :closable="!sourceBusy"
        />

        <div class="media-adding-dialog__navigation" :class="{'media-adding-dialog__navigation--sources': activeSource === 'sources'}">
          <v-tabs v-model="activeSource" color="primary" grow class="media-adding-dialog__tabs" :aria-label="t('media.adding.source')">
            <v-tab v-for="source in sources" :key="source.id" :value="source.id" :disabled="sourceBusy" :prepend-icon="source.icon">
              {{ source.title }}
            </v-tab>
          </v-tabs>
          <div v-show="activeSource === 'sources'" ref="providerTabsTarget" class="media-adding-dialog__providers" />
        </div>

        <!-- Основное содержимое диалога -->
        <v-card-text
          @drop.prevent="handleFileDrop"
          @dragenter.prevent
          @dragover.prevent
          class="pa-2 pa-sm-4 pt-0 pt-sm-0"
        >
          <WebVideoImport v-model:import-options="importOptions" v-if="webVideoAvailable" v-show="activeSource === 'links'" ref="webVideoSource" @started="onRemoteImportStarted" embedded />
          <SourcesPanel :provider-tabs-target="providerTabsTarget" v-model:import-options="importOptions" :extensions="browserExtensions" v-show="activeSource === 'sources'" ref="remoteSources" @started="onRemoteImportStarted" embedded>
            <template #browser-footer>
              <MediaImportTypes v-model="selectedMediaTypeIds" :disabled="sourceBusy"/>
            </template>
          </SourcesPanel>
          <div v-show="activeSource === 'local'" class="media-adding-dialog__local">
            <MediaFolderBrowser
              :base-url="appStore.localhost || ''"
              :path="browsePath"
              :extensions="browserExtensions"
              :selected-paths="selectedBrowserPaths"
              :places="browsePlaces"
              :active-place-id="activePlaceId"
              :selection-hint="pathsHint"
              :disabled="sourceBusy"
              @update:path="browsePath = $event"
              @update:selected-paths="onBrowserSelection"
              @select-place="openBrowsePlace"
            >
              <template #footerActions>
                <MediaImportTypes v-model="selectedMediaTypeIds" :disabled="sourceBusy"/>
              </template>
              <template #importSettings>
                <MediaImportOptions v-model="importOptions" :disabled="sourceBusy"
                                    :parse-disabled="mediaAddingState.is_fast_import"
                                    :folder-browser="{baseUrl: appStore.localhost || '', path: browsePath, places: browsePlaces}">
                  <template #before>
                    <div class="import-option import-option--fast">
                      <v-checkbox v-model="mediaAddingState.is_fast_import"
                                  :disabled="sourceBusy || mediaAddingState.fast_import_locked"
                                  :label="t('media.adding.fast_import')" color="primary"
                                  hide-details class="mt-0" density="compact" @update:model-value="onFastImportToggle" />
                      <p class="import-option__hint">{{ t('media.adding.fast_import_hint') }}</p>
                    </div>
                    <div v-if="isImageAdding" class="import-option__note">
                      <v-icon icon="mdi-check-circle-outline" size="16" />
                      <span>{{ t('media.adding.images_skip_by_path_hint') }}</span>
                    </div>
                  </template>
                </MediaImportOptions>
              </template>
              <template #entryActions="{entry, loading}">
                <FilePreviewButton :file="entry" :disabled="sourceBusy || loading" />
              </template>
            </MediaFolderBrowser>

            <v-alert
              v-if="browsePlacesLoaded && !browsePlaces.length && !browsePath"
              type="info"
              variant="tonal"
              density="compact"
              rounded="xl"
              class="mt-4 text-caption"
            >
              {{ t('media.adding.mounted_roots_empty') }}
            </v-alert>
          </div>
        </v-card-text>
      </v-card>
    </template>
  </v-dialog>
</template>

<script setup lang="ts">
import {ref, computed, watch, onMounted} from 'vue'
import {isSfwBuild} from '@shared/buildFlags'
import WebVideoImport from '@/components/dialogs/WebVideoImport.vue'
import SourcesPanel from '@/components/dialogs/SourcesPanel.vue'
import {useRememberedTab} from '@/composable/useRememberedTab'
import type {PropType} from 'vue'
import {useDisplay, useLayout} from 'vuetify'
import {useI18n} from 'vue-i18n'
import {useTasksStore} from '@/stores/tasks'
import {useAppStore} from '@/stores/app'
import {isImageMediaType, combineMediaTypeExtensions, resolveTargetMediaTypesForAdding} from '@/utils/mediaType'
import MediaImportTypes from './MediaImportTypes.vue'
import MediaImportOptions from './MediaImportOptions.vue'
import type {RemoteImportOptions} from '@/services/remoteImportOptions'

// Компоненты
import DialogHeader from '@/components/elements/DialogHeader.vue'
import AppBarButton from "@/components/app/appbar/AppBarButton.vue"
import {useMediaAdding} from '@/composable/AddingMedia'
import {normalizePastedFilePathsText} from '@/utils/filePathInput'
import {collectDroppedPaths} from '@/utils/mediaDrop'
import {showOpenDialog} from '@/services/electronDialogService'
import {typedApi} from '@/services/typedApi'
import type {BrowsePlace} from '@/services/typedApi/browse'
import MediaFolderBrowser from '@/components/dialogs/MediaFolderBrowser.vue'
import FilePreviewButton from '@/components/dialogs/FilePreviewButton.vue'
import {transformTextToArray} from '@/services/formatUtils'


// Хуки
const {t} = useI18n()
const {xs} = useDisplay()
const {mainRect: appLayoutRect} = useLayout()
const webVideoAvailable = !isSfwBuild()

const props = defineProps({
  buttonColor: {
    type: String,
    default: undefined,
  },
  buttonSize: {
    type: String,
    default: undefined,
  },
  buttonVariant: {
    type: String as PropType<'text' | 'flat' | 'elevated' | 'outlined' | 'plain' | 'tonal'>,
    default: 'text',
  },
  hideActivator: {
    type: Boolean,
    default: false,
  },
  modelValue: {
    type: Boolean,
    default: undefined,
  },
  initialPaths: {
    type: String,
    default: '',
  },
  initialBrowsePath: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['update:modelValue'])

// Pinia stores
const tasksStore = useTasksStore()
const appStore = useAppStore()

// Composable
const mediaAdding = useMediaAdding()

// Реактивные переменные
const internalDialogVisible = ref(false)
const keepSourcesMounted = ref(false)
function onRemoteImportStarted() {
  keepSourcesMounted.value = true
  isDialogVisible.value = false
}
const browsePlaces = ref<BrowsePlace[]>([])
const browsePlacesLoaded = ref(false)
const isContainerRuntime = ref(false)
const browsePath = ref('')
const selectedBrowserPaths = ref<string[]>([])
const {tab: activeSource, restore: restoreSourceTab} = useRememberedTab<'local' | 'links' | 'sources'>(
  'mediachips.media-adding.source', webVideoAvailable ? ['local', 'sources', 'links'] : ['local', 'sources'], 'local',
)
const webVideoSource = ref<InstanceType<typeof WebVideoImport>>()
const providerTabsTarget = ref<HTMLElement>()
const remoteSources = ref<InstanceType<typeof SourcesPanel>>()
const submitting = ref(false)
const sources = computed(() => [
  {id: 'local', title: t('media.adding.source_local'), icon: 'mdi-folder-outline'},
  {id: 'sources', title: t('sources.title'), icon: 'mdi-server-network-outline'},
  ...(webVideoAvailable ? [{id: 'links', title: t('media.adding.source_links'), icon: 'mdi-link-variant'}] : []),
])
watch(activeSource, source => {
  if (source === 'sources') void remoteSources.value?.refresh()
})
const sourceBusy = computed(() => submitting.value || !!webVideoSource.value?.busy || !!remoteSources.value?.busy)
const selectionCount = computed(() => {
  if (activeSource.value === 'links') return webVideoSource.value?.selectionCount || 0
  if (activeSource.value === 'sources') return remoteSources.value?.selectionCount || 0
  return new Set(transformTextToArray(tasksStore.mediaAdding.paths || '')).size
})
const canSubmit = computed(() => {
  if (activeSource.value === 'links') return !!webVideoSource.value?.canSubmit
  if (activeSource.value === 'sources') return !!remoteSources.value?.canSubmit
  return selectionCount.value > 0
})
async function scanDuplicates() {
  if (tasksStore.mediaAdding.active || sourceBusy.value || !canSubmit.value) return
  submitting.value = true
  try { await startDuplicateScanProcess() }
  finally { submitting.value = false }
}
function closeDialog() {
  if (!sourceBusy.value) isDialogVisible.value = false
}
async function submitActiveSource() {
  if (tasksStore.mediaAdding.active || sourceBusy.value || !canSubmit.value) return
  submitting.value = true
  try {
    if (activeSource.value === 'links') await webVideoSource.value?.submit()
    else if (activeSource.value === 'sources') await remoteSources.value?.submit()
    else await startMediaAddingProcess()
  } finally { submitting.value = false }
}

const activePlaceId = computed(() => {
  const current = browsePath.value
  if (!current) return null
  const matches = browsePlaces.value
    .filter((place) => {
      if (current === place.path) return true
      const prefix = place.path.endsWith('/') || place.path.endsWith('\\')
        ? place.path
        : `${place.path}/`
      const prefixWin = place.path.endsWith('\\') ? place.path : `${place.path}\\`
      return current.startsWith(prefix) || current.startsWith(prefixWin)
    })
    .sort((a, b) => b.path.length - a.path.length)
  return matches[0]?.id ?? null
})

const isDialogVisible = computed({
  get() {
    return props.modelValue !== undefined
      ? props.modelValue
      : internalDialogVisible.value
  },
  set(value) {
    internalDialogVisible.value = value
    emit('update:modelValue', value)
  },
})

// Computed свойства
const isElectron = computed(() => appStore.isElectron)
const mediaAddingState = computed(() => tasksStore.mediaAdding)
const headerButtons = computed(() => [
  ...(activeSource.value === 'local' ? [
    ...(isElectron.value ? [
      {text: t('media.adding.select_files'), icon: 'file-outline', outlined: true, disabled: sourceBusy.value, action: selectMultipleFiles},
      {text: t('media.adding.select_folders'), icon: 'folder-open-outline', outlined: true, disabled: sourceBusy.value, action: selectMultipleDirectories},
    ] : []),
    {text: t('media.adding.scan_duplicates'), icon: 'content-copy', outlined: true,
      disabled: !canSubmit.value || sourceBusy.value, action: scanDuplicates},
  ] : []),
  {text: t('common.add'), icon: 'plus', color: 'primary', loading: sourceBusy.value,
    disabled: !canSubmit.value || sourceBusy.value || tasksStore.mediaAdding.active, action: submitActiveSource},
])

const selectedMediaTypeIds = computed({
  get() {
    return tasksStore.mediaAdding.media_type_ids || []
  },
  set(value: number[]) {
    const ids = (value || []).map(Number).filter((id) => Number.isFinite(id))
    tasksStore.mediaAdding.media_type_ids = ids
    tasksStore.mediaAdding.media_type_id = ids.length === 1 ? ids[0] : null
  },
})

const targetMediaTypes = computed(() => (
  resolveTargetMediaTypesForAdding(appStore.mediaTypes, selectedMediaTypeIds.value)
))

const browserExtensions = computed(() => combineMediaTypeExtensions(targetMediaTypes.value))

const isImageAdding = computed(() => targetMediaTypes.value.some(isImageMediaType))

const pathsHint = computed(() => {
  if (isContainerRuntime.value) return t('media.adding.paths_hint_docker')
  return t('media.adding.paths_hint')
})

const dialogHeader = computed(() => t('media.adding.title'))

const onPathsInput = (value: string) => {
  const normalized = String(normalizePastedFilePathsText(value) ?? '')
  tasksStore.mediaAdding.paths = normalized
  tasksStore.mediaAdding.skipFileScan = false
  tasksStore.mediaAdding.directFiles = []
  selectedBrowserPaths.value = transformTextToArray(normalized)
}

const importOptions = computed<RemoteImportOptions>({
  get: () => ({
    parseTags: mediaAddingState.value.is_parsing,
    excluded: mediaAddingState.value.excluded || '',
  }),
  set: value => {
    tasksStore.mediaAdding.is_parsing = value.parseTags
    tasksStore.mediaAdding.excluded = String(normalizePastedFilePathsText(value.excluded) ?? '')
  },
})

const onFastImportToggle = (value: boolean | null) => {
  if (tasksStore.mediaAdding.fast_import_locked) {
    tasksStore.mediaAdding.is_fast_import = true
    return
  }
  const enabled = Boolean(value)
  tasksStore.mediaAdding.is_fast_import = enabled
  if (enabled) {
    tasksStore.mediaAdding.is_parsing = false
  }
}

// Методы

/**
 * Инициализирует состояние диалога при монтировании
 */
onMounted(() => {
  resetDialogState()
  void loadBrowsePlaces()
})

function defaultBrowsePath(places: BrowsePlace[]): string {
  return places.find((place) => place.id === 'home')?.path
    || places.find((place) => place.id === 'videos')?.path
    || places[0]?.path
    || ''
}

async function loadBrowsePlaces() {
  try {
    const {data} = await typedApi.listBrowsePlaces()
    browsePlaces.value = data.places
    isContainerRuntime.value = data.container
    if (!browsePath.value && browsePlaces.value.length) {
      browsePath.value = defaultBrowsePath(browsePlaces.value)
    }
  } catch {
    browsePlaces.value = []
    isContainerRuntime.value = false
  } finally {
    browsePlacesLoaded.value = true
  }
}

function openBrowsePlace(nextPath: string) {
  browsePath.value = nextPath
}

function onBrowserSelection(paths: string[]) {
  selectedBrowserPaths.value = paths
  onPathsInput(paths.join('\n'))
}

const selectMultipleFiles = async () => {
  const paths = await showOpenDialog(['openFile', 'multiSelections'])
  if (!paths) return
  appendLocalPaths(paths)
}

function appendLocalPaths(paths: string) {
  const existing = (tasksStore.mediaAdding.paths || '').trim()
  onPathsInput(existing ? `${existing}\n${paths}` : paths)
}

const selectMultipleDirectories = async () => {
  const paths = await showOpenDialog(['openDirectory', 'multiSelections'])
  if (!paths?.length) return
  appendLocalPaths(paths)
}

const handleAddMedia = async () => {
  await mediaAdding.addMedia()
}

const handleScanDuplicates = async () => {
  await mediaAdding.scanFolderDuplicates()
}

/**
 * Обрабатывает изменения пропса dialog для синхронизации с локальным состоянием
 */
watch(isDialogVisible, (newValue) => {
  if (newValue) {
    if (tasksStore.mediaAdding.active) {
      isDialogVisible.value = false
      tasksStore.mediaAdding.dialogProcess = true
      return
    }
    resetDialogState()
    void loadBrowsePlaces()
  }
})

/**
 * Сбрасывает состояние диалога к начальным значениям
 */
const resetDialogState = () => {
  const previousSource = activeSource.value
  restoreSourceTab()
  if (isDialogVisible.value && (props.initialPaths || props.initialBrowsePath)) activeSource.value = 'local'
  if (activeSource.value === 'sources' && previousSource === 'sources') void remoteSources.value?.refresh()
  syncMediaTypeFromContext()
  tasksStore.mediaAdding.paths = props.initialPaths || ''
  tasksStore.mediaAdding.skipFileScan = Boolean(props.initialPaths)
  tasksStore.mediaAdding.is_fast_import = false
  tasksStore.mediaAdding.fast_import_locked = false
  tasksStore.mediaAdding.directFiles = props.initialPaths
    ? props.initialPaths.split('\n').map((row) => row.trim()).filter(Boolean)
    : []
  selectedBrowserPaths.value = transformTextToArray(props.initialPaths || '')
  if (props.initialBrowsePath) {
    browsePath.value = props.initialBrowsePath
  } else if (browsePlaces.value.length) {
    browsePath.value = defaultBrowsePath(browsePlaces.value)
  } else {
    browsePath.value = ''
  }
  tasksStore.mediaAdding.paths = props.initialPaths || ''
  tasksStore.mediaAdding.directFiles = props.initialPaths
    ? props.initialPaths.split('\n').map((row) => row.trim()).filter(Boolean)
    : []
}

const syncMediaTypeFromContext = () => {
  // Default: all types (empty media_type_ids). Do not inherit page Videos fallback.
  tasksStore.mediaAdding.media_type_ids = []
  tasksStore.mediaAdding.media_type_id = null
}

/**
 * Запускает процесс добавления медиафайлов, если выбраны пути
 */
const startMediaAddingProcess = async () => {
  if (!selectionCount.value) return

  const {useFreeLibraryGate} = await import('@/composable/useFreeLibraryGate')
  if (!(await useFreeLibraryGate().ensureCanImportMedia())) return

  // Активируем задачу и показываем диалог процесса
  tasksStore.mediaAdding.paths = String(normalizePastedFilePathsText(tasksStore.mediaAdding.paths || '') ?? '')
  tasksStore.mediaAdding.excluded = String(normalizePastedFilePathsText(tasksStore.mediaAdding.excluded || '') ?? '')
  tasksStore.mediaAdding.dialogProcess = true
  tasksStore.mediaAdding.active = true
  isDialogVisible.value = false

  await handleAddMedia()
}

const startDuplicateScanProcess = async () => {
  if (!selectionCount.value) return

  tasksStore.mediaAdding.paths = String(normalizePastedFilePathsText(tasksStore.mediaAdding.paths || '') ?? '')
  tasksStore.mediaAdding.excluded = String(normalizePastedFilePathsText(tasksStore.mediaAdding.excluded || '') ?? '')
  tasksStore.mediaAdding.dialogProcess = true
  tasksStore.mediaAdding.active = true
  isDialogVisible.value = false

  await handleScanDuplicates()
}

/**
 * Обрабатывает событие перетаскивания файлов в диалог
 * @param {DragEvent} event - Событие перетаскивания
 */
const handleFileDrop = (event: DragEvent) => {
  if (!isElectron.value || sourceBusy.value) return

  const existingPaths = tasksStore.mediaAdding.paths || ''
  const newPaths = collectDroppedPaths(event).join('\n')

  if (!newPaths) return

  activeSource.value = 'local'
  onPathsInput(existingPaths
    ? String(normalizePastedFilePathsText(`${existingPaths}\n${newPaths}`) ?? '')
    : String(normalizePastedFilePathsText(newPaths) ?? ''))
}
</script>

<style scoped>
.media-adding-dialog__navigation {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin: 12px 16px;
}
.media-adding-dialog__tabs, .media-adding-dialog__providers { min-width: 0; max-width: 100%; }
.media-adding-dialog__navigation > .media-adding-dialog__tabs { margin-block: 0; }
.media-adding-dialog__providers { margin-inline-start: auto; }
@media (max-width: 800px) {
  .media-adding-dialog__navigation--sources .media-adding-dialog__tabs :deep(.v-tab) {
    min-width: 0;
    padding-inline: 8px;
    font-size: .75rem;
  }
  .media-adding-dialog__navigation--sources .media-adding-dialog__tabs :deep(.v-btn__prepend) { display: none; }
  .media-adding-dialog__providers :deep(.settings-segmented__option > .v-icon) { display: none; }
}
@media (max-width: 600px) {
  .media-adding-dialog__tabs :deep(.v-tab) { min-width: 0; padding-inline: 10px; font-size: 0.75rem; }
}
</style>
