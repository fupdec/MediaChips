<template>
  <v-dialog
    v-model="isDialogVisible"
    :fullscreen="xs"
    scrollable
    width="800"
  >
    <template v-if="!hideActivator" v-slot:activator="{ props: activatorProps }">
      <AppBarButton
        v-bind="activatorProps"
        :action="()=>isDialogVisible=true"
        :text="t('appbar.buttons.add_files')"
        :color="buttonColor"
        :size="buttonSize"
        :variant="buttonVariant"
        icon="plus"
      />
    </template>
    <template #default>
      <v-card>
        <!-- Заголовок диалога с кнопками действий -->
        <DialogHeader
          @close="isDialogVisible = false"
          :header="dialogHeader"
          :buttons="dialogActionButtons"
          closable
        />

        <!-- Основное содержимое диалога -->
        <v-card-text
          @drop.prevent="handleFileDrop"
          @dragenter.prevent
          @dragover.prevent
          class="pa-2 pa-sm-4"
        >
          <!-- Кнопки выбора папок (только в Electron) -->
          <v-btn
            v-if="isElectron"
            @click="selectMultipleDirectories"
            color="primary"
            rounded="lg"
            variant="flat"
            class="mb-6"
          >
            <v-icon start>mdi-folder-open</v-icon>
            {{ t('media.adding.select_folders') }}
          </v-btn>

          <!-- Форма с путями к файлам -->
          <v-form ref="mediaForm" v-model="isFormValid">
            <v-textarea
              :model-value="mediaAddingState.paths"
              @update:model-value="onPathsInput"
              :rules="[requiredPathRule]"
              :label="t('media.adding.paths_label')"
              :hint="t('media.adding.paths_hint')"
              variant="outlined"
              no-resize
              autofocus
              rounded="lg"
              rows="5"
            />
          </v-form>

          <!-- Проверка дубликатов по содержимому файла -->
          <v-checkbox
            v-model="mediaAddingState.is_check_duplicates"
            :label="t('media.adding.check_duplicates')"
            class="mt-0 mb-2 mr-4"
            hide-details
          />

          <v-alert
            v-if="isImageAdding"
            type="info"
            variant="tonal"
            density="compact"
            rounded="xl"
            class="mb-2 text-caption"
          >
            {{ t('media.adding.images_skip_by_path_hint') }}
          </v-alert>

          <!-- Опция парсинга тегов с кнопкой помощи -->
          <div class="d-flex align-center mb-2">
            <v-checkbox
              v-model="mediaAddingState.is_parsing"
              :label="t('media.adding.parse_tags')"
              class="mt-0"
              hide-details
            />
            <button-documentation id="media.parser"></button-documentation>
          </div>

          <!-- Опция исключения путей -->
          <v-checkbox
            v-model="tasksStore.mediaAdding.is_exclude"
            :label="t('media.adding.exclude_paths')"
            class="mt-0"
          />

          <!-- Кнопки выбора папок (только в Electron) -->
          <v-btn
            v-if="tasksStore.mediaAdding.is_exclude && isElectron"
            @click="selectMultipleDirectoriesExcluded"
            color="primary"
            rounded="lg"
            variant="flat"
            class="mb-6"
          >
            <v-icon start>mdi-folder-open</v-icon>
            {{ t('media.adding.select_folders') }}
          </v-btn>

          <!-- Поле для исключенных путей (показывается условно) -->
          <v-textarea
            v-if="tasksStore.mediaAdding.is_exclude"
            :model-value="mediaAddingState.excluded"
            @update:model-value="onExcludedInput"
            :label="t('media.adding.excluded_paths_label')"
            :hint="t('media.adding.excluded_paths_hint')"
            variant="outlined"
            rounded="lg"
            no-resize
            rows="3"
          />
        </v-card-text>
      </v-card>
    </template>
  </v-dialog>
</template>

<script setup lang="ts">
import {ref, computed, watch, onMounted} from 'vue'
import type {PropType} from 'vue'
import type {VFormInstance} from '@/types/vue'
import {useDisplay} from 'vuetify'
import {useI18n} from 'vue-i18n'
import {useTasksStore} from '@/stores/tasks'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {getCurrentMediaType, isImageMediaType} from '@/utils/mediaType'
import {getMediaTypeName} from '@/utils/mediaTypeI18n'

// Компоненты
import DialogHeader from '@/components/elements/DialogHeader.vue'
import AppBarButton from "@/components/app/appbar/AppBarButton.vue"
import ButtonDocumentation from "@/components/ui/ButtonDocumentation.vue"
import {useMediaAdding} from '@/composable/AddingMedia'
import {normalizePastedFilePathsText} from '@/utils/filePathInput'
import {collectDroppedPaths} from '@/utils/mediaDrop'
import {showOpenDialog} from '@/services/electronDialogService'


// Хуки
const {t} = useI18n()
const {xs} = useDisplay()

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
})

const emit = defineEmits(['update:modelValue'])

// Pinia stores
const tasksStore = useTasksStore()
const appStore = useAppStore()
const itemsStore = useItemsStore()

// Composable
const mediaAdding = useMediaAdding()

// Реактивные переменные
const internalDialogVisible = ref(false)
const isFormValid = ref(false)
const mediaForm = ref<VFormInstance>(null)

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

const currentMediaType = computed(() =>
  getCurrentMediaType(
    appStore.mediaTypes,
    tasksStore.mediaAdding.media_type_id || itemsStore.environment?.media_type_id,
  )
)

const isImageAdding = computed(() => isImageMediaType(currentMediaType.value))

const dialogHeader = computed(() => {
  const typeName = getMediaTypeName(currentMediaType.value, t)
  if (typeName) {
    return t('media.adding.files_for_type', {type: typeName})
  }
  return t('media.adding.files')
})

// Кнопки действий в диалоге
const dialogActionButtons = computed(() => [
  {
    icon: 'magnify',
    text: t('media.adding.scan_duplicates'),
    color: 'secondary',
    variant: 'outlined',
    action: startDuplicateScanProcess,
  },
  {
    icon: 'plus',
    text: t('common.add'),
    color: 'success',
    variant: 'flat',
    action: startMediaAddingProcess
  }
])

// Правило валидации для обязательного поля путей
const requiredPathRule = (value: string) => {
  if (!value || value.trim().length === 0) {
    return t('validation.path_required')
  }
  return true
}

const onPathsInput = (value: string) => {
  tasksStore.mediaAdding.paths = String(normalizePastedFilePathsText(value) ?? '')
}

const onExcludedInput = (value: string) => {
  tasksStore.mediaAdding.excluded = String(normalizePastedFilePathsText(value) ?? '')
}

// Методы

/**
 * Инициализирует состояние диалога при монтировании
 */
onMounted(() => {
  resetDialogState()
})

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
    resetDialogState()
  }
})

/**
 * Сбрасывает состояние диалога к начальным значениям
 */
const resetDialogState = () => {
  syncMediaTypeFromContext()
  tasksStore.mediaAdding.paths = ''
  tasksStore.mediaAdding.excluded = ''
  tasksStore.mediaAdding.skipFileScan = false
  tasksStore.mediaAdding.directFiles = []
  if (mediaForm.value) {
    mediaForm.value.reset()
  }
}

const syncMediaTypeFromContext = () => {
  const mediaTypeId = tasksStore.mediaAdding.media_type_id
    || itemsStore.environment?.media_type_id
  if (mediaTypeId) {
    tasksStore.mediaAdding.media_type_id = Number(mediaTypeId)
  }
}

/**
 * Выбирает несколько директорий через системный диалог (только Electron)
 */
const selectMultipleDirectories = async () => {
  const paths = await showOpenDialog(['openDirectory', 'multiSelections'])
  tasksStore.mediaAdding.paths = String(normalizePastedFilePathsText(paths || '') ?? '')
}

const selectMultipleDirectoriesExcluded = async () => {
  const paths = await showOpenDialog(['openDirectory', 'multiSelections'])
  tasksStore.mediaAdding.excluded = String(normalizePastedFilePathsText(paths || '') ?? '')
}

/**
 * Запускает процесс добавления медиафайлов после валидации формы
 */
const startMediaAddingProcess = async () => {
  if (!mediaForm.value) return
  const {valid} = await mediaForm.value.validate()

  if (!valid) {
    console.warn('Form validation failed')
    return
  }

  // Активируем задачу и показываем диалог процесса
  syncMediaTypeFromContext()
  tasksStore.mediaAdding.paths = String(normalizePastedFilePathsText(tasksStore.mediaAdding.paths || '') ?? '')
  tasksStore.mediaAdding.excluded = String(normalizePastedFilePathsText(tasksStore.mediaAdding.excluded || '') ?? '')
  tasksStore.mediaAdding.dialogProcess = true
  tasksStore.mediaAdding.active = true
  isDialogVisible.value = false

  await handleAddMedia()
}

const startDuplicateScanProcess = async () => {
  if (!mediaForm.value) return
  const {valid} = await mediaForm.value.validate()
  if (!valid) return

  syncMediaTypeFromContext()
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
  if (!isElectron.value) return

  const existingPaths = tasksStore.mediaAdding.paths || ''
  const newPaths = collectDroppedPaths(event).join('\n')

  if (!newPaths) return

  tasksStore.mediaAdding.paths = existingPaths
    ? String(normalizePastedFilePathsText(`${existingPaths}\n${newPaths}`) ?? '')
    : String(normalizePastedFilePathsText(newPaths) ?? '')
}
</script>