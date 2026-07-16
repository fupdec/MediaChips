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
        <MediaFolderBrowser
          v-if="browsePath || places.length"
          :base-url="appStore.localhost || ''"
          :path="browsePath"
          :selected-paths="selectedPaths"
          :places="places"
          :active-place-id="activePlaceId"
          :folders-only="!fileExtensions.length"
          :file-extensions="fileExtensions"
          :show-selection="multiple || fileExtensions.length > 0"
          @update:path="browsePath = $event"
          @update:selected-paths="selectedPaths = $event"
          @select-place="browsePath = $event"
        />

        <v-alert
          v-else-if="placesLoaded && !places.length"
          type="info"
          variant="tonal"
          density="compact"
          rounded="xl"
          class="text-caption"
        >
          {{ t('media.adding.mounted_roots_empty') }}
        </v-alert>

        <div
          v-if="multiple && selectedPaths.length"
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
import {useDisplay} from 'vuetify'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import MediaFolderBrowser from '@/components/dialogs/MediaFolderBrowser.vue'
import {fetchBrowsePlaces, type BrowsePlace} from '@/services/browsePlacesService'

const props = withDefaults(defineProps<{
  modelValue: boolean
  multiple?: boolean
  header?: string
  confirmText?: string
  initialPath?: string
  /** When set, picker shows matching files (e.g. zip backups) instead of folders-only. */
  fileExtensions?: string[]
}>(), {
  multiple: false,
  header: '',
  confirmText: '',
  initialPath: '',
  fileExtensions: () => [],
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: [paths: string[]]
}>()

const {smAndDown} = useDisplay()
const {t} = useI18n()
const appStore = useAppStore()

const places = ref<BrowsePlace[]>([])
const placesLoaded = ref(false)
const browsePath = ref('')
const selectedPaths = ref<string[]>([])

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

async function loadPlaces() {
  try {
    const result = await fetchBrowsePlaces(appStore.localhost || '')
    places.value = result.places
    const preferred = props.initialPath?.trim() || defaultBrowsePath(places.value)
    browsePath.value = preferred
  } catch {
    places.value = []
    browsePath.value = props.initialPath?.trim() || ''
  } finally {
    placesLoaded.value = true
  }
}

function confirm() {
  if (!canConfirm.value) return
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
  void loadPlaces()
})
</script>
