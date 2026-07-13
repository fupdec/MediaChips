<template>
  <v-dialog
    :fullscreen="xs"
    max-width="800"
    scrollable
    activator="parent"
  >
    <template #default="{ isActive }">
      <v-card>
        <DialogHeader
          @close="isActive.value = false"
          :header="t('scene_scraper.setup')"
          closable
        />

        <v-card-text class="pa-4">
          <v-alert
            type="info"
            density="comfortable"
            variant="tonal"
            rounded="xl"
            class="text-caption mb-4"
          >
            {{ t('scene_scraper.drag_meta_hint') }}
          </v-alert>

          <v-card-subtitle class="mb-2">{{ t('scraper.pinned_meta') }}</v-card-subtitle>

          <div v-if="pinnedMetasFree.length" class="d-flex flex-wrap">
            <div
              v-for="item in pinnedMetasFree"
              :key="item.metaId"
              @dragstart="handleDragStart(item, $event)"
              @dragend="handleDragEnd"
              draggable="true"
              class="ma-1 draggable-meta"
              :style="{cursor: dragging ? 'grabbing' : 'grab'}"
            >
              <v-chip
                size="small"
                label
                :prepend-icon="`mdi-${item.meta?.icon}`"
                :append-icon="getAppendIcon(item)"
              >
                {{ getMetaName(item.meta, t) }}
              </v-chip>
            </div>
          </div>

          <v-alert
            v-else
            type="info"
            rounded="xl"
            variant="tonal"
            class="text-caption"
          >
            {{ t('scraper.no_more_meta_added') }}
          </v-alert>

          <v-divider class="my-4"></v-divider>

          <v-card-subtitle class="mb-2">{{ t('scraper.fields_title') }}</v-card-subtitle>

          <div class="d-flex flex-wrap">
            <div
              v-for="(field, index) in scraperFields"
              :key="index"
              @dragover.prevent="handleDragover(field, $event)"
              @drop.prevent="handleDrop(field, $event)"
              :class="[{
                allowed: dragging === field.type,
                assigned: field.meta,
              }]"
              class="data-field ma-1"
            >
              <div
                v-if="field.meta"
                class="d-flex justify-space-between align-center"
              >
                <span class="text-body-1 mr-2">{{ getScraperFieldName(field) }}</span>
                <v-chip
                  size="small"
                  label
                  class="px-2"
                  @click="remove(field.meta)"
                  :prepend-icon="`mdi-${field.meta.meta?.icon}`"
                >
                  {{ getMetaName(field.meta.meta, t) }}
                  <span class="text-caption text-medium-emphasis pl-2">
                    {{ getMetaTypeName(field.type) }}
                  </span>
                </v-chip>
              </div>
              <div
                v-else
                class="d-flex justify-space-between align-center px-1"
              >
                <span class="text-medium-emphasis text-body-1 mr-2">
                  {{ getScraperFieldName(field) }}
                </span>
                <span class="text-medium-emphasis text-caption">
                  {{ getMetaTypeName(field.type) }}
                </span>
              </div>
            </div>
          </div>

          <v-alert
            type="info"
            density="comfortable"
            variant="tonal"
            rounded="xl"
            class="text-caption mt-4"
          >
            <div>{{ t('scene_scraper.details_bookmark_hint') }}</div>
            <div class="mt-2">{{ t('scene_scraper.title_name_hint') }}</div>
          </v-alert>
        </v-card-text>
      </v-card>
    </template>
  </v-dialog>
</template>

<script setup lang="ts">
import {onMounted, ref} from 'vue'
import {useDisplay} from 'vuetify'
import {useI18n} from 'vue-i18n'
import sortBy from 'lodash/sortBy'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import SceneScraperFields from '@/assets/SceneScraperFields'
import {typedApi} from '@/services/typedApi'
import {getIconDataType} from '@/services/metaTypeUtils'
import {getMetaName} from '@/utils/metaI18n'
import {setNotification} from '@/services/notificationService'
import {useAppStore} from '@/stores/app'
import {
  canAssignMetaToScraperField,
  resolveAssignmentMetaId,
  resolveAssignmentMetaType,
} from '@/utils/scraperFieldMapping'
import type {AssignedMeta} from '@/types/stores'

interface ScraperFieldTemplate {
  name: string
  type: string
  key: string
}

interface ScraperField extends ScraperFieldTemplate {
  meta?: AssignedMeta | null
}

const props = defineProps<{
  mediaTypeId: number
}>()

const appStore = useAppStore()
const {xs} = useDisplay()
const {t} = useI18n()

const pinnedMetas = ref<AssignedMeta[]>([])
const pinnedMetasFree = ref<AssignedMeta[]>([])
const dragging = ref<string | null>(null)
const scraperFields = ref<ScraperField[]>([])
const draggedMeta = ref<AssignedMeta | null>(null)

const getScraperFieldName = (field: ScraperFieldTemplate) =>
  t(`scene_scraper.fields.${field.key}`, field.name)

const getMetaTypeName = (type: string) => t(`meta.types.${type}`, type)

function getAppendIcon(item: AssignedMeta): string | undefined {
  const icon = getIconDataType(resolveAssignmentMetaType(item, appStore.meta || []))
  return icon?.replace(/^mdi-/, '')
}

function handleDragStart(meta: AssignedMeta, event: DragEvent) {
  const metaType = resolveAssignmentMetaType(meta, appStore.meta || [])
  dragging.value = metaType || null
  draggedMeta.value = meta

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(resolveAssignmentMetaId(meta) ?? ''))
  }
}

function handleDragEnd() {
  dragging.value = null
  draggedMeta.value = null
}

function handleDragover(field: ScraperField, event: DragEvent) {
  const canDrop = Boolean(
    draggedMeta.value
    && !field.meta
    && canAssignMetaToScraperField(draggedMeta.value, field.type, appStore.meta || []),
  )

  if (!canDrop) {
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'none'
    return
  }

  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
}

async function handleDrop(field: ScraperField, event: DragEvent) {
  event.preventDefault()

  const dragged = draggedMeta.value
  const metaId = dragged ? resolveAssignmentMetaId(dragged) : null

  if (
    !dragged
    || metaId == null
    || field.meta
    || !canAssignMetaToScraperField(dragged, field.type, appStore.meta || [])
  ) {
    return
  }

  try {
    await typedApi.updateMetaInMediaTypeAssignment({
      data: {scraper: field.key},
      metaId,
      mediaTypeId: Number(props.mediaTypeId),
    })

    await updateScraperFields()
    handleDragEnd()
  } catch (error) {
    console.error('Error assigning scene scraper field:', error)
    setNotification({
      type: 'error',
      title: t('scene_scraper.setup'),
      text: t('scene_scraper.assign_failed'),
    })
  }
}

async function updateScraperFields() {
  await getPinnedMeta()
  scraperFields.value = (SceneScraperFields as ScraperFieldTemplate[]).map((field) => ({...field}))

  for (const field of scraperFields.value) {
    const found = pinnedMetas.value.find((item) => item.scraper === field.key)
    if (found) field.meta = found
  }
}

async function remove(meta: AssignedMeta) {
  const metaId = resolveAssignmentMetaId(meta)
  if (metaId == null) return

  try {
    await typedApi.updateMetaInMediaTypeAssignment({
      data: {scraper: null},
      metaId,
      mediaTypeId: Number(props.mediaTypeId),
    })

    await updateScraperFields()
  } catch (error) {
    console.error('Error removing scene scraper field:', error)
    setNotification({
      type: 'error',
      title: t('scene_scraper.setup'),
      text: t('scene_scraper.assign_failed'),
    })
  }
}

async function getPinnedMeta() {
  try {
    const res = await typedApi.getAssignedMetaForMediaType(Number(props.mediaTypeId))

    if (res.data?.length) {
      pinnedMetas.value = sortBy(res.data, ['meta.name'])
      pinnedMetasFree.value = pinnedMetas.value.filter((item) => !item.scraper)
    } else {
      pinnedMetas.value = []
      pinnedMetasFree.value = []
    }
  } catch (error) {
    console.error('Error fetching pinned meta for media type:', error)
  }
}

onMounted(() => {
  updateScraperFields()
})
</script>

<style scoped>
.draggable-meta :deep(.v-chip) {
  pointer-events: none;
}

.data-field {
  border: 1px dashed #777;
  border-radius: 5px;
  margin-bottom: 5px;
  transition: 0.3s all;
  min-height: 40px;
  min-width: 220px;
  display: flex;
  align-items: center;
  padding: 0 8px;
}

.data-field > div {
  width: 100%;
}

.data-field.allowed {
  background-color: rgba(37, 179, 37, 0.2);
}

.data-field.assigned {
  background-color: rgba(37, 179, 37, 0.4);
}

.data-field .v-chip {
  transition: 0.3s all;
  cursor: pointer;
}

.data-field .v-chip:hover {
  background-color: #e88484;
}
</style>
