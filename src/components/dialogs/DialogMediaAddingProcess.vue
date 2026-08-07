<template>
  <v-dialog
    v-model="tasksStore.mediaAdding.dialogProcess"
    :fullscreen="xs"
    scrollable
    width="800"
    persistent
  >
    <v-card>
      <DialogHeader
        @close="closeProcessDialog"
        :header="t('media.adding.files')"
        :buttons="buttons"
        closable
      />

      <v-card-actions class="pa-4">
        <v-progress-linear
          v-model="task.progress"
          :striped="task.active && !task.stopped"
          height="20"
          color="primary"
          rounded
        >
          <template v-slot:default="{ value }">
            <strong class="process-percents">{{ Math.ceil(value) }} %</strong>
          </template>
        </v-progress-linear>
      </v-card-actions>

      <div class="d-flex justify-space-between px-4">
        <div>{{ task.status }}</div>
        <v-card class="text-medium-emphasis text-caption" variant="flat">
          <v-progress-linear v-if="task.active && !task.stopped" height="3" indeterminate reverse/>
          {{ task.processed }}
        </v-card>
      </div>

      <v-card-text class="pa-4">
        <!-- Added files -->
        <div v-if="task.added.length > 0" class="mb-4">
          <v-card
            v-if="canMakeLibrarySmart"
            variant="tonal"
            color="primary"
            class="pa-4 mb-4"
          >
            <div class="text-subtitle-1 font-weight-medium mb-1">
              {{ t('media.adding.make_library_smart') }}
            </div>
            <div class="text-caption text-medium-emphasis mb-3">
              {{ t('media.adding.make_library_smart_hint') }}
            </div>

            <v-checkbox
              v-model="smartWizard.pathTags"
              density="compact"
              hide-details
              color="primary"
              :disabled="smartWizardRunning"
              :label="t('media.adding.make_library_smart_path_tags')"
            />
            <v-checkbox
              v-model="smartWizard.grids"
              density="compact"
              hide-details
              color="primary"
              :disabled="smartWizardRunning || !isAddedVideo"
              :label="t('media.adding.make_library_smart_grids')"
            />
            <v-checkbox
              v-model="smartWizard.faces"
              density="compact"
              hide-details
              color="primary"
              :disabled="smartWizardRunning || !isAddedVideo"
              :label="t('media.adding.make_library_smart_faces')"
            />
            <v-checkbox
              v-model="smartWizard.clip"
              density="compact"
              hide-details
              color="primary"
              :disabled="smartWizardRunning || !isAddedVideo"
              :label="t('media.adding.make_library_smart_clip')"
            />
            <v-checkbox
              v-if="smartWizard.clip"
              v-model="smartWizard.clipTags"
              density="compact"
              hide-details
              color="primary"
              class="ml-4"
              :disabled="smartWizardRunning || !isAddedVideo || !clipModelReady"
              :label="t('media.adding.make_library_smart_clip_tags')"
            />

            <div
              v-if="smartWizard.faces && faceModelNeedsDownload"
              class="text-caption text-medium-emphasis mt-2"
            >
              {{ t('media.adding.download_face_model_hint') }}
            </div>
            <div
              v-if="smartWizard.clip && clipModelNeedsDownload"
              class="text-caption text-medium-emphasis mt-2"
            >
              {{ t('media.adding.download_video_recognition_model_hint') }}
            </div>

            <div class="d-flex flex-wrap ga-2 mt-3">
              <v-btn
                v-if="smartWizard.faces && faceModelNeedsDownload"
                @click="downloadFaceModel"
                :loading="faceModelDownloading"
                :disabled="faceModelDownloading || smartWizardRunning"
                color="secondary"
                rounded
                variant="outlined"
                size="small"
              >
                <v-icon icon="mdi-download" start/>
                {{ t('media.adding.download_face_model') }}
              </v-btn>
              <v-btn
                v-if="smartWizard.clip && clipModelNeedsDownload"
                @click="downloadClipModel"
                :loading="clipModelDownloading"
                :disabled="clipModelDownloading || smartWizardRunning"
                color="secondary"
                rounded
                variant="outlined"
                size="small"
              >
                <v-icon icon="mdi-download" start/>
                {{ t('media.adding.download_video_recognition_model') }}
              </v-btn>
              <v-btn
                @click="runSmartLibraryWizard"
                :loading="smartWizardRunning"
                :disabled="!canRunSmartWizard || smartWizardRunning"
                color="primary"
                rounded
                variant="flat"
              >
                <v-icon icon="mdi-auto-fix" start/>
                {{ t('media.adding.make_library_smart_run') }}
              </v-btn>
            </div>

            <div v-if="pathAutoTagSummary" class="text-caption mt-2">
              {{ pathAutoTagSummary }}
            </div>

            <div v-if="smartWizardRunning || smartWizardProgress > 0" class="mt-3">
              <v-progress-linear
                v-model="smartWizardProgress"
                color="primary"
                height="16"
                rounded
                :striped="smartWizardRunning"
              >
                <template #default="{ value }">
                  <strong class="process-percents">{{ Math.ceil(value) }} %</strong>
                </template>
              </v-progress-linear>
              <div class="text-caption text-medium-emphasis mt-1">
                {{ smartWizardStatus }}
              </div>
            </div>
          </v-card>

          <div v-if="task.finished" class="d-flex flex-wrap ga-2 mb-4">
            <v-btn
              v-if="task.suggestedTags?.length"
              @click="acceptAllSuggestedTags"
              :loading="acceptingSuggestedTags"
              :disabled="acceptingSuggestedTags"
              color="primary"
              rounded
              variant="flat"
            >
              <v-icon icon="mdi-tag-check-outline"
                start/>
              {{ t('media.adding.accept_all_suggested_tags') }}
            </v-btn>

            <v-btn
              v-if="task.videoSuggestedTags?.length"
              @click="applyClipSuggestedTags"
              :loading="applyingClipSuggestions"
              :disabled="applyingClipSuggestions"
              color="primary"
              rounded
              variant="tonal"
            >
              <v-icon icon="mdi-tag-plus-outline" start/>
              {{ t('media.adding.apply_clip_suggestions') }}
            </v-btn>

            <v-btn
              v-if="task.suggestedTags?.length"
              @click="openSuggestedTags"
              color="primary"
              rounded
              variant="outlined"
            >
              <v-icon icon="mdi-tag-plus-outline"
                start/>
              {{ t('media.adding.review_suggested_tags') }}
            </v-btn>

            <v-btn
              v-if="canReparseTags"
              @click="reparseTags"
              :loading="task.parsingTags"
              :disabled="task.parsingTags"
              color="primary"
              rounded
              variant="outlined"
            >
              <v-icon icon="mdi-text-box-search-outline"
                start/>
              {{ t('media.adding.reparse_tags') }}
            </v-btn>
            <ButtonDocumentation
              v-if="canReparseTags"
              id="media.parser"
            />

            <v-btn
              v-if="canRecognizeObjects && clipModelNeedsDownload"
              @click="downloadClipModel"
              :loading="clipModelDownloading"
              :disabled="clipModelDownloading"
              color="secondary"
              rounded
              variant="outlined"
            >
              <v-icon icon="mdi-download"
                start/>
              {{ t('media.adding.download_video_recognition_model') }}
            </v-btn>

            <v-btn
              v-if="canRecognizeObjects && clipModelReady"
              @click="recognizeVideoObjects"
              :loading="task.recognizingObjects"
              :disabled="task.recognizingObjects"
              color="secondary"
              rounded
              variant="flat"
            >
              <v-icon icon="mdi-image-search-outline"
                start/>
              {{ t('media.adding.recognize_video_objects') }}
            </v-btn>
            <ButtonDocumentation
              v-if="canRecognizeObjects"
              id="media.video_object_recognition"
            />

            <v-btn
              v-if="canDetectFaces && faceModelNeedsDownload"
              @click="downloadFaceModel"
              :loading="faceModelDownloading"
              :disabled="faceModelDownloading || task.detectingFaces"
              color="secondary"
              rounded
              variant="outlined"
            >
              <v-icon icon="mdi-download" start/>
              {{ t('media.adding.download_face_model') }}
            </v-btn>

            <v-btn
              v-if="canDetectFaces && faceModelReady"
              @click="detectFacesInAddedVideos"
              :loading="task.detectingFaces"
              :disabled="task.detectingFaces || task.recognizingObjects"
              color="secondary"
              rounded
              variant="flat"
            >
              <v-icon icon="mdi-face-recognition" start/>
              {{ t('media.adding.detect_faces') }}
            </v-btn>
          </div>

          <div
            v-if="canRecognizeObjects && clipModelNeedsDownload"
            class="text-caption text-medium-emphasis mb-4"
          >
            {{ t('media.adding.download_video_recognition_model_hint') }}
          </div>

          <div
            v-if="canDetectFaces && faceModelNeedsDownload"
            class="text-caption text-medium-emphasis mb-4"
          >
            {{ t('media.adding.download_face_model_hint') }}
          </div>

          <div v-if="task.recognizingObjects || task.objectRecognitionTotal > 0" class="mb-4">
            <v-progress-linear
              v-model="task.objectRecognitionProgress"
              color="secondary"
              height="18"
              rounded
              :striped="task.recognizingObjects"
            >
              <template #default="{ value }">
                <strong class="process-percents">{{ Math.ceil(value) }} %</strong>
              </template>
            </v-progress-linear>
            <div class="text-caption text-medium-emphasis mt-1">
              {{ t('media.adding.video_object_recognition_progress', {
                processed: task.objectRecognitionProcessed,
                total: task.objectRecognitionTotal,
                remaining: task.objectRecognitionRemaining,
              }) }}
            </div>
          </div>

          <div v-if="task.detectingFaces || task.faceDetectionTotal > 0" class="mb-4">
            <v-progress-linear
              v-model="task.faceDetectionProgress"
              color="secondary"
              height="18"
              rounded
              :striped="task.detectingFaces"
            >
              <template #default="{ value }">
                <strong class="process-percents">{{ Math.ceil(value) }} %</strong>
              </template>
            </v-progress-linear>
            <div class="text-caption text-medium-emphasis mt-1">
              {{ t('media.adding.face_detection_progress', {
                processed: task.faceDetectionProcessed,
                total: task.faceDetectionTotal,
                remaining: task.faceDetectionRemaining,
              }) }}
            </div>
          </div>

          <v-chip
            @click="is_show_added = !is_show_added"
            :text="t('media.adding.added_count', {count: task.added.length})"
            prepend-icon="mdi-plus"
            color="success"
            class="mb-2"
            size="small"
          />
          <v-card v-if="is_show_added" variant="outlined" class="pa-2">
            <v-virtual-scroll
              :height="task.added.length > 10 ? 150 : task.added.length * 15"
              :items="task.added"
              class="virtual-scroller"
              item-height="15"
            >
              <template v-slot:default="{ item }">
                <div class="text-caption selectable">{{ item }}</div>
              </template>
            </v-virtual-scroll>
          </v-card>
        </div>

        <!-- Existing files (by path) -->
        <div v-if="duplicates_by_path.length">
          <v-chip
            @click="is_show_duplicates_by_path = !is_show_duplicates_by_path"
            :text="t('media.adding.existing_count', {count: duplicates_by_path.length})"
            :prepend-icon="duplicateMarkers.inLibrary.icon"
            color="info"
            class="mb-2"
            size="small"
          />
          <v-card v-if="is_show_duplicates_by_path" variant="outlined" class="pa-2">
            <v-virtual-scroll
              :height="duplicates_by_path.length > 10 ? 150 : duplicates_by_path.length * 22"
              :items="duplicates_by_path"
              class="virtual-scroller"
              item-height="22"
            >
              <template v-slot:default="{ item }">
                <DuplicatePathRow
                  :icon="duplicateMarkers.inLibrary.icon"
                  :color="duplicateMarkers.inLibrary.color"
                  :label="t('media.adding.duplicate_file_in_library')"
                  :path="item"
                />
              </template>
            </v-virtual-scroll>
          </v-card>
        </div>

        <!-- Moved files (same content, old path missing) -->
        <div v-if="moved_files.length">
          <v-card-actions class="pa-0 mt-4 mb-2">
            <v-chip
              @click="is_show_moved_files = !is_show_moved_files"
              :text="t('media.adding.moved_files_count', {count: moved_files.length})"
              :prepend-icon="duplicateMarkers.moved.icon"
              color="secondary"
              size="small"
            />

            <v-spacer></v-spacer>

            <v-btn
              @click="relinkMovedFiles"
              :disabled="task.active"
              color="primary"
              class="pr-4"
              variant="flat"
              rounded
              size="small"
            >
              <v-icon icon="mdi-folder-move" class="mr-1"></v-icon>
              {{ t('media.adding.relink_moved_files') }}
            </v-btn>
          </v-card-actions>

          <v-card v-if="is_show_moved_files" variant="outlined" class="pa-2">
            <v-virtual-scroll
              :height="moved_files.length > 10 ? 150 : moved_files.length * 44"
              :items="moved_files"
              class="virtual-scroller"
              item-height="44"
            >
              <template v-slot:default="{ item }">
                <div class="duplicate-entry selectable">
                  <DuplicatePathRow
                    :icon="duplicateMarkers.incoming.icon"
                    :color="duplicateMarkers.incoming.color"
                    :label="t('media.adding.duplicate_file_incoming')"
                    :path="item.path"
                  />
                  <DuplicatePathRow
                    :icon="duplicateMarkers.movedOld.icon"
                    :color="duplicateMarkers.movedOld.color"
                    :label="t('media.adding.duplicate_file_old_path')"
                    :path="item.duplicate?.path"
                  />
                </div>
              </template>
            </v-virtual-scroll>
          </v-card>
        </div>

        <!-- Duplicates by content hash -->
        <div v-if="duplicates_by_content_hash.length">
          <v-card-actions class="pa-0 mt-4 mb-2">
            <v-chip
              @click="is_show_duplicates_by_content_hash = !is_show_duplicates_by_content_hash"
              :text="t('media.adding.duplicates_by_content_count', {count: duplicates_by_content_hash.length})"
              :prepend-icon="duplicateMarkers.contentDuplicate.icon"
              color="warning"
              size="small"
            />

            <v-spacer></v-spacer>

            <v-btn
              @click="deleteDuplicates('incoming')"
              :disabled="task.active"
              color="error"
              class="pr-4"
              variant="flat"
              rounded
              size="small"
            >
              <v-icon :icon="duplicateMarkers.incomingDelete.icon" class="mr-1"/>
              {{ t('media.adding.delete_incoming_files') }}
            </v-btn>

            <v-btn
              @click="deleteDuplicates('existing')"
              :disabled="task.active"
              color="error"
              class="pr-4"
              variant="flat"
              rounded
              size="small"
            >
              <v-icon :icon="duplicateMarkers.inLibraryDelete.icon" class="mr-1"/>
              {{ t('media.adding.delete_existing_files') }}
            </v-btn>
          </v-card-actions>

          <v-card v-if="is_show_duplicates_by_content_hash" variant="outlined" class="pa-2">
            <v-virtual-scroll
              :height="duplicates_by_content_hash.length > 10 ? 150 : duplicates_by_content_hash.length * 44"
              :items="duplicates_by_content_hash"
              class="virtual-scroller"
              item-height="44"
            >
              <template v-slot:default="{ item }">
                <div class="duplicate-entry selectable">
                  <DuplicatePathRow
                    v-if="pathsLookSame(item.path, item.duplicate?.path)"
                    :icon="duplicateMarkers.inLibrary.icon"
                    :color="duplicateMarkers.inLibrary.color"
                    :label="t('media.adding.duplicate_file_in_library')"
                    :path="item.path"
                  />
                  <template v-else>
                    <DuplicatePathRow
                      :icon="duplicateMarkers.incoming.icon"
                      :color="duplicateMarkers.incoming.color"
                      :label="t('media.adding.duplicate_file_incoming')"
                      :path="item.path"
                    />
                    <DuplicatePathRow
                      :icon="duplicateMarkers.inLibrary.icon"
                      :color="duplicateMarkers.inLibrary.color"
                      :label="t('media.adding.duplicate_file_in_library')"
                      :path="item.duplicate?.path"
                    />
                  </template>
                </div>
              </template>
            </v-virtual-scroll>
          </v-card>
        </div>

        <!-- Errors -->
        <div v-if="task.errors.length > 0">
          <v-chip
            @click="is_show_errors = !is_show_errors"
            :text="t('media.adding.errors_count', {count: task.errors.length})"
            color="error"
            class="mb-2 mt-4"
            size="small"
          />
          <v-card v-if="is_show_errors" variant="outlined" class="pa-2">
            <v-virtual-scroll
              :height="task.errors.length > 10 ? 150 : task.errors.length * 15"
              :items="task.errors"
              class="virtual-scroller"
              item-height="15"
            >
              <template v-slot:default="{ item }">
                <div class="text-caption selectable">{{ item }}</div>
              </template>
            </v-virtual-scroll>
          </v-card>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {ref, computed, nextTick, onMounted, watch} from 'vue'
import {useDisplay} from 'vuetify'
import {useI18n} from 'vue-i18n'
import DialogHeader from "@/components/elements/DialogHeader.vue"
import ButtonDocumentation from "@/components/ui/ButtonDocumentation.vue"
import DuplicatePathRow from "@/components/dialogs/DuplicatePathRow.vue"
import {typedApi} from '@/services/typedApi'
import {useAppStore} from '@/stores/app'
import {useTasksStore} from '@/stores/tasks'
import {useItemsStore} from '@/stores/items'
import {useDialogsStore} from '@/stores/dialogs'
import {useEventBus} from '@/utils/eventBus'
import {useItemsListSync} from '@/composable/itemsListSync'
import {useAppShell} from '@/composable/appShell'
import {useMediaAdding} from '@/composable/AddingMedia'
import {deleteLocalFile} from '@/services/fileService'
import {setNotification} from '@/services/notificationService'
import {applyFaceDetectStatusEvent} from '@/utils/faceDetectStreamUi'
import {getErrorResponseData} from '@/types/vue'
import {getDefaultParserTagsMetaId} from '@/services/ensureStarterMeta'
import {
  acceptSuggestedTagsAndAssign,
  applyClipSuggestionsToMedia,
  applyImportPathAutoTags,
} from '@/services/importPathAutoTag'
import {
  ONBOARDING_STEP_COUNT,
  openOnboarding,
  saveOnboardingStep,
  shouldShowOnboarding,
} from '@/composable/useOnboarding'
import {buildVideoGridTaskParams} from '@shared/videoPreview'
import {useSettingsStore} from '@/stores/settings'
import {reloadTagsCatalog} from '@/composable/appCatalogs'

interface DialogHeaderButton {
  icon?: string
  text?: string
  color?: string
  variant?: string
  action?: () => void
}

interface MediaDuplicateDetails {
  id?: number
  path?: string
  parameter?: string
  reason?: string
}

interface MediaAddingDuplicateEntry {
  path: string
  duplicate?: MediaDuplicateDetails
}

interface RecognitionEvent {
  type: string
  processed?: number
  total?: number
  remaining?: number
  suggestions?: Array<{ word?: string }>
  media?: number
  message?: string
}

interface NotificationAction {
  id: string
  text: string
  icon: string
  action: () => void | Promise<void>
  hide?: boolean
}

type DeleteDuplicateType = 'incoming' | 'existing'

const getDuplicateDetails = (duplicate: unknown): MediaDuplicateDetails | undefined =>
  duplicate as MediaDuplicateDetails | undefined

const getErrorMessage = (error: unknown) =>
  getErrorResponseData<{ message?: string }>(error)?.message
  || (error instanceof Error ? error.message : String(error))

// Props - dialog state is controlled via tasksStore.mediaAdding.dialogProcess

// Emits
const emit = defineEmits(['close'])

// Stores and composables
const {xs} = useDisplay()
const {t, locale} = useI18n()
const appStore = useAppStore()
const settingsStore = useSettingsStore()
const tasksStore = useTasksStore()
const itemsStore = useItemsStore()
const dialogsStore = useDialogsStore()
const eventBus = useEventBus()
const listSync = useItemsListSync()
const appShell = useAppShell()
const {reparseTagsForAddedMedia} = useMediaAdding()

// Reactive state
const buttons = ref<DialogHeaderButton[]>([])
const is_show_added = ref(false)
const is_show_duplicates_by_content_hash = ref(false)
const is_show_moved_files = ref(false)
const is_show_duplicates_by_path = ref(false)
const is_show_errors = ref(false)
const clipModelStatus = ref('unknown')
const clipModelDownloading = ref(false)
const faceModelStatus = ref('unknown')
const faceModelDownloading = ref(false)
const acceptingSuggestedTags = ref(false)
const applyingClipSuggestions = ref(false)
const pathAutoTagSummary = ref('')
const smartWizard = ref({
  pathTags: true,
  grids: true,
  faces: false,
  clip: false,
  clipTags: true,
})
const smartWizardRunning = ref(false)
const smartWizardProgress = ref(0)
const smartWizardStatus = ref('')
let smartWizardAbort: AbortController | null = null
let smartWizardTaskId: string | null = null

let objectRecognitionAbort: AbortController | null = null
let objectRecognitionTaskId: string | null = null
let faceDetectionAbort: AbortController | null = null
let faceDetectionTaskId: string | null = null

const stopBackgroundJobs = () => {
  if (objectRecognitionAbort) {
    objectRecognitionAbort.abort()
    objectRecognitionAbort = null
  }
  if (objectRecognitionTaskId) {
    tasksStore.removeTask(objectRecognitionTaskId)
    objectRecognitionTaskId = null
  }
  if (faceDetectionAbort) {
    faceDetectionAbort.abort()
    faceDetectionAbort = null
  }
  if (faceDetectionTaskId) {
    tasksStore.removeTask(faceDetectionTaskId)
    faceDetectionTaskId = null
  }
  if (smartWizardAbort) {
    smartWizardAbort.abort()
    smartWizardAbort = null
  }
  if (smartWizardTaskId) {
    tasksStore.removeTask(smartWizardTaskId)
    smartWizardTaskId = null
  }
  smartWizardRunning.value = false
  task.value.recognizingObjects = false
  task.value.detectingFaces = false
}

const closeProcessDialog = () => {
  stopBackgroundJobs()
  // When adding is idle, dismiss the related notification/task with the dialog.
  if (!task.value.active) {
    const notificationTaskId = task.value.notificationTaskId
    if (notificationTaskId) {
      tasksStore.removeTask(notificationTaskId)
      task.value.notificationTaskId = null
    }
  }
  tasksStore.mediaAdding.dialogProcess = false
  emit('close')
}

const duplicateMarkers = {
  inLibrary: {
    icon: 'mdi-database-check',
    color: 'info',
  },
  incoming: {
    icon: 'mdi-file-import-outline',
    color: 'warning',
  },
  incomingDelete: {
    icon: 'mdi-file-remove-outline',
    color: 'error',
  },
  inLibraryDelete: {
    icon: 'mdi-database-remove-outline',
    color: 'error',
  },
  contentDuplicate: {
    icon: 'mdi-file-compare',
    color: 'warning',
  },
  moved: {
    icon: 'mdi-folder-move-outline',
    color: 'secondary',
  },
  movedOld: {
    icon: 'mdi-database-off-outline',
    color: 'secondary',
  },
}

// Computed properties
const task = computed(() => tasksStore.mediaAdding)
const isAddedVideo = computed(() =>
  String(task.value.addedMediaType || '').toLowerCase() === 'video',
)
const canRecognizeObjects = computed(() => (
  task.value.finished &&
  task.value.added.length > 0 &&
  isAddedVideo.value
))
const canDetectFaces = canRecognizeObjects
const canReparseTags = computed(() => (
  task.value.finished &&
  task.value.addedMedia.length > 0
))
const clipModelReady = computed(() => ['downloaded', 'loaded'].includes(clipModelStatus.value))
const clipModelNeedsDownload = computed(() => (
  !clipModelReady.value && !['loading'].includes(clipModelStatus.value)
))
const faceModelReady = computed(() => ['downloaded', 'loaded'].includes(faceModelStatus.value))
const faceModelNeedsDownload = computed(() => (
  !faceModelReady.value && !['loading'].includes(faceModelStatus.value)
))
const canMakeLibrarySmart = computed(() => (
  task.value.finished &&
  task.value.addedMedia.length > 0
))
const canRunSmartWizard = computed(() =>
  canMakeLibrarySmart.value &&
  (
    smartWizard.value.pathTags
    || (isAddedVideo.value && (
      smartWizard.value.grids
      || smartWizard.value.faces
      || smartWizard.value.clip
    ))
  ) &&
  !(smartWizard.value.faces && faceModelNeedsDownload.value) &&
  !(smartWizard.value.clip && clipModelNeedsDownload.value)
)

function addedMediaIds(): number[] {
  return (task.value.addedMedia || [])
    .map((entry) => Number(entry.mediaId))
    .filter((id) => Number.isFinite(id) && id > 0)
}

const duplicates_by_path = computed((): string[] => {
  return (task.value.duplicates as MediaAddingDuplicateEntry[])
    .filter(i => getDuplicateDetails(i.duplicate)?.parameter === 'path')
    .map(i => i.path)
})

const duplicates_by_content_hash = computed((): MediaAddingDuplicateEntry[] => {
  return (task.value.duplicates as MediaAddingDuplicateEntry[])
    .filter(i => {
      const duplicate = getDuplicateDetails(i.duplicate)
      const parameter = duplicate?.parameter
      return (
        (parameter === 'content_hash' || parameter === 'oshash' || parameter === 'basename_filesize')
        && duplicate?.reason === 'duplicate'
      )
    })
})

const moved_files = computed((): MediaAddingDuplicateEntry[] => {
  return (task.value.duplicates as MediaAddingDuplicateEntry[]).filter(i => {
    const duplicate = getDuplicateDetails(i.duplicate)
    const parameter = duplicate?.parameter
    return (
      (parameter === 'content_hash' || parameter === 'oshash' || parameter === 'basename_filesize')
      && duplicate?.reason === 'moved'
    )
  })
})

// Methods
const initButtons = () => {
  buttons.value = [{
    icon: "stop",
    text: t("common.stop"),
    color: "error",
    variant: "flat",
    action: stop,
  }]
}

const clearStopButton = () => {
  buttons.value = []
}

const syncStopButton = () => {
  const running = Boolean(task.value?.active && !task.value?.finished && !task.value?.stopped)
  if (running) {
    if (!buttons.value.length) initButtons()
    return
  }
  clearStopButton()
}

const stop = () => {
  tasksStore.mediaAdding.stopped = true
  clearStopButton()
  const notificationTaskId = task.value.notificationTaskId
  if (notificationTaskId) {
    tasksStore.updateTask(notificationTaskId, {
      action: undefined,
      done: true,
      subtitle: t('common.stop'),
    })
  }
}

const reparseTags = async () => {
  await reparseTagsForAddedMedia()
}

const pathsLookSame = (left: unknown, right: unknown) => {
  if (!left || !right) return false
  return left === right || String(left).toLowerCase() === String(right).toLowerCase()
}

const deleteDuplicates = async (delete_type: DeleteDuplicateType) => {
  dialogsStore.confirm.show = true
  dialogsStore.confirm.text = t('media.adding.delete_files_confirm')
  dialogsStore.confirm.action = async () => {
    try {
      const dupes = (task.value.duplicates as MediaAddingDuplicateEntry[]).filter(i => {
        const duplicate = getDuplicateDetails(i.duplicate)
        const parameter = duplicate?.parameter
        return (
          (parameter === 'content_hash' || parameter === 'oshash' || parameter === 'basename_filesize')
          && duplicate?.reason === 'duplicate'
        )
      })

      for (const dupe of dupes) {
        const duplicate = getDuplicateDetails(dupe.duplicate)
        const file_path = delete_type === 'incoming' ? dupe.path : duplicate?.path

        if (!file_path) continue

        try {
          await deleteLocalFile(file_path)
        } catch (error) {
          console.error('Error deleting local file:', error)
        }

        if (delete_type === 'existing' && duplicate?.id) {
          await typedApi.updateMediaPath({
            id: duplicate.id,
            path: dupe.path,
          })
        }
      }

      if (delete_type === "existing") {
        const ids = dupes.map(i => getDuplicateDetails(i.duplicate)?.id).filter(Boolean) as number[]

        if (ids.length > 0) {
          listSync.getItemsFromDb({
            ids: ids,
            type: 'media',
          })
        }
      }

      emit('close')

      setNotification({
        type: 'success',
        title: t('media.adding.deleting_files'),
        text: t('media.adding.files_deleted')
      })

      eventBus.emit('update:watcher')

    } catch (error) {
      console.error('Error deleting duplicates:', error)
    }
  }
}

const relinkMovedFiles = async () => {
  const dupes = moved_files.value

  if (!dupes.length) return

  try {
    for (const dupe of dupes) {
      const duplicate = getDuplicateDetails(dupe.duplicate)
      if (!duplicate?.id || !dupe.path) continue

      await typedApi.updateMediaPath({
        id: duplicate.id,
        path: dupe.path,
      })
    }

    const ids = dupes.map(i => getDuplicateDetails(i.duplicate)?.id).filter(Boolean) as number[]

    if (ids.length > 0) {
      listSync.getItemsFromDb({
        ids: ids,
        type: 'media',
      })
    }

    setNotification({
      type: 'success',
      title: t('media.adding.relink_moved_files'),
      text: t('media.adding.paths_relinked', {count: dupes.length}),
    })

    eventBus.emit('update:watcher')
  } catch (error) {
    console.error('Error relinking moved files:', error)
    setNotification({
      type: 'error',
      title: t('media.adding.relink_moved_files'),
      text: getErrorMessage(error),
    })
  }
}

const openSuggestedTags = () => {
  appShell.openTagsAddWithNames({
    names: task.value.suggestedTags || [],
    metaId: getDefaultParserTagsMetaId(appStore.meta, settingsStore.defaultTagCategoryId) ?? undefined,
    title: t('media.adding.suggested_tags_from_added_files'),
  })
}

const acceptAllSuggestedTags = async () => {
  const names = uniqueNames(task.value.suggestedTags || [])
  if (!names.length) return

  const metaId = getDefaultParserTagsMetaId(appStore.meta, settingsStore.defaultTagCategoryId)
  if (!metaId) {
    openSuggestedTags()
    return
  }

  acceptingSuggestedTags.value = true
  try {
    const result = await acceptSuggestedTagsAndAssign(names, addedMediaIds())
    task.value.suggestedTags = []
    listSync.getItemsFromDb({
      ids: addedMediaIds(),
      type: 'media',
    })
    setNotification({
      type: 'success',
      title: t('media.adding.accept_all_suggested_tags'),
      text: t('media.adding.accept_all_suggested_tags_done', {
        created: result.createdTags,
        applied: result.applied,
      }),
    })
  } catch (error) {
    console.error('Error accepting suggested tags:', error)
    setNotification({
      type: 'error',
      title: t('media.adding.accept_all_suggested_tags'),
      text: getErrorMessage(error),
    })
  } finally {
    acceptingSuggestedTags.value = false
  }
}

const applyClipSuggestedTags = async () => {
  const names = uniqueNames(task.value.videoSuggestedTags || task.value.suggestedTags || [])
  if (!names.length) return
  applyingClipSuggestions.value = true
  try {
    const mediaIds = addedMediaIds()
    const suggestions = names.map((word) => ({word, mediaIds}))
    const result = await applyClipSuggestionsToMedia(suggestions, mediaIds)
    task.value.videoSuggestedTags = []
    listSync.getItemsFromDb({ids: mediaIds, type: 'media'})
    setNotification({
      type: 'success',
      title: t('media.adding.apply_clip_suggestions'),
      text: t('media.adding.apply_clip_suggestions_done', {
        created: result.createdTags,
        applied: result.applied,
      }),
    })
  } catch (error) {
    console.error('Error applying CLIP suggestions:', error)
    setNotification({
      type: 'error',
      title: t('media.adding.apply_clip_suggestions'),
      text: getErrorMessage(error),
    })
  } finally {
    applyingClipSuggestions.value = false
  }
}

const uniqueNames = (items: string[]) => {
  const seen = new Set<string>()
  return items.filter((name) => {
    const key = String(name || '').trim().toLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const openProcessAction = (): NotificationAction => ({
  id: 'open-media-adding-process',
  text: t('media.adding.open_process_dialog'),
  icon: 'open-in-new',
  action: async () => {
    if (task.value.dialogProcess) return
    await nextTick()
    task.value.dialogProcess = true
  },
  hide: true,
})

const fetchClipModelStatus = async () => {
  try {
    const response = await typedApi.getClipModelStatus()
    clipModelStatus.value = response.data?.status || 'unknown'
  } catch (error) {
    console.error('Error checking CLIP model status:', error)
    clipModelStatus.value = 'error'
  }
}

const downloadClipModel = async () => {
  clipModelDownloading.value = true
  clipModelStatus.value = 'loading'

  try {
    const response = await typedApi.downloadClipModel()
    clipModelStatus.value = response.data?.status || 'downloaded'
    setNotification({
      type: 'success',
      title: t('media.adding.download_video_recognition_model'),
      text: t('settings.path_parser.statuses.downloaded'),
    })
  } catch (error) {
    console.error('Error downloading CLIP model:', error)
    clipModelStatus.value = 'error'
    setNotification({
      type: 'error',
      title: t('media.adding.download_video_recognition_model'),
      text: getErrorMessage(error),
    })
  } finally {
    clipModelDownloading.value = false
  }
}

const recognizeVideoObjects = async () => {
  if (!clipModelReady.value) {
    setNotification({
      type: 'warning',
      title: t('media.adding.recognize_video_objects'),
      text: t('media.adding.download_video_recognition_model_hint'),
    })
    return
  }

  task.value.recognizingObjects = true
  task.value.objectRecognitionProgress = 0
  task.value.objectRecognitionProcessed = 0
  task.value.objectRecognitionTotal = task.value.added.length
  task.value.objectRecognitionRemaining = task.value.added.length

  const previousStatus = task.value.status
  task.value.status = t('media.adding.recognizing_video_objects')
  const controller = new AbortController()
  objectRecognitionAbort = controller
  const recognitionTaskId = tasksStore.setTask({
    title: t('media.adding.recognizing_video_objects'),
    subtitle: t('media.adding.video_object_recognition_progress', {
      processed: 0,
      total: task.value.added.length,
      remaining: task.value.added.length,
    }),
    icon: 'image-search-outline',
    progress: 0,
    click: () => {
      task.value.dialogProcess = true
    },
    action: () => {
      controller.abort()
    },
  })
  objectRecognitionTaskId = recognitionTaskId

  try {
    let names: string[] = []

    await typedApi.streamVideoObjectRecognition(
      {
        paths: task.value.added,
        mediaTypeId: task.value.addedMediaTypeId,
        locale: locale.value,
        framesPerVideo: 4,
        limit: 50,
        excludeExisting: true,
      },
      {signal: controller.signal},
      (event: RecognitionEvent) => {
        if (event.type === 'progress') {
          task.value.objectRecognitionProcessed = event.processed || 0
          task.value.objectRecognitionTotal = event.total || task.value.objectRecognitionTotal || 0
          task.value.objectRecognitionRemaining = event.remaining ?? Math.max(task.value.objectRecognitionTotal - task.value.objectRecognitionProcessed, 0)
          task.value.objectRecognitionProgress = task.value.objectRecognitionTotal
            ? Math.min((task.value.objectRecognitionProcessed / task.value.objectRecognitionTotal) * 100, 100)
            : 0

          tasksStore.updateTask(recognitionTaskId, {
            subtitle: t('media.adding.video_object_recognition_progress', {
              processed: task.value.objectRecognitionProcessed,
              total: task.value.objectRecognitionTotal,
              remaining: task.value.objectRecognitionRemaining,
            }),
            progress: task.value.objectRecognitionProgress,
          })
        }

        if (event.type === 'complete') {
          names = (event.suggestions || [])
            .map((item: { word?: string }) => item.word)
            .filter((word): word is string => Boolean(word))
            .slice(0, 50)

          task.value.objectRecognitionProcessed = event.media || task.value.objectRecognitionTotal
          task.value.objectRecognitionTotal = event.media || task.value.objectRecognitionTotal
          task.value.objectRecognitionRemaining = 0
          task.value.objectRecognitionProgress = 100

          tasksStore.updateTask(recognitionTaskId, {
            subtitle: t('media.adding.video_object_recognition_complete'),
            progress: 100,
            color: 'success',
            done: true,
            action: undefined,
          })
        }

        if (event.type === 'error') {
          throw new Error(event.message || 'Object recognition failed')
        }
      },
    )

    task.value.videoSuggestedTags = names
    task.value.suggestedTags = uniqueNames([
      ...(task.value.suggestedTags || []),
      ...names,
    ]).slice(0, 80)

    if (names.length > 0) {
      setNotification({
        type: 'success',
        title: t('media.adding.video_object_recognition_complete'),
        text: t('media.adding.video_object_tags_found', {count: names.length}),
        actions: [openProcessAction()],
      })
    } else {
      setNotification({
        type: 'info',
        title: t('media.adding.video_object_recognition_complete'),
        text: t('media.adding.video_object_tags_not_found'),
        actions: [openProcessAction()],
      })
    }
  } catch (error) {
    console.error('Error recognizing video objects:', error)
    const isAbortError = error instanceof Error && error.name === 'AbortError'
    if (isAbortError) {
      if (objectRecognitionTaskId === recognitionTaskId) {
        tasksStore.removeTask(recognitionTaskId)
      }
    } else {
      tasksStore.updateTask(recognitionTaskId, {
        subtitle: t('media.adding.video_object_recognition_failed'),
        color: 'error',
        done: true,
        action: undefined,
      })
      setNotification({
        type: 'error',
        title: t('media.adding.video_object_recognition_failed'),
        text: getErrorMessage(error),
      })
    }
  } finally {
    if (objectRecognitionAbort === controller) objectRecognitionAbort = null
    task.value.status = previousStatus
    task.value.recognizingObjects = false
  }
}

const fetchFaceModelStatus = async () => {
  try {
    const response = await typedApi.getFaceModelStatus()
    faceModelStatus.value = response.data?.status || 'unknown'
  } catch (error) {
    console.error('Error checking face model status:', error)
    faceModelStatus.value = 'error'
  }
}

const downloadFaceModel = async () => {
  faceModelDownloading.value = true
  faceModelStatus.value = 'loading'

  try {
    const response = await typedApi.downloadFaceModel()
    faceModelStatus.value = response.data?.status || 'downloaded'
    setNotification({
      type: 'success',
      title: t('media.adding.download_face_model'),
      text: t('settings.path_parser.statuses.downloaded'),
    })
  } catch (error) {
    console.error('Error downloading face model:', error)
    faceModelStatus.value = 'error'
    setNotification({
      type: 'error',
      title: t('media.adding.download_face_model'),
      text: getErrorMessage(error),
    })
  } finally {
    faceModelDownloading.value = false
  }
}

const detectFacesInAddedVideos = async () => {
  if (!faceModelReady.value) {
    setNotification({
      type: 'warning',
      title: t('media.adding.detect_faces'),
      text: t('media.adding.download_face_model_hint'),
    })
    return
  }

  task.value.detectingFaces = true
  task.value.faceDetectionProgress = 0
  task.value.faceDetectionProcessed = 0
  task.value.faceDetectionTotal = task.value.added.length
  task.value.faceDetectionRemaining = task.value.added.length
  task.value.facesFound = 0

  const previousStatus = task.value.status
  task.value.status = t('media.adding.detect_faces')
  const controller = new AbortController()
  faceDetectionAbort = controller
  const detectionTaskId = tasksStore.setTask({
    title: t('media.adding.detect_faces'),
    subtitle: t('media.adding.face_detection_progress', {
      processed: 0,
      total: task.value.added.length,
      remaining: task.value.added.length,
    }),
    icon: 'face-recognition',
    progress: 0,
    click: () => {
      task.value.dialogProcess = true
    },
    action: () => {
      controller.abort()
    },
  })
  faceDetectionTaskId = detectionTaskId

  try {
    const refreshedMediaIds = new Set<number>()

    await typedApi.streamFaceDetection(
      {
        paths: task.value.added,
        force: false,
        framesPerVideo: 6,
      },
      {signal: controller.signal},
      (event: Record<string, unknown>) => {
        if (applyFaceDetectStatusEvent(event, {
          notify: ({type, textKey}) => {
            setNotification({type, text: t(textKey)})
          },
          updateTask: ({subtitleKey, progress}) => {
            tasksStore.updateTask(detectionTaskId, {
              subtitle: t(subtitleKey),
              ...(progress != null ? {progress} : {}),
            })
          },
        })) {
          return
        }

        if (event.type === 'progress') {
          const mediaId = Number(event.mediaId)
          if (Number.isFinite(mediaId) && mediaId > 0) refreshedMediaIds.add(mediaId)
          task.value.faceDetectionProcessed = Number(event.processed || 0)
          task.value.faceDetectionTotal = Number(event.total || task.value.faceDetectionTotal || 0)
          task.value.faceDetectionRemaining = Number(
            event.remaining ?? Math.max(task.value.faceDetectionTotal - task.value.faceDetectionProcessed, 0),
          )
          task.value.facesFound = Number(event.faces || 0)
          task.value.faceDetectionProgress = task.value.faceDetectionTotal
            ? Math.min((task.value.faceDetectionProcessed / task.value.faceDetectionTotal) * 100, 100)
            : 0
          tasksStore.updateTask(detectionTaskId, {
            subtitle: t('media.adding.face_detection_progress', {
              processed: task.value.faceDetectionProcessed,
              total: task.value.faceDetectionTotal,
              remaining: task.value.faceDetectionRemaining,
            }),
            progress: task.value.faceDetectionProgress,
          })
        }

        if (event.type === 'complete') {
          task.value.faceDetectionProcessed = Number(event.processed || task.value.faceDetectionTotal)
          task.value.faceDetectionTotal = Number(event.total || task.value.faceDetectionTotal)
          task.value.faceDetectionRemaining = 0
          task.value.faceDetectionProgress = 100
          task.value.facesFound = Number(event.faces || 0)
          tasksStore.updateTask(detectionTaskId, {
            subtitle: t('media.adding.faces_found', {count: task.value.facesFound}),
            progress: 100,
            color: 'success',
            done: true,
            action: undefined,
          })
        }

        if (event.type === 'error') {
          throw new Error(String(event.message || 'Face detection failed'))
        }
      },
    )

    if (refreshedMediaIds.size) {
      listSync.getItemsFromDb({
        ids: [...refreshedMediaIds],
        type: 'media',
      })
    }

    if (task.value.facesFound > 0) {
      setNotification({
        type: 'success',
        title: t('media.adding.face_detection_complete'),
        text: t('media.adding.faces_found', {count: task.value.facesFound}),
        actions: [openProcessAction()],
      })
    } else {
      setNotification({
        type: 'info',
        title: t('media.adding.face_detection_complete'),
        text: t('media.adding.faces_not_found'),
        actions: [openProcessAction()],
      })
    }
  } catch (error) {
    console.error('Error detecting faces:', error)
    const isAbortError = error instanceof Error && error.name === 'AbortError'
    if (isAbortError) {
      if (faceDetectionTaskId === detectionTaskId) {
        tasksStore.removeTask(detectionTaskId)
      }
    } else {
      tasksStore.updateTask(detectionTaskId, {
        subtitle: t('media.adding.face_detection_failed'),
        color: 'error',
        done: true,
        action: undefined,
      })
      setNotification({
        type: 'error',
        title: t('media.adding.face_detection_failed'),
        text: getErrorMessage(error),
      })
    }
  } finally {
    if (faceDetectionAbort === controller) faceDetectionAbort = null
    task.value.status = previousStatus
    task.value.detectingFaces = false
  }
}

const runSmartLibraryWizard = async () => {
  if (!canRunSmartWizard.value || smartWizardRunning.value) return

  const steps: Array<'pathTags' | 'grids' | 'faces' | 'clip'> = []
  if (smartWizard.value.pathTags) steps.push('pathTags')
  if (isAddedVideo.value && smartWizard.value.grids) steps.push('grids')
  if (isAddedVideo.value && smartWizard.value.faces) steps.push('faces')
  if (isAddedVideo.value && smartWizard.value.clip) steps.push('clip')
  if (!steps.length) return

  smartWizardRunning.value = true
  smartWizardProgress.value = 0
  pathAutoTagSummary.value = ''
  smartWizardStatus.value = t('media.adding.make_library_smart')
  const controller = new AbortController()
  smartWizardAbort = controller
  const trayTaskId = tasksStore.setTask({
    title: t('media.adding.make_library_smart'),
    subtitle: t('media.adding.make_library_smart_hint'),
    icon: 'auto-fix',
    progress: 0,
    click: () => {
      task.value.dialogProcess = true
    },
    action: () => {
      controller.abort()
    },
  })
  smartWizardTaskId = trayTaskId

  const mediaEntries = task.value.addedMedia || []
  const mediaIds = addedMediaIds()

  try {
    for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
      if (controller.signal.aborted) break
      const step = steps[stepIndex]
      const base = (stepIndex / steps.length) * 100
      const span = 100 / steps.length

      if (step === 'pathTags') {
        smartWizardStatus.value = t('media.adding.make_library_smart_path_tags')
        tasksStore.updateTask(trayTaskId, {
          subtitle: t('media.adding.make_library_smart_path_tags'),
          progress: base + span * 0.2,
        })
        const result = await applyImportPathAutoTags(mediaIds, {signal: controller.signal})
        pathAutoTagSummary.value = t('media.adding.make_library_smart_path_tags_done', {
          created: result.createdTags,
          applied: result.applied,
          media: result.mediaWithTags,
        })
        if (mediaIds.length) {
          listSync.getItemsFromDb({ids: mediaIds, type: 'media'})
        }
        smartWizardProgress.value = base + span
        tasksStore.updateTask(trayTaskId, {
          subtitle: pathAutoTagSummary.value,
          progress: smartWizardProgress.value,
        })
      }

      if (step === 'grids') {
        smartWizardStatus.value = t('media.adding.make_library_smart_grids')
        for (let i = 0; i < mediaEntries.length; i++) {
          if (controller.signal.aborted) break
          const entry = mediaEntries[i]
          smartWizardProgress.value = base + ((i + 1) / Math.max(mediaEntries.length, 1)) * span
          tasksStore.updateTask(trayTaskId, {
            subtitle: t('media.adding.make_library_smart_grids_progress', {
              processed: i + 1,
              total: mediaEntries.length,
            }),
            progress: smartWizardProgress.value,
          })
          try {
            await typedApi.taskCreateGrid(buildVideoGridTaskParams(entry.path, `${entry.mediaId}.jpg`))
            itemsStore.refreshThumb(entry.mediaId, {broadcast: false})
            eventBus.emit('updateVideoFrames', entry.mediaId)
            listSync.getItemsFromDb({ids: [entry.mediaId], type: 'media'})
          } catch (error) {
            console.error(`Failed to create grid for media ${entry.mediaId}:`, error)
          }
        }
      }

      if (step === 'faces') {
        smartWizardStatus.value = t('media.adding.detect_faces')
        await typedApi.streamFaceDetection(
          {
            mediaIds,
            paths: task.value.added,
            force: false,
            framesPerVideo: 6,
          },
          {signal: controller.signal},
          (event: Record<string, unknown>) => {
            if (event.type === 'progress') {
              const processed = Number(event.processed || 0)
              const total = Number(event.total || mediaIds.length || 1)
              smartWizardProgress.value = base + (processed / Math.max(total, 1)) * span
              task.value.facesFound = Number(event.faces || 0)
              tasksStore.updateTask(trayTaskId, {
                subtitle: t('media.adding.face_detection_progress', {
                  processed,
                  total,
                  remaining: Number(event.remaining ?? Math.max(total - processed, 0)),
                }),
                progress: smartWizardProgress.value,
              })
            }
            if (event.type === 'error') {
              throw new Error(String(event.message || 'Face detection failed'))
            }
          },
        )
        if (mediaIds.length) {
          listSync.getItemsFromDb({ids: mediaIds, type: 'media'})
        }
      }

      if (step === 'clip') {
        smartWizardStatus.value = t('media.adding.make_library_smart_clip')
        const clipSpan = smartWizard.value.clipTags ? span * 0.55 : span
        await typedApi.streamBackfill(
          'clipEmbedding',
          {mediaIds, signal: controller.signal},
          (event) => {
            if (event.type === 'progress') {
              const processed = Number(event.processed || 0)
              const total = Number(event.total || mediaIds.length || 1)
              smartWizardProgress.value = base + (processed / Math.max(total, 1)) * clipSpan
              tasksStore.updateTask(trayTaskId, {
                subtitle: t('media.adding.make_library_smart_clip_progress', {
                  processed,
                  total,
                }),
                progress: smartWizardProgress.value,
              })
            }
            if (event.type === 'error') {
              throw new Error(String(event.message || 'CLIP embedding failed'))
            }
          },
        )

        if (smartWizard.value.clipTags && clipModelReady.value && !controller.signal.aborted) {
          smartWizardStatus.value = t('media.adding.make_library_smart_clip_tags')
          tasksStore.updateTask(trayTaskId, {
            subtitle: t('media.adding.make_library_smart_clip_tags'),
            progress: base + clipSpan + (span - clipSpan) * 0.4,
          })
          const response = await typedApi.suggestTagsFromVideoFrames({
            paths: task.value.added,
            mediaTypeId: task.value.addedMediaTypeId ?? undefined,
            framesPerVideo: 4,
            limit: 50,
            excludeExisting: true,
          })
          if (controller.signal.aborted) break
          const clipSuggestions = Array.isArray(response.data?.suggestions)
            ? response.data.suggestions
            : []
          const names = clipSuggestions
            .map((item) => item.word)
            .filter((word): word is string => Boolean(word))
          task.value.videoSuggestedTags = uniqueNames(names)
          task.value.suggestedTags = uniqueNames([
            ...(task.value.suggestedTags || []),
            ...names,
          ]).slice(0, 80)

          if (clipSuggestions.length) {
            const applyResult = await applyClipSuggestionsToMedia(clipSuggestions, mediaIds)
            pathAutoTagSummary.value = [
              pathAutoTagSummary.value,
              t('media.adding.apply_clip_suggestions_done', {
                created: applyResult.createdTags,
                applied: applyResult.applied,
              }),
            ].filter(Boolean).join(' · ')
            if (mediaIds.length) {
              listSync.getItemsFromDb({ids: mediaIds, type: 'media'})
            }
          }
          smartWizardProgress.value = base + span
        }
      }
    }

    if (!controller.signal.aborted) {
      smartWizardProgress.value = 100
      smartWizardStatus.value = pathAutoTagSummary.value || t('media.adding.make_library_smart_done')
      tasksStore.updateTask(trayTaskId, {
        subtitle: smartWizardStatus.value,
        progress: 100,
        color: 'success',
        done: true,
        action: undefined,
      })
      setNotification({
        type: 'success',
        title: t('media.adding.make_library_smart'),
        text: smartWizardStatus.value,
        actions: [openProcessAction()],
      })
    } else {
      tasksStore.removeTask(trayTaskId)
    }
  } catch (error) {
    const isAbortError = error instanceof Error && error.name === 'AbortError'
    if (isAbortError) {
      tasksStore.removeTask(trayTaskId)
    } else {
      console.error('Smart library wizard failed:', error)
      tasksStore.updateTask(trayTaskId, {
        subtitle: t('media.adding.make_library_smart_failed'),
        color: 'error',
        done: true,
        action: undefined,
      })
      setNotification({
        type: 'error',
        title: t('media.adding.make_library_smart_failed'),
        text: getErrorMessage(error),
      })
    }
  } finally {
    if (smartWizardAbort === controller) smartWizardAbort = null
    if (smartWizardTaskId === trayTaskId) smartWizardTaskId = null
    smartWizardRunning.value = false
  }
}


// Lifecycle
onMounted(() => {
  syncStopButton()
  if (task.value && !task.value.finished) {
    task.value.active = true
  }
})

// Watchers
watch(() => tasksStore.mediaAdding.dialogProcess, (open, wasOpen) => {
  if (wasOpen && !open) {
    stopBackgroundJobs()
    if (!task.value.active) {
      const notificationTaskId = task.value.notificationTaskId
      if (notificationTaskId) {
        tasksStore.removeTask(notificationTaskId)
        task.value.notificationTaskId = null
      }
    }
    if (shouldShowOnboarding(false)) {
      void saveOnboardingStep(ONBOARDING_STEP_COUNT - 1).then(() => {
        openOnboarding()
      })
    }
  }
})

watch(
  () => [task.value?.active, task.value?.finished, task.value?.stopped] as const,
  () => {
    syncStopButton()
  },
)

watch(() => task.value?.finished, (finished) => {
  if (finished) {
    clearStopButton()
    if (task.value) {
      task.value.progress = 100
    }
    const notificationTaskId = task.value?.notificationTaskId
    if (notificationTaskId) {
      tasksStore.updateTask(notificationTaskId, {
        done: true,
        action: undefined,
      })
    }
    if (
      task.value.added.length > 0 &&
      String(task.value.addedMediaType || '').toLowerCase() === 'video'
    ) {
      fetchClipModelStatus()
      fetchFaceModelStatus()
    }
  }
})

watch(canRecognizeObjects, (enabled) => {
  if (enabled) {
    fetchClipModelStatus()
    fetchFaceModelStatus()
  }
})
</script>

<style lang="scss" scoped>
.process-percents {
  background-color: rgba(255, 255, 255, 0.5);
  padding: 1px 4px 1px;
  border-radius: 10px;
  line-height: 1;
}

.selectable {
  user-select: text;
  cursor: text;
}

.virtual-scroller {
  :deep(.v-virtual-scroll__item) {
    &:hover {
      background-color: rgba(0, 0, 0, 0.05);
    }
  }
}

.duplicate-entry {
  display: flex;
  flex-direction: column;
  gap: 4px;
  justify-content: center;
  min-height: 40px;
}
</style>