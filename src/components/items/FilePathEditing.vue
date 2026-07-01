<template>
  <div class="editing">
    <v-card class="rounded-xl" color="rgba(150, 150, 150, 0.09)" flat>
      <v-card-text class="pb-0">
        <div class="text-medium-emphasis text-caption">{{ t('media.file_path.operations') }}</div>
        <div>
          <span>{{ t('media.file_path.full_path') }} </span>
          <span>{{ display_path }}</span>
        </div>

        <v-alert
          v-if="!is_file_exists"
          type="error"
          icon="mdi-file-alert"
          class="caption mb-0 mt-2"
          density="compact"
          variant="tonal"
          rounded="xl"
        >
          {{ fileMissingAlertMessage }}
        </v-alert>
      </v-card-text>

      <v-card-actions class="flex-wrap px-4 pb-4">
        <v-btn
          @click="openDialogEdit"
          color="primary"
          variant="flat"
          rounded="xl"
          class="px-4"
        >
          <v-icon start icon="mdi-folder-edit"></v-icon>
          {{ t('media.file_path.edit_path') }}
        </v-btn>

        <v-btn
          @click="openFolder"
          :disabled="!is_folder_exists"
          color="primary"
          variant="flat"
          rounded="xl"
          class="px-4"
        >
          <v-icon start icon="mdi-folder-open"></v-icon>
          {{ t('media.file_path.open_directory') }}
        </v-btn>
      </v-card-actions>
    </v-card>

    <v-dialog v-model="dialog_edit" width="840">
      <v-card>
        <DialogHeader
          @close="closeDialog"
          :header="t('media.file_path.editing_path')"
          :buttons="headerButtons"
          closable
        ></DialogHeader>

        <v-card-text class="pt-4">
          <v-form v-model="valid" ref="form">
            <v-text-field
              v-model="file_path"
              @update:model-value="onPathInput"
              :disabled="is_file_moving"
              :rules="[v => !!v || t('validation.valid_path_required')]"
              :hint="t('media.file_path.full_path_hint')"
              autofocus
              variant="filled"
              density="compact"
              class="mb-2"
            ></v-text-field>
          </v-form>

          <v-alert
            v-if="!is_file_exists"
            type="error"
            icon="mdi-file-alert"
            class="text-caption"
            density="compact"
            variant="tonal"
            rounded="xl"
          >
            {{ fileMissingAlertMessage }}
          </v-alert>

          <v-alert
            v-if="isAnotherMoveActive"
            type="warning"
            density="compact"
            variant="tonal"
            rounded="xl"
            class="text-caption"
          >
            {{ t('media.file_path.move_in_progress') }}
          </v-alert>

          <div v-if="is_file_exists && is_file_moving" class="mt-2">
            <div class="text-caption text-medium-emphasis mb-1">
              {{ move_status || t('media.file_path.file_moving') }}
            </div>
            <div v-if="move_size" class="text-caption text-medium-emphasis mb-2">
              {{ t('media.file_path.file_moving_size', { size: move_size }) }}
              <span v-if="move_eta"> • {{ t('media.file_path.file_moving_eta', { eta: move_eta }) }}</span>
            </div>
            <v-progress-linear
              :model-value="move_progress"
              color="primary"
              height="6"
              rounded
              striped
              :indeterminate="move_progress === 0"
            ></v-progress-linear>
          </div>

          <v-card-actions v-if="is_file_exists">
            <v-checkbox
              v-model="move_file"
              :disabled="is_file_moving || !is_different_path"
              :label="t('actions.move_rename_file')"
              class="mt-0"
              hide-details
            ></v-checkbox>
          </v-card-actions>
        </v-card-text>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import type { PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import path from 'path-browserify'
import {typedApi} from '@/services/typedApi'
import { useOperationsStore } from '@/stores/operations'
import { useItemsStore } from '@/stores/items'
import { useDialogsStore } from '@/stores/dialogs'
import { useEventBus } from '@/utils/eventBus'
import DialogHeader from "@/components/elements/DialogHeader.vue"
import {normalizePastedFilePath} from '@/utils/filePathInput'
import {checkFileExists as checkPathExists} from '@/services/fileService'
import {setNotification} from '@/services/notificationService'
import {openPath} from '@/services/shellService'
import type { MediaItem, MoveWsMessage } from '@/types/stores'
import type { VFormInstance } from '@/types/vue'

const normalizePath = (value: string) => (path.normalize as (p: string) => string)(value)

const props = defineProps({
  media: {
    type: Object as PropType<MediaItem>,
    required: true,
  },
})
const { t } = useI18n()

const emit = defineEmits<{
  update: [payload: MediaItem]
}>()

const valid = ref(true)
const dialog_edit = ref(false)
const file_path = ref('')
const move_file = ref(true)
const is_different_path = ref(false)
const is_file_moving = ref(false)
const is_file_exists = ref(false)
const is_folder_exists = ref(false)
const move_progress = ref(0)
const move_status = ref('')
const move_size = ref('')
const move_eta = ref('')
const form = ref<VFormInstance>(null)

const operationsStore = useOperationsStore()
const itemsStore = useItemsStore()
const dialogsStore = useDialogsStore()
const eventBus = useEventBus()

const display_path = ref('')

watch(() => props.media.path, (value) => {
  display_path.value = value || ''
}, { immediate: true })

const buildPathFields = (filePath: string) => {
  const ext = path.extname(filePath)
  const basename = path.basename(filePath)
  return {
    path: filePath,
    basename,
    name: ext ? basename.slice(0, -ext.length) : basename,
    ext,
  }
}

const applyPathUpdate = (filePath: string) => {
  const updated = buildPathFields(filePath)
  display_path.value = filePath
  is_different_path.value = false
  emit('update', { ...props.media, ...updated })

  if (props.media?.id == null) return

  itemsStore.updateItem({ id: props.media.id, item: updated })
  eventBus.emit('getItemsFromDb', { ids: [props.media.id], type: 'media' })

  const editingMedia = dialogsStore.mediaEditing.media
  if (dialogsStore.mediaEditing.show && editingMedia?.id === props.media.id) {
    dialogsStore.mediaEditing.media = { ...editingMedia, ...updated }
  }
}

const isAnotherMoveActive = computed(() => operationsStore.moving.active && !is_file_moving.value)

const fileMissingAlertMessage = computed(() => {
  if (is_folder_exists.value) {
    return t('media.file_path.file_missing_operations_unavailable')
  }
  return t('media.file_path.file_and_folder_missing')
})

const headerButtons = computed(() => [{
  icon: 'content-save',
  color: 'success',
  text: t('common.save'),
  disabled: !file_path.value || is_file_moving.value || isAnotherMoveActive.value,
  action: updateFilePath,
}])

const onPathInput = (value: string) => {
  const normalized = normalizePastedFilePath(value) as string
  if (normalized !== value) {
    file_path.value = normalized
    value = normalized
  }
  is_different_path.value = normalizePath(display_path.value || props.media.path || '') !== normalizePath(value || '')
}

const resetMoveState = () => {
  move_progress.value = 0
  move_status.value = ''
  move_size.value = ''
  move_eta.value = ''
}

const closeDialog = () => {
  if (is_file_moving.value) return
  dialog_edit.value = false
}

const openFolder = () => {
  const filePath = display_path.value || props.media?.path
  if (!filePath) return
  openPath(filePath, true)
}

const savePathToDb = async (filePath: string, { notify = true } = {}) => {
  const basename = path.basename(filePath)

  try {
    await typedApi.updateMediaPath({
      id: props.media.id,
      path: filePath,
    })

    applyPathUpdate(filePath)

    if (notify) {
      setNotification({
        type: "success",
        title: t("media.file_path.updated"),
        text: basename,
        icon: 'folder-edit',
      })
    }

    return true
  } catch (_error) {
    if (notify) {
      setNotification({
        type: "error",
        title: t("media.file_path.already_exists"),
        text: basename,
        icon: 'folder-edit',
      })
    }
    return false
  }
}

const handleMoveProgress = (msg: MoveWsMessage) => {
  if (msg.type === 'init') {
    move_size.value = operationsStore.formatSize(msg.totalBytes || 0)
    move_eta.value = (msg.estimatedSeconds ?? 0) > 0
      ? operationsStore.formatEta(msg.estimatedSeconds ?? 0)
      : ''
    move_progress.value = 0
  }

  if (msg.type === 'progress') {
    move_progress.value = msg.overallProgress || 0
    move_status.value = t('media.file_path.file_moving_progress', { file: msg.fileName })
    if ((msg.etaSeconds ?? 0) > 0) {
      move_eta.value = operationsStore.formatEta(msg.etaSeconds ?? 0)
    }
  }
}

const updateFilePath = async () => {
  if (!form.value || is_file_moving.value) return

  const { valid: formValid } = await form.value.validate()
  if (!formValid) return
  if (!file_path.value) return

  const filePath = file_path.value
  const basename = path.basename(filePath)
  const shouldMove = is_file_exists.value && is_different_path.value && move_file.value

  if (shouldMove) {
    is_file_moving.value = true
    resetMoveState()

    try {
      const result = await operationsStore.renameFilePath({
        oldPath: display_path.value || props.media.path || '',
        newPath: filePath,
        onProgress: handleMoveProgress,
        notifyOnComplete: false,
      })

      if (!result?.success) {
        if (!result?.aborted && result?.failed === 0) {
          setNotification({
            type: "error",
            title: t("media.file_path.renaming_failed"),
            text: basename,
            icon: 'folder-edit',
          })
        }
        return
      }

      const saved = await savePathToDb(filePath, { notify: false })

      if (saved) {
        setNotification({
          type: "success",
          title: t("media.file_path.moved_renamed"),
          text: basename,
          icon: 'folder-edit',
        })
        dialog_edit.value = false
        await refreshPathAvailability(filePath)
      }
    } finally {
      is_file_moving.value = false
      resetMoveState()
    }
    return
  }

  const saved = await savePathToDb(filePath)
  if (saved) {
    dialog_edit.value = false
    await refreshPathAvailability(filePath)
  }
}

const refreshPathAvailability = async (filePath: string) => {
  if (!filePath) {
    is_file_exists.value = false
    is_folder_exists.value = false
    return
  }

  is_file_exists.value = await checkPathExists(filePath)
  const folderPath = path.dirname(filePath)
  is_folder_exists.value = folderPath ? await checkPathExists(folderPath) : false
}

const openDialogEdit = async () => {
  file_path.value = display_path.value || props.media?.path || ''
  is_different_path.value = false
  resetMoveState()
  dialog_edit.value = true
  await nextTick()
  await form.value?.resetValidation()
  await form.value?.validate()
}

onMounted(async () => {
  await refreshPathAvailability(display_path.value || props.media.path || '')
})

watch(display_path, async (filePath) => {
  await refreshPathAvailability(filePath)
})
</script>
