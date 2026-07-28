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
import {useDialogsStore} from '@/stores/dialogs'
import {useEventBus} from '@/utils/eventBus'
import {useItemsListSync} from '@/composable/itemsListSync'
import {useAppShell} from '@/composable/appShell'
import {useMediaAdding} from '@/composable/AddingMedia'
import {deleteLocalFile} from '@/services/fileService'
import {setNotification} from '@/services/notificationService'
import {getErrorResponseData} from '@/types/vue'
import {getDefaultParserTagsMetaId} from '@/services/ensureStarterMeta'
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
const tasksStore = useTasksStore()
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
const canRecognizeObjects = computed(() => (
  task.value.finished &&
  task.value.added.length > 0 &&
  String(task.value.addedMediaType || '').toLowerCase() === 'video'
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
    metaId: getDefaultParserTagsMetaId(appStore.meta) ?? undefined,
    title: t('media.adding.suggested_tags_from_added_files'),
  })
}

const acceptAllSuggestedTags = async () => {
  const names = uniqueNames(task.value.suggestedTags || [])
  if (!names.length) return

  const metaId = getDefaultParserTagsMetaId(appStore.meta)
  if (!metaId) {
    openSuggestedTags()
    return
  }

  acceptingSuggestedTags.value = true
  try {
    const existing = new Set(
      (appStore.tags || []).map((tag) => String(tag.name || '').trim().toLowerCase()),
    )
    const toCreate = names.filter((name) => !existing.has(name.toLowerCase()))

    if (toCreate.length > 0) {
      await typedApi.createTags(
        toCreate.map((name) => ({
          name,
          metaId,
        })),
      )
      await reloadTagsCatalog()
    }

    task.value.suggestedTags = []
    setNotification({
      type: 'success',
      title: t('media.adding.accept_all_suggested_tags'),
      text: t('notifications_text.added_list', {
        items: (toCreate.length ? toCreate : names).join(', '),
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
    const response = await fetch(`${appStore.localhost}/api/Task/streamVideoObjectRecognition`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      signal: controller.signal,
      body: JSON.stringify({
        paths: task.value.added,
        mediaTypeId: task.value.addedMediaTypeId,
        locale: locale.value,
        framesPerVideo: 4,
        limit: 50,
        excludeExisting: true,
      })
    })

    if (!response.ok || !response.body) {
      throw new Error(response.statusText || 'Object recognition request failed')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let names: string[] = []

    const handleEvent = (event: RecognitionEvent) => {
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
    }

    while (true) {
      const {value, done} = await reader.read()
      if (done) break

      buffer += decoder.decode(value, {stream: true})
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue
        handleEvent(JSON.parse(line))
      }
    }

    if (buffer.trim()) {
      handleEvent(JSON.parse(buffer))
    }

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
    const response = await fetch(`${appStore.localhost}/api/Task/streamFaceDetection`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      signal: controller.signal,
      body: JSON.stringify({
        paths: task.value.added,
        force: false,
        framesPerVideo: 6,
      }),
    })

    if (!response.ok || !response.body) {
      throw new Error(response.statusText || 'Face detection request failed')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    const handleEvent = (event: Record<string, unknown>) => {
      if (event.type === 'progress') {
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
    }

    while (true) {
      const {value, done} = await reader.read()
      if (done) break

      buffer += decoder.decode(value, {stream: true})
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue
        handleEvent(JSON.parse(line))
      }
    }

    if (buffer.trim()) {
      handleEvent(JSON.parse(buffer))
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