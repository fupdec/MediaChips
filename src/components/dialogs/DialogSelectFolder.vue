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
        :header="t('settings_labels.database.select_folder')"
        closable
        :buttons="[
          {
            icon: 'check',
            text: t('common.select'),
            color: 'success',
            disabled: !browsePath.trim(),
            function: select,
          },
        ]"
      />

      <v-card-text class="pa-2 pa-sm-4">
        <v-alert
          v-if="folderPath.trim() && isFolderExists === false"
          type="error"
          density="compact"
          variant="outlined"
          class="mb-3"
        >
          {{ t('settings_labels.database.folder_missing') }}
        </v-alert>

        <div class="d-flex flex-wrap ga-2 mb-3">
          <v-btn
            v-if="isElectron"
            @click="chooseDirNative"
            color="primary"
            rounded="lg"
            variant="flat"
          >
            <v-icon start>mdi-folder-open</v-icon>
            {{ t('settings_labels.database.select_folder') }}
          </v-btn>
        </div>

        <MediaFolderBrowser
          v-if="browsePath || places.length"
          :base-url="appStore.localhost || ''"
          :path="browsePath"
          :selected-paths="[]"
          :places="places"
          :active-place-id="activePlaceId"
          folders-only
          :show-selection="false"
          @update:path="onBrowsePath"
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

        <v-form v-model="valid" ref="form" class="mt-3">
          <v-text-field
            :label="t('settings_labels.database.path_to_folder')"
            v-model="folderPath"
            @blur="validateFolderPath"
            :rules="[(v) => !!v || t('validation.write_path')]"
            variant="outlined"
            rounded="lg"
            density="comfortable"
            hide-details="auto"
          />
        </v-form>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {ref, computed, watch} from 'vue'
import type {VFormInstance} from '@/types/vue'
import {useDisplay} from 'vuetify'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {useOperationsStore} from '@/stores/operations'
import {storeToRefs} from 'pinia'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import MediaFolderBrowser from '@/components/dialogs/MediaFolderBrowser.vue'
import {checkFileExists} from '@/services/fileService'
import {normalizePastedFilePath} from '@/utils/filePathInput'
import {fetchBrowsePlaces, type BrowsePlace} from '@/services/browsePlacesService'

const emit = defineEmits(['select'])

const {smAndDown} = useDisplay()
const {t} = useI18n()
const appStore = useAppStore()
const operationsStore = useOperationsStore()
const {isElectron} = storeToRefs(appStore)

const operations = computed(() => operationsStore)

const valid = ref(true)
const isFolderExists = ref<boolean | null>(null)
const form = ref<VFormInstance>(null)
const places = ref<BrowsePlace[]>([])
const placesLoaded = ref(false)
const browsePath = ref('')

const dialogLocal = computed({
  get() {
    return operations.value?.moving?.dialog || false
  },
  set(value) {
    if (operations.value.moving) {
      operations.value.moving.dialog = value
    }
  },
})

const folderPath = computed({
  get() {
    return operations.value?.moving?.folderPath || ''
  },
  set(value) {
    if (operations.value.moving) {
      operations.value.moving.folderPath = String(normalizePastedFilePath(value) ?? '')
    }
    isFolderExists.value = null
  },
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

function defaultBrowsePath(list: BrowsePlace[]): string {
  return list.find((place) => place.id === 'home')?.path
    || list[0]?.path
    || ''
}

function onBrowsePath(path: string) {
  browsePath.value = path
  folderPath.value = path
  isFolderExists.value = true
}

const chooseDirNative = async () => {
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
    const preferred = folderPath.value.trim() || defaultBrowsePath(places.value)
    browsePath.value = preferred
    if (preferred && !folderPath.value.trim()) {
      folderPath.value = preferred
    }
  } catch {
    places.value = []
  } finally {
    placesLoaded.value = true
  }
}

const validateFolderPath = async () => {
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

const select = async () => {
  if (!form.value) return

  const {valid: isValid} = await form.value.validate()
  if (!isValid) return

  try {
    isFolderExists.value = await checkFileExists(folderPath.value)
    if (isFolderExists.value) {
      emit('select', folderPath.value)
      dialogLocal.value = false
    }
  } catch (error) {
    console.error('Error checking folder:', error)
    isFolderExists.value = false
  }
}

watch(dialogLocal, (open) => {
  if (!open) return
  placesLoaded.value = false
  isFolderExists.value = null
  void loadPlaces()
})
</script>
