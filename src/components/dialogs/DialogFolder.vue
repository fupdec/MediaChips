<template>
  <v-dialog
    v-model="watcherStore.dialogFolder"
    :fullscreen="xs"
    width="900"
    scrollable
  >
    <v-card>
      <DialogHeader
        @close="closeDialog"
        :header="t('watcher.folder.title')"
        closable
      />

      <v-card-text class="pa-2 pa-sm-4">
        <div class="px-4 pb-4 d-flex justify-space-between flex-wrap">
          <div>
            <v-icon start>mdi-folder</v-icon>
            <span v-text="folderState?.folder?.name"/>
          </div>
          <div v-text="folderState?.folder?.path"
            class="text-medium-emphasis mt-1"/>
        </div>

        <v-expansion-panels v-model="panel">
          <v-expansion-panel
            v-for="(item, index) in folderState?.files ?? []"
            :key="item.type.id"
            rounded="xl"
          >
            <v-expansion-panel-title>
              <v-icon start>mdi-{{ item.type.icon }}</v-icon>
              <span>{{ getMediaTypeName(item.type, t) }}</span>
              <div v-if="panel !== index">
                <v-chip
                  v-if="item.new.length"
                  :text="t('watcher.folder.new_count', {count: item.new.length})"
                  color="success"
                  class="px-2 ml-2"
                  size="small"
                  variant="flat"
                />
                <v-chip
                  v-if="item.lost.length"
                  :text="t('watcher.folder.lost_count', {count: item.lost.length})"
                  color="error"
                  class="px-2 ml-2"
                  size="small"
                  variant="flat"
                />
              </div>
            </v-expansion-panel-title>

            <v-expansion-panel-text>
              <div v-if="item.new.length > 0"
                class="mb-4">
                <v-card-actions>
                  <v-chip
                    :text="t('watcher.folder.new_count', {count: item.new.length})"
                    color="success"
                    class="mb-2"
                    size="small"
                    variant="flat"
                  />
                  <v-spacer></v-spacer>
                  <v-btn
                    @click="copyPaths(item.new)"
                    color="primary"
                    class="px-4"
                    variant="flat"
                    rounded="xl"
                  >
                    <v-icon start>mdi-content-copy</v-icon>
                    {{ t('watcher.folder.copy_paths') }}
                  </v-btn>
                  <v-btn
                    @click="addFiles(item.new, item.type.id)"
                    color="success"
                    class="px-4"
                    variant="flat"
                    rounded="xl"
                  >
                    <v-icon start>mdi-plus</v-icon>
                    {{ t('watcher.folder.add_files') }}
                  </v-btn>
                </v-card-actions>
                <v-card variant="outlined"
                  class="pa-2">
                  <v-virtual-scroll
                    :height="item.new.length > 10 ? 150 : item.new.length * 15"
                    :items="item.new"
                    class="virtual-scroller"
                    :item-height="15"
                  >
                    <template v-slot:default="{ item }">
                      <div class="text-caption">{{ item }}</div>
                    </template>
                  </v-virtual-scroll>
                </v-card>
              </div>

              <div v-if="item.lost.length > 0">
                <v-card-actions>
                  <v-chip
                    :text="t('watcher.folder.lost_count', {count: item.lost.length})"
                    color="error"
                    class="mb-2"
                    variant="flat"
                    rounded="xl"
                    size="small"
                  />
                  <v-spacer></v-spacer>
                  <v-btn
                    @click="removeFiles(item.lost, item.type)"
                    color="error"
                    class="px-4"
                    variant="flat"
                    rounded="xl"
                  >
                    <v-icon start>mdi-delete</v-icon>
                    {{ t('watcher.folder.delete_from_app') }}
                  </v-btn>
                </v-card-actions>
                <v-card variant="outlined"
                  class="pa-2">
                  <v-virtual-scroll
                    :height="item.lost.length > 10 ? 150 : item.lost.length * 15"
                    :items="item.lost"
                    class="virtual-scroller"
                    :item-height="15"
                  >
                    <template v-slot:default="{ item }">
                      <div class="text-caption">{{ item.path }}</div>
                    </template>
                  </v-virtual-scroll>
                </v-card>
              </div>

              <div
                v-if="item.lost.length == 0 && item.new.length == 0"
                class="text-center pa-8"
              >
                <v-icon size="80"
                  color="green">mdi-folder-sync
                </v-icon>
                <div class="text-green">
                  {{ t('watcher.folder.synchronized') }}
                </div>
              </div>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {ref, computed} from 'vue'
import {useDisplay} from 'vuetify'
import {useI18n} from 'vue-i18n'
import DialogHeader from "@/components/elements/DialogHeader.vue"
import {useWatcherStore} from '@/stores/watcher'
import {useTasksStore} from '@/stores/tasks'
import {useDialogsStore} from '@/stores/dialogs'
import {useNotificationsStore} from '@/stores/notifications'
import {useEventBus} from '@/utils/eventBus'
import {typedApi} from "@/services/typedApi"
import {getMediaTypeName} from '@/utils/mediaTypeI18n'
import {getMediaDeleteAssetFolder, isManagedMediaType} from '@/utils/mediaType'
import type {MediaType} from '@/types/media'
import type { WatcherFileChangeGroup } from '@/types/watcher'

const {xs} = useDisplay()
const watcherStore = useWatcherStore()
const tasksStore = useTasksStore()
const dialogsStore = useDialogsStore()
const notificationStore = useNotificationsStore()
const eventBus = useEventBus()
const {t} = useI18n()

const folderState = computed(() => watcherStore.folder)

const panel = ref(0)

const closeDialog = () => {
  watcherStore.dialogFolder = false
}

const copyPaths = (files: string[]) => {
  let paths = ''

  for (const filePath of files) {
    paths = paths + '\n' + filePath
  }

  navigator.clipboard.writeText(paths)

  notificationStore.setNotification({
    type: "success",
    text: t('watcher.folder.paths_copied'),
  })
}

const addFiles = (files: string[], mediaTypeId: number) => {
  watcherStore.dialogFolder = false

  tasksStore.mediaAdding.directFiles = [...files]
  tasksStore.mediaAdding.skipFileScan = true
  tasksStore.mediaAdding.paths = ''
  tasksStore.mediaAdding.dialogProcess = true
  tasksStore.mediaAdding.active = true
  tasksStore.mediaAdding.media_type_id = mediaTypeId

  eventBus.emit("addMedia", () => {
    eventBus.emit("update:watcher")
  })
}

const removeFiles = async (
  lost: WatcherFileChangeGroup['lost'],
  fileType: MediaType,
) => {
  dialogsStore.confirm.text = t('watcher.folder.delete_confirm')
  dialogsStore.confirm.show = true
  dialogsStore.confirm.action = async () => {
    if (!isManagedMediaType(fileType)) return false

    watcherStore.dialogFolder = false

    const data = {
      metaId: null,
      with_file: false,
      type: getMediaDeleteAssetFolder(fileType),
    }

    const deletePromises = lost.map(async (item) => {
      const deleteData = {...data, ...{id: item.id, path: item.path}}

      return typedApi.deleteMediaOne(deleteData)
    })

    await Promise.all(deletePromises)

    eventBus.emit("removeEntitiesFromState", {
      ids: lost.map((i) => i.id),
      type: 'media',
    })

    eventBus.emit("update:watcher")
  }
}
</script>
