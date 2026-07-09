<template>
  <v-card class="rounded-xl mb-6" variant="tonal" color="primary">
    <v-card-text class="pa-4">
      <div class="d-flex flex-wrap ga-2 mb-4">
        <v-btn
          @click="openAddDialog"
          color="success"
          rounded
          variant="flat"
        >
          <v-icon start>mdi-plus</v-icon>
          {{ t('home.widgets.add_media') }}
        </v-btn>

        <v-btn
          @click="openSearch"
          color="primary"
          rounded
          variant="tonal"
        >
          <v-icon start>mdi-magnify</v-icon>
          {{ t('home.widgets.search') }}
        </v-btn>

        <v-btn
          v-for="mediaType in visibleMediaTypes"
          :key="mediaType.id"
          :to="`/media?mediaTypeId=${mediaType.id}`"
          color="primary"
          rounded
          variant="tonal"
        >
          <v-icon start>mdi-{{ mediaType.icon }}</v-icon>
          {{ getMediaTypeName(mediaType, t) }}
        </v-btn>

        <v-btn
          v-for="meta in visibleMetas"
          :key="meta.id"
          :to="`/meta?metaId=${meta.id}`"
          color="primary"
          rounded
          variant="tonal"
        >
          <v-icon start>mdi-{{ meta.icon }}</v-icon>
          {{ getMetaName(meta, t) }}
        </v-btn>
      </div>

      <div
        class="home-dropzone"
        :class="{'home-dropzone--active': dropzoneActive}"
        @dragenter.prevent="onDragEnter"
        @dragover.prevent="onDragOver"
        @dragleave.prevent="onDragLeave"
        @drop.prevent="onDrop"
      >
        <v-icon class="mb-2" size="28">mdi-tray-arrow-up</v-icon>
        <div class="text-body-2">{{ t('home.widgets.drop_hint') }}</div>
      </div>
    </v-card-text>

    <DialogMediaAdding
      v-model="addDialogOpen"
      hide-activator
    />
  </v-card>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {useTasksStore} from '@/stores/tasks'
import {useItemsStore} from '@/stores/items'
import {useEventBus} from '@/utils/eventBus'
import {getDefaultMediaTypeId, inferMediaTypeFromPaths} from '@/utils/mediaType'
import {getMediaTypeName} from '@/utils/mediaTypeI18n'
import {getMetaName} from '@/utils/metaI18n'
import {collectDroppedPaths, containsDroppedFiles, startDroppedMediaAdding} from '@/utils/mediaDrop'
import DialogMediaAdding from '@/components/dialogs/DialogMediaAdding.vue'
import {setNotification} from '@/services/notificationService'

const {t} = useI18n()
const appStore = useAppStore()
const tasksStore = useTasksStore()
const itemsStore = useItemsStore()
const eventBus = useEventBus()

const addDialogOpen = ref(false)
const dropzoneActive = ref(false)
const dragDepth = ref(0)

const visibleMediaTypes = computed(() =>
  (appStore.mediaTypes || []).filter((item) => !item.hidden).slice(0, 2),
)

const visibleMetas = computed(() =>
  (appStore.meta || []).filter((item) => !item.hidden).slice(0, 2),
)

function openAddDialog() {
  tasksStore.mediaAdding.media_type_id = itemsStore.environment?.media_type_id ?? null
  addDialogOpen.value = true
}

function openSearch() {
  eventBus.emit('showGlobalSearch')
}

function containsFiles(event: DragEvent) {
  return containsDroppedFiles(event)
}

function onDragEnter(event: DragEvent) {
  if (!appStore.isElectron || !containsFiles(event)) return
  dragDepth.value += 1
  dropzoneActive.value = true
}

function onDragOver(event: DragEvent) {
  if (!appStore.isElectron || !containsFiles(event)) return
  dropzoneActive.value = true
}

function onDragLeave() {
  dragDepth.value = Math.max(0, dragDepth.value - 1)
  if (dragDepth.value === 0) {
    dropzoneActive.value = false
  }
}

function onDrop(event: DragEvent) {
  dropzoneActive.value = false
  dragDepth.value = 0

  if (!appStore.isElectron) return

  const paths = collectDroppedPaths(event)
  const inferredType = inferMediaTypeFromPaths(paths, appStore.mediaTypes)
  const mediaTypeId = inferredType?.id
    ?? itemsStore.environment?.media_type_id
    ?? getDefaultMediaTypeId(appStore.mediaTypes)

  if (!paths.length || mediaTypeId == null) {
    setNotification({
      type: 'warning',
      title: t('media.adding.files'),
      text: t('media.adding.no_matching_files'),
    })
    return
  }

  startDroppedMediaAdding({
    paths,
    mediaTypeId,
    mediaTypes: appStore.mediaTypes,
    tasksStore,
    eventBus,
  })
}
</script>

<style lang="scss" scoped>
.home-dropzone {
  border: 2px dashed rgba(var(--v-theme-primary), 0.45);
  border-radius: 16px;
  min-height: 88px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 16px;
  transition: background-color 0.15s ease, border-color 0.15s ease;

  &--active {
    border-color: rgb(var(--v-theme-primary));
    background: rgba(var(--v-theme-primary), 0.12);
  }
}
</style>
