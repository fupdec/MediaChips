<template>
  <div class="mx-4">
    <SettingsCategoryDivider :title="t('settings_labels.tools.folders')"
      icon="folder"></SettingsCategoryDivider>

    <v-alert
      type="warning"
      icon="mdi-alert"
      class="text-caption mb-4"
      density="compact"
      variant="tonal"
      rounded="xl"
      closable
    >
      {{ t('settings_labels.tools.watch_folders_scan_warning') }} <br>
      {{ t('settings_labels.tools.watch_folders_slow_warning') }}
    </v-alert>

    <!-- Watch Folders Switch -->
    <settings-switch
      :disabled="watcherStore.busy"
      option="watchFolders"
      icon-text="alert"
      icon-color="warning"
      :title="t('settings_labels.tools.watch_folders')"
      :hint="t('settings_labels.tools.watch_folders_hint')"
    ></settings-switch>

    <v-btn
      @click="openAddFolderDialog"
      color="success"
      class="pr-4 mb-4"
      rounded="pill"
      variant="flat"
    >
      <v-icon start>mdi-plus</v-icon>
      {{ t('settings_labels.tools.add_folder') }}
    </v-btn>

    <!-- Folders List -->
    <v-list
      class="px-0 settings-outlined-list"
      density="compact"
      rounded="xl"
      bg-color="transparent"
    >
      <v-list-item
        v-for="folder in watcherStore.folders"
        :key="folder.id"
        rounded="pill"
        variant="outlined"
        class="py-4"
      >
        <template #prepend>
          <v-avatar
            @click="toggleFolderWatch(folder)"
            :color="folder.watch ? 'success' : 'grey'"
            size="40"
            style="cursor: pointer"
          >
            <v-icon :icon="`mdi-eye${folder.watch ? '' : '-off'}`"/>
          </v-avatar>
        </template>

        <v-list-item-title class="d-flex align-center">
          <template v-for="type in folder.types"
            :key="type.id">
            <v-icon size="small"
              class="mr-1">mdi-{{ type.icon }}
            </v-icon>
          </template>
          <span class="ml-2">{{ folder.name }}</span>
        </v-list-item-title>

        <v-list-item-subtitle>{{ folder.path }}</v-list-item-subtitle>

        <template #append>
          <v-btn-toggle
            rounded="pill">
            <v-btn @click.stop="editFolder(folder)"
              icon>
              <v-icon>mdi-pencil</v-icon>
            </v-btn>
            <v-btn @click.stop="confirmRemoveFolder(folder)"
              icon>
              <v-icon color="error">mdi-close</v-icon>
            </v-btn>
          </v-btn-toggle>
        </template>
      </v-list-item>
    </v-list>

    <!-- Add/Edit Folder Dialog -->
    <v-dialog
      v-model="showFolderDialog"
      :fullscreen="$vuetify.display.xs"
      scrollable
      width="600"
    >
      <v-card>
        <DialogHeader
          @close="closeFolderDialog"
          :header="isEditMode ? t('settings_labels.tools.editing_folder') : t('settings_labels.tools.adding_folder')"
          :buttons="dialogButtons"
          closable
        />

        <v-card-text class="pa-sm-4 pa-2">
          <v-form v-model="formValid"
            ref="folderForm">
            <!-- Select Folder Button (Electron only) -->
            <v-btn
              v-if="isElectron"
              @click="chooseDirectory"
              class="mb-4"
              color="primary"
              rounded="pill"
              variant="flat"
            >
              <v-icon start>mdi-folder-open</v-icon>
              {{ t('settings_labels.database.select_folder') }}
            </v-btn>

            <!-- Path Input -->
            <v-text-field
              :model-value="folderData.path"
              @update:model-value="onFolderPathInput"
              :rules="[(v) => !!v || t('validation.path_required')]"
              :label="t('settings_labels.tools.path_to_folder')"
              required
              autofocus
              variant="outlined"
              density="compact"
              rounded="pill"
              class="my-4"
            />

            <!-- Name Input -->
            <v-text-field
              v-model="folderData.name"
              :label="t('settings_labels.tools.folder_name_optional')"
              variant="outlined"
              density="compact"
              rounded="pill"
            />

            <!-- Media Types Selection -->
            <!--            <div class="text-body-2 mb-2">Media types</div>-->
            <!--            <v-alert-->
            <!--              type="error"-->
            <!--              v-model="showMediaTypesError"-->
            <!--              variant="text"-->
            <!--              density="compact"-->
            <!--            >-->
            <!--              Please select at least one media type-->
            <!--            </v-alert>-->

            <!--            <v-chip-group-->
            <!--              v-model="folderData.selectedTypes"-->
            <!--              selected-class="text-primary"-->
            <!--              multiple-->
            <!--              column-->
            <!--            >-->
            <!--              <v-chip-->
            <!--                v-for="(mediaType, index) in mediaTypes"-->
            <!--                :key="mediaType.id"-->
            <!--                :disabled="isEditMode"-->
            <!--                variant="tonal"-->
            <!--                @click="showMediaTypesError = false"-->
            <!--              >-->
            <!--                <v-icon size="20"-->
            <!--                  start>mdi-{{ mediaType.icon }}-->
            <!--                </v-icon>-->
            <!--                {{ mediaType.name }}-->
            <!--              </v-chip>-->
            <!--            </v-chip-group>-->
          </v-form>
        </v-card-text>
      </v-card>
    </v-dialog>

    <!-- Delete Confirmation Dialog -->
    <DialogDeleteConfirm
      v-if="showDeleteDialog"
      :dialog="showDeleteDialog"
      @close="showDeleteDialog = false"
      @confirm="removeFolder"
      :text="deleteConfirmText"
    />
  </div>
</template>

<script setup lang="ts">
import {ref, computed, onMounted, nextTick} from 'vue'
import {typedApi} from '@/services/typedApi'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {useWatcherStore} from '@/stores/watcher'

import DialogHeader from '@/components/elements/DialogHeader.vue'
import DialogDeleteConfirm from '@/components/dialogs/DialogDeleteConfirm.vue'
import SettingsCategoryDivider
  from "@/components/ui/SettingsCategoryDivider.vue"
import SettingsSwitch from "@/components/ui/SettingsSwitch.vue";
import {normalizePastedFilePath} from '@/utils/filePathInput'
import {getWatchedFolders as fetchWatchedFolders} from '@/services/watcherService'
import {setNotification} from '@/services/notificationService'
import type {VFormInstance} from '@/types/vue'
import type {WatchedFolderEntry} from '@/services/watcherUtils'
import type { WatchedFolderUpdatePayload } from '@shared/api/responses'

interface FolderFormData {
  id: number | null
  path: string
  name: string
  selectedTypes: number[]
}


const appStore = useAppStore()
const watcherStore = useWatcherStore()
const {t} = useI18n()

const isElectron = appStore.isElectron

// Refs
const folderForm = ref<VFormInstance>(null)
const formValid = ref(false)
const showMediaTypesError = ref(false)
const showFolderDialog = ref(false)
const showDeleteDialog = ref(false)
const isEditMode = ref(false)
const watcherBusy = ref(false)

// Folder Data
const folderData = ref<FolderFormData>({
  id: null,
  path: '',
  name: '',
  selectedTypes: []
})

const onFolderPathInput = (value: string) => {
  folderData.value.path = normalizePastedFilePath(value) as string
}

// Watcher State (вместо стора)
const currentFolder = ref<WatchedFolderEntry | null>(null)

// Computed

const deleteConfirmText = computed(() =>
  t('settings_labels.tools.remove_watched_folder_confirm')
)

const dialogButtons = computed(() => [{
  icon: isEditMode.value ? 'content-save' : 'plus',
  text: isEditMode.value ? t('common.save') : t('common.add'),
  color: 'success',
  variant: 'flat',
  action: isEditMode.value ? saveFolder : addNewFolder
}])

const getWatchedFolders = async () => {
  watcherStore.folders = await fetchWatchedFolders()
}

const updateWatchedFolder = async (id: number, data: WatchedFolderUpdatePayload) => {
  try {
    const response = await typedApi.updateWatchedFolder(id, data)
    return response.data
  } catch (error) {
    console.error('Error updating watched folder:', error)
    throw error
  }
}

const toggleFolderWatchStatus = async (id: number, watch: boolean) => {
  try {
    const response = await typedApi.updateWatchedFolder(id, {watch})
    return response.data
  } catch (error) {
    console.error('Error toggling folder watch:', error)
    throw error
  }
}

// UI методы
const chooseDirectory = async () => {
  if (!isElectron || !window.electronAPI?.invoke) return

  try {
    const result = await window.electronAPI.invoke('showOpenDialog', ['openDirectory'])
    if (result?.filePaths?.length) {
      folderData.value.path = result.filePaths[0]
      // Set default name from path if not specified
      if (!folderData.value.name) {
        folderData.value.name = folderData.value.path.split(/[\\/]/).pop() || ''
      }
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
  showMediaTypesError.value = false

  nextTick(() => {
    folderForm.value?.reset()
  })
}

const addNewFolder = async () => {
  const validation = await folderForm.value?.validate()
  if (!validation?.valid) return

  const folderName = folderData.value.name || folderData.value.path

  await typedApi.createWatchedFolder({
    folder: {
      path: folderData.value.path,
      name: folderName,
    },
    types: [1]
  }).then(async () => {
    setNotification({
      type: 'success',
      title: t('notifications_text.folder_added'),
      text: folderName,
    })
    await getWatchedFolders()
  }).catch(error => {
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
    selectedTypes: [1],
  }
  isEditMode.value = true
  showFolderDialog.value = true
  showMediaTypesError.value = false
}

const saveFolder = async () => {
  const validation = await folderForm.value?.validate()
  if (!validation?.valid || folderData.value.id == null) return

  watcherBusy.value = true
  try {
    await updateWatchedFolder(folderData.value.id, {
      path: folderData.value.path,
      name: folderData.value.name
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
    await toggleFolderWatchStatus(folder.id, !folder.watch)
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
    selectedTypes: []
  }
}

// Жизненный цикл
onMounted(() => {
  getWatchedFolders()
})
</script>