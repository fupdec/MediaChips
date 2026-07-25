<template>
  <v-dialog
    v-model="dialogLocal"
    :fullscreen="smAndDown"
    scrollable
    width="880"
    :transition="false"
  >
    <v-card>
      <DialogHeader
        @close="dialogLocal = false"
        :header="header || t('settings_labels.database.select_folder')"
        closable
        :buttons="[
          {
            icon: 'check',
            text: confirmText || t('common.select'),
            color: 'success',
            disabled: !canConfirm,
            function: confirm,
          },
        ]"
      />

      <v-card-text class="pa-2 pa-sm-4">
        <v-alert
          v-if="pathInput && folderPath.trim() && isFolderExists === false"
          type="error"
          density="compact"
          variant="outlined"
          class="mb-3"
        >
          {{ t('settings_labels.database.folder_missing') }}
        </v-alert>

        <div
          v-if="pathInput && showNativePicker && isElectron"
          class="d-flex flex-wrap ga-2 mb-3"
        >
          <v-btn
            color="primary"
            rounded="lg"
            variant="flat"
            @click="chooseDirNative"
          >
            <v-icon start>mdi-folder-open</v-icon>
            {{ t('settings_labels.database.select_folder') }}
          </v-btn>
        </div>

        <MediaFolderBrowser
          v-if="browsePath || places.length"
          :base-url="appStore.localhost || ''"
          :path="browsePath"
          :selected-paths="pathInput ? [] : selectedPaths"
          :places="places"
          :active-place-id="activePlaceId"
          :folders-only="!fileExtensions.length"
          :file-extensions="fileExtensions"
          :show-selection="!pathInput && (multiple || fileExtensions.length > 0)"
          @update:path="onBrowsePath"
          @update:selected-paths="selectedPaths = $event"
          @select-place="onBrowsePath"
        />

        <v-alert
          v-else-if="placesLoaded && !places.length"
          type="info"
          variant="tonal"
          density="compact"
          rounded="xl"
          class="text-caption mb-3"
        >
          {{ t('media.adding.mounted_roots_empty') }}
        </v-alert>

        <v-form
          v-if="pathInput"
          ref="form"
          v-model="valid"
          class="mt-3"
        >
          <v-text-field
            v-model="folderPathModel"
            :label="t('settings_labels.database.path_to_folder')"
            :rules="[(v) => !!v || t('validation.write_path')]"
            variant="outlined"
            rounded="lg"
            density="comfortable"
            hide-details="auto"
            @blur="validateFolderPath"
          />
        </v-form>

        <div
          v-else-if="multiple && selectedPaths.length"
          class="text-caption text-medium-emphasis mt-3"
        >
          {{ t('media.adding.browser_selected_count', {count: selectedPaths.length}) }}
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import type {VFormInstance} from '@/types/vue'
import {useDisplay} from 'vuetify'
import {useI18n} from 'vue-i18n'
import {storeToRefs} from 'pinia'
import {useAppStore} from '@/stores/app'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import MediaFolderBrowser from '@/components/dialogs/MediaFolderBrowser.vue'
import {checkFileExists} from '@/services/fileService'
import {normalizePastedFilePath} from '@/utils/filePathInput'
import {fetchBrowsePlaces, type BrowsePlace} from '@/services/browsePlacesService'

const props = withDefaults(defineProps<{
  modelValue: boolean
  multiple?: boolean
  header?: string
  confirmText?: string
  initialPath?: string
  /** When set, picker shows matching files (e.g. zip backups) instead of folders-only. */
  fileExtensions?: string[]
  /** Show editable path field + optional existence check (move-files mode). */
  pathInput?: boolean
  /** Validate that the path exists before confirming (requires pathInput). */
  validateExists?: boolean
  /** Show native Electron directory picker button (requires pathInput). */
  showNativePicker?: boolean
}>(), {
  multiple: false,
  header: '',
  confirmText: '',
  initialPath: '',
  fileExtensions: () => [],
  pathInput: false,
  validateExists: false,
  showNativePicker: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: [paths: string[]]
  select: [path: string]
}>()

const {smAndDown} = useDisplay()
const {t} = useI18n()
const appStore = useAppStore()
const {isElectron} = storeToRefs(appStore)

const places = ref<BrowsePlace[]>([])
const placesLoaded = ref(false)
const browsePath = ref('')
const selectedPaths = ref<string[]>([])
const folderPath = ref('')
const valid = ref(true)
const isFolderExists = ref<boolean | null>(null)
const form = ref<VFormInstance>(null)

const folderPathModel = computed({
  get: () => folderPath.value,
  set: (value: string) => {
    folderPath.value = String(normalizePastedFilePath(value) ?? '')
    isFolderExists.value = null
  },
})

const dialogLocal = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const activePlaceId = computed(() => {
  const current = browsePath.value
  if (!current) return null
  const matches = places.value
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

const canConfirm = computed(() => {
  if (props.pathInput) {
    return Boolean(folderPath.value.trim())
  }
  if (props.fileExtensions.length) {
    return selectedPaths.value.length > 0
  }
  if (props.multiple) return selectedPaths.value.length > 0
  return Boolean(browsePath.value.trim())
})

function defaultBrowsePath(list: BrowsePlace[]): string {
  return list.find((place) => place.id === 'home')?.path
    || list.find((place) => place.id === 'videos')?.path
    || list[0]?.path
    || ''
}

function onBrowsePath(path: string) {
  browsePath.value = path
  if (props.pathInput) {
    folderPath.value = path
    isFolderExists.value = true
  }
}

async function chooseDirNative() {
  try {
    const result = await window.electronAPI?.invoke?.('showOpenDialog', ['openDirectory']) as {
      filePaths?: string[]
    } | undefined
    if (result?.filePaths?.length) {
      const next = result.filePaths[0]
      folderPath.value = next
      browsePath.value = next
      isFolderExists.value = true
    }
  } catch (error) {
    console.error('Error choosing directory:', error)
  }
}

async function loadPlaces() {
  try {
    const result = await fetchBrowsePlaces(appStore.localhost || '')
    places.value = result.places
    const preferred = (props.pathInput ? folderPath.value.trim() : '')
      || props.initialPath?.trim()
      || defaultBrowsePath(places.value)
    browsePath.value = preferred
    if (props.pathInput && preferred && !folderPath.value.trim()) {
      folderPath.value = preferred
    }
  } catch {
    places.value = []
    browsePath.value = props.initialPath?.trim() || ''
  } finally {
    placesLoaded.value = true
  }
}

async function validateFolderPath() {
  const path = folderPath.value.trim()
  if (!path) {
    isFolderExists.value = null
    return
  }
  try {
    isFolderExists.value = await checkFileExists(path)
  } catch (error) {
    console.error('Error checking folder:', error)
    isFolderExists.value = false
  }
}

async function confirm() {
  if (!canConfirm.value) return

  if (props.pathInput) {
    if (form.value) {
      const {valid: isValid} = await form.value.validate()
      if (!isValid) return
    }
    const path = folderPath.value.trim()
    if (props.validateExists) {
      try {
        isFolderExists.value = await checkFileExists(path)
        if (!isFolderExists.value) return
      } catch (error) {
        console.error('Error checking folder:', error)
        isFolderExists.value = false
        return
      }
    }
    emit('confirm', [path])
    emit('select', path)
    dialogLocal.value = false
    return
  }

  const paths = (props.multiple || props.fileExtensions.length)
    ? [...selectedPaths.value]
    : [browsePath.value]
  emit('confirm', paths)
  dialogLocal.value = false
}

watch(dialogLocal, (open) => {
  if (!open) return
  selectedPaths.value = []
  placesLoaded.value = false
  isFolderExists.value = null
  if (props.pathInput) {
    folderPath.value = props.initialPath?.trim() || ''
  }
  void loadPlaces()
})
</script>
