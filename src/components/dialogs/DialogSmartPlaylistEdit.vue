<template>
  <div>
    <v-dialog
      v-if="dialog"
      v-model="dialogLocal"
      :fullscreen="smAndDown"
      scrollable
      width="900"
    >
      <v-card>
        <DialogHeader
          @close="close"
          :header="t('playlists.editing_smart_playlist')"
          :buttons="buttons"
          closable
        />

        <v-card-actions class="px-4 pt-6">
          <v-form
            v-model="valid"
            ref="formRef"
            class="flex-grow-1"
            @submit.prevent
          >
            <v-text-field
              v-model="name"
              :rules="[nameRules]"
              :placeholder="t('playlists.playlist_name')"
              min-width="200"
              max-width="500"
              autofocus
              variant="filled"
            >
              <template #append>
                <v-btn
                  @click="applyName"
                  :disabled="!valid"
                  icon="mdi-content-save"
                  :title="t('playlists.update_name')"
                />
              </template>
            </v-text-field>
          </v-form>
        </v-card-actions>

        <v-card-text class="px-4 pt-0 pb-6">
          <div class="text-subtitle-1 font-weight-medium mb-2">
            {{ t('playlists.smart_playlist_filters') }}
          </div>
          <div class="text-body-2 text-medium-emphasis mb-4">
            {{ t('playlists.smart_playlist_filters_hint') }}
          </div>

          <v-progress-linear
            v-if="loading"
            indeterminate
            color="primary"
            class="mb-4"
          />

          <FiltersChips
            v-else-if="filterRows.length"
            :filters="filterRows"
            readonly
            is-tooltip
          />

          <div
            v-else
            class="text-body-2 text-medium-emphasis"
          >
            {{ t('filters.no_saved_filters') }}
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>

    <DialogConfirm
      v-if="dialogDelete"
      variant="delete"
      :dialog="dialogDelete"
      @close="dialogDelete = false"
      @delete="deletePlaylist"
      :text="t('playlists.delete_smart_playlist_confirm')"
    />
  </div>
</template>

<script setup lang="ts">
import {ref, computed, watch, onMounted} from 'vue'
import type {PropType} from 'vue'
import type {VFormInstance} from '@/types/vue'
import {useI18n} from 'vue-i18n'
import {useDisplay} from 'vuetify'
import {typedApi} from '@/services/typedApi'
import {getFilters} from '@/services/filterService'
import {validateName} from '@/services/formatUtils'
import {setNotification} from '@/services/notificationService'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import DialogConfirm from '@/components/dialogs/DialogConfirm.vue'
import FiltersChips from '@/components/elements/FiltersChips.vue'
import {buildM3uPlaylist, downloadTextFile, playlistExportFilename} from '@/utils/playlistExport'
import type {FilterObject} from '@/types/common'
import type {SavedFilter} from '@/types/stores'
import type {MediaItem} from '@/types/stores'

interface SaveFileResult {
  canceled?: boolean
  filePath?: string
}

const props = defineProps({
  dialog: Boolean,
  playlist: {
    type: Object as PropType<SavedFilter>,
    default: undefined,
  },
})

const emit = defineEmits(['close', 'updatePlaylist', 'delete'])

const {smAndDown} = useDisplay()
const {t} = useI18n()

const dialogLocal = ref(props.dialog)
const dialogDelete = ref(false)
const valid = ref(false)
const name = ref('')
const filterRows = ref<FilterObject[]>([])
const loading = ref(false)
const exporting = ref(false)
const formRef = ref<VFormInstance>(null)

const buttons = computed(() => [
  {
    icon: 'file-export',
    text: t('playlists.export'),
    action: exportPlaylist,
    disabled: exporting.value,
  },
  {
    icon: 'delete',
    text: t('common.delete'),
    color: 'error',
    variant: 'flat',
    action: () => {
      dialogDelete.value = true
    },
  },
])

watch(() => props.dialog, (newVal) => {
  dialogLocal.value = newVal
  if (newVal && props.playlist) {
    name.value = props.playlist.name || ''
    loadFilterRows()
  }
})

watch(dialogLocal, (newVal) => {
  if (!newVal) close()
})

const nameRules = (value: string) => validateName(value)

const close = () => emit('close')

const loadFilterRows = async () => {
  if (!props.playlist?.id) return

  loading.value = true
  filterRows.value = []

  try {
    filterRows.value = await getFilters(props.playlist.id) || []
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}

const applyName = async () => {
  await formRef.value?.validate()
  if (!valid.value || !props.playlist?.id) return

  try {
    await typedApi.updateSavedFilter(props.playlist.id, {
      name: name.value,
    })
    emit('updatePlaylist')
  } catch (error) {
    console.error(error)
  }
}

const deletePlaylist = () => {
  emit('delete')
  dialogDelete.value = false
}

const exportPlaylist = async () => {
  if (!props.playlist?.id) return

  exporting.value = true

  try {
    const response = await typedApi.getSavedFilterMedia(props.playlist.id, {mode: 'play'})
    const videos = (response.data?.items || []).map((item: MediaItem) => ({
      medium: item,
      ...item,
    }))

    if (!videos.length) {
      setNotification({
        type: 'warning',
        title: t('playlists.export'),
        text: t('playlists.export_empty'),
      })
      return
    }

    const content = buildM3uPlaylist(videos, name.value || props.playlist?.name)
    const defaultPath = playlistExportFilename(name.value || props.playlist?.name)
    const filters = [{name: 'M3U Playlist', extensions: ['m3u8', 'm3u']}]

    if (window.electronAPI?.invoke) {
      const result = await window.electronAPI.invoke('dialog:saveFile', {
        defaultPath,
        content,
        filters,
      }) as SaveFileResult

      if (result?.canceled) return

      setNotification({
        type: 'success',
        title: t('playlists.export'),
        text: t('playlists.export_success', {path: result.filePath}),
      })
      return
    }

    downloadTextFile(content, defaultPath)
    setNotification({
      type: 'success',
      title: t('playlists.export'),
      text: t('playlists.export_success', {path: defaultPath}),
    })
  } catch (error: unknown) {
    console.error(error)
    const message = error instanceof Error ? error.message : String(error)
    setNotification({
      type: 'error',
      title: t('playlists.export'),
      text: message,
    })
  } finally {
    exporting.value = false
  }
}

onMounted(() => {
  if (props.dialog && props.playlist) {
    name.value = props.playlist.name || ''
    loadFilterRows()
  }
})
</script>
