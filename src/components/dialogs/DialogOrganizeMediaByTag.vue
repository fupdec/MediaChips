<template>
  <v-dialog
    v-model="operationsStore.create_folder_move_media.dialog"
    :fullscreen="smAndDown"
    scrollable
    width="600"
  >
    <v-card>
      <DialogHeader
        @close="operationsStore.create_folder_move_media.dialog =false"
        :header="t('media.organize.title')"
        :buttons="buttons"
        closable
      />

      <v-card-subtitle class="mt-4 pb-2">
        {{ t('media.organize.root_folder') }}
      </v-card-subtitle>

      <v-card-text>
        <v-btn
          v-if="isElectron"
          @click="chooseDir"
          class="mb-4"
          color="primary"
          rounded="pill"
          variant="flat"
        >
          <v-icon start>mdi-folder-open</v-icon>
          {{ t('settings_labels.database.select_folder') }}
        </v-btn>

        <v-text-field
          :model-value="root_folder"
          @update:model-value="onRootFolderInput"
          @change="getExample"
          :label="t('settings_labels.database.path_to_folder')"
          variant="outlined"
          rounded="pill"
          density="compact"
          hide-details
        ></v-text-field>
      </v-card-text>

      <v-card-subtitle class="pb-2">
        {{ t('widgets.stats.tags') }}
      </v-card-subtitle>

      <v-card-text>
        <v-chip-group v-if="meta_list.length" column>
          <v-chip
            v-for="i in meta_list"
            :key="i.id"
            @click="addTag(i)"
            variant="outlined"
          >
            <v-icon start>mdi-{{ i.icon }}</v-icon>
            {{ i.name }}
          </v-chip>
        </v-chip-group>

        <v-alert
          v-else-if="metas.length === 0"
          type="info"
          class="text-caption"
          variant="tonal"
          rounded="xl"
          density="compact"
        >
          {{ t('media.organize.no_pinned_tag_meta') }}
        </v-alert>

        <div v-else>{{ t('media.organize.no_more_tags') }}</div>
      </v-card-text>

      <v-card-subtitle class="pb-2">
        {{ t('media.organize.folder_structure') }}
      </v-card-subtitle>

      <v-card-text>
        <v-chip-group v-if="structure.length" column>
          <draggable
            v-model="structure"
            v-bind="dragOptions"
            item-key="id"
            class="d-flex flex-wrap"
          >
            <template #item="{element, index}">
              <div class="d-flex align-center">
                <v-icon v-if="index > 0" size="small">mdi-slash-forward</v-icon>
                <v-chip
                  @click="remove(element, index)"
                  variant="outlined"
                  class="ml-1"
                >
                  <v-icon start>mdi-{{ element.icon }}</v-icon>
                  {{ element.name }}
                </v-chip>
              </div>
            </template>
          </draggable>
        </v-chip-group>

        <v-alert
          v-else
          type="info"
          class="text-caption"
          variant="tonal"
          density="compact"
          rounded="xl"
        >
          {{ t('media.organize.click_tag_to_add') }}
        </v-alert>

        <div v-if="example" class="mt-4 text-caption d-flex align-center">
          <v-icon start>mdi-folder</v-icon>
          {{ example }}
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {ref, computed, onMounted} from 'vue'
import {useDisplay} from 'vuetify'
import {useI18n} from 'vue-i18n'
import {storeToRefs} from 'pinia'
import draggable from 'vuedraggable'
import path from 'path-browserify'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useOperationsStore} from '@/stores/operations'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import {checkFileExists} from '@/services/fileService'
import {setNotification} from '@/services/notificationService'
import {useEventBus} from '@/utils/eventBus'
import {normalizePastedFilePath} from '@/utils/filePathInput'
import type {Meta} from '@/types/stores'

interface DialogHeaderButton {
  icon?: string
  text?: string
  color?: string
  variant?: string
  disabled?: boolean
  function?: () => void | Promise<void>
}

interface MediaTagLink {
  metaId?: number
  tagId?: number
}


const {smAndDown} = useDisplay()
const {t} = useI18n()
const mainStore = useAppStore()
const itemsStore = useItemsStore()
const operationsStore = useOperationsStore()
const eventBus = useEventBus()
const {
  isElectron,
  tags: allTags,
} = storeToRefs(mainStore)

const buttons = ref<DialogHeaderButton[]>([])
const meta_list = ref<Meta[]>([])
const structure = ref<Meta[]>([])
const root_folder = ref<string | null>(null)
const example = ref('')

const onRootFolderInput = (value: string) => {
  root_folder.value = String(normalizePastedFilePath(value) ?? '')
}

const dragOptions = {
  animation: 200,
  group: "description",
  disabled: false,
  ghostClass: "ghost",
}

const ITEMS = computed(() => itemsStore)

const metas = computed((): Meta[] => {
  return ITEMS.value?.assigned?.map(i => i.meta)?.filter((i): i is Meta => Boolean(i?.type === "array")) || []
})

const getMetaList = () => {
  meta_list.value = [...metas.value]
}

const initFolder = () => {
  const ids = operationsStore.create_folder_move_media?.ids || []
  const item = ITEMS.value?.entities?.find(i => i.id === ids[0])
  if (item?.path) {
    root_folder.value = path.dirname(item.path)
  }
}

const addTag = (tag: Meta) => {
  meta_list.value = meta_list.value.filter(i => i.id !== tag.id)
  structure.value.push(tag)

  if (buttons.value[0]) {
    buttons.value[0].disabled = false
  }

  getExample()
}

const remove = (meta: Meta, index: number) => {
  structure.value.splice(index, 1)
  meta_list.value.push(meta)

  if (buttons.value[0]) {
    buttons.value[0].disabled = structure.value.length === 0
  }

  getExample()
}

const chooseDir = async () => {
  try {
    const result = await window.electronAPI?.invoke?.('showOpenDialog', ['openDirectory'])
    if (result?.filePaths?.length) {
      root_folder.value = result.filePaths[0] ?? null
      getExample()
    }
  } catch (error) {
    console.error('Error choosing directory:', error)
  }
}

const organizeFiles = async () => {
  if (!root_folder.value) {
    await setNotification({
      type: "error",
      text: t('media.organize.select_root_folder'),
    })
    return
  }

  try {
    const exists = await checkFileExists(root_folder.value)
    if (!exists) {
      await setNotification({
        type: "error",
        title: t('media.organize.root_folder_missing'),
        text: root_folder.value,
      })
      return
    }

    const ids = operationsStore.create_folder_move_media?.ids || []
    const moveItems = []

    for (const id of ids) {
      const item = ITEMS.value?.entities?.find(i => i.id === id)
      if (!item) continue

      const item_tags = (item.tags || []) as MediaTagLink[]
      let folder = root_folder.value

      for (const meta of structure.value) {
        const tags = item_tags.filter(i => meta.id === i.metaId)
        if (tags.length > 0) {
          const tag = allTags.value.find(i => i.id === tags[0].tagId)
          if (tag?.name) {
            folder = path.join(folder, tag.name)
          }
        }
      }

      moveItems.push({ id, folder })
    }

    if (moveItems.length > 0) {
      operationsStore.moving.items = moveItems
      operationsStore.moving.ids = []
      operationsStore.moving.callback = (movedId) => {
        eventBus.emit('getItemsFromDb', { ids: [movedId], type: 'media' })
      }
      await operationsStore.moveFiles()
    }

    // Очищаем выделение
    if (ITEMS.value) {
      ITEMS.value.selection = []
    }

    operationsStore.create_folder_move_media.dialog = false
  } catch (error) {
    console.error('Error organizing files:', error)
    await setNotification({
      type: "error",
      text: t('media.organize.error', {message: error instanceof Error ? error.message : String(error)}),
    })
  }
}

const getExample = () => {
  if (!root_folder.value) {
    example.value = ''
    return
  }

  let folder = root_folder.value

  for (const meta of structure.value) {
    const tags = allTags.value?.filter(i => meta.id === i.metaId) || []
    if (tags.length > 0) {
      const randomIndex = Math.floor(Math.random() * tags.length)
      folder = path.join(folder, tags[randomIndex]?.name || 'tag')
    } else {
      folder = path.join(folder, 'tag')
    }
  }

  example.value = folder
}

const initButtons = () => {
  buttons.value = [{
    icon: "folder-plus",
    text: t('common.start'),
    color: "success",
    variant: "flat",
    disabled: structure.value.length === 0,
    function: organizeFiles,
  }]
}

onMounted(() => {
  getMetaList()
  initFolder()
  initButtons()
})
</script>