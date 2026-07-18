<template>
  <v-dialog
    v-model="dialogOpen"
    :fullscreen="xs"
    max-width="800"
    scrollable
    activator="parent"
    @update:model-value="onDialogToggle"
  >
    <template #default="{ isActive }">
      <v-card>
        <DialogHeader
          @close="isActive.value = false"
          header="TMDB field mapping"
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
            Create fields, then drag pinned meta chips onto TMDB targets
            (Release date, Studio, Cast, Genres). Title always updates the media name.
          </v-alert>

          <div
            v-if="showCreateFieldsButton"
            class="d-flex flex-wrap align-center justify-space-between ga-3 mb-4"
          >
            <div class="text-body-2 text-medium-emphasis">
              Missing mapped fields for this video media type.
            </div>
            <v-btn
              :loading="creatingFields"
              color="primary"
              rounded
              size="small"
              variant="flat"
              prepend-icon="mdi-auto-fix"
              @click="confirmCreateFields"
            >
              Create & map fields
            </v-btn>
          </div>

          <v-card-subtitle class="mb-2">Pinned meta</v-card-subtitle>

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
            v-else-if="pinnedMetas.length"
            type="success"
            rounded="xl"
            variant="tonal"
            class="text-caption"
          >
            All pinned meta are already assigned to TMDB fields.
          </v-alert>

          <v-alert
            v-else
            type="warning"
            rounded="xl"
            variant="tonal"
            class="text-caption"
          >
            No pinned meta on this media type. Create fields first.
          </v-alert>

          <v-divider class="my-4"/>

          <v-card-subtitle class="mb-2">TMDB fields</v-card-subtitle>

          <div class="d-flex flex-wrap">
            <div
              v-for="(field, index) in scraperFields"
              :key="field.key || index"
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
                <span class="text-body-1 mr-2">{{ fieldLabel(field) }}</span>
                <v-chip
                  size="small"
                  label
                  class="px-2"
                  @click="remove(field.meta)"
                  :prepend-icon="`mdi-${field.meta.meta?.icon}`"
                >
                  {{ getMetaName(field.meta.meta, t) }}
                  <span class="text-caption text-medium-emphasis pl-2">
                    {{ t(`meta.types.${field.type}`, field.type) }}
                  </span>
                </v-chip>
              </div>
              <div
                v-else
                class="d-flex justify-space-between align-center px-1"
              >
                <span class="text-medium-emphasis text-body-1 mr-2">
                  {{ fieldLabel(field) }}
                </span>
                <span class="text-medium-emphasis text-caption">
                  {{ t(`meta.types.${field.type}`, field.type) }}
                </span>
              </div>
            </div>
          </div>
        </v-card-text>
      </v-card>
    </template>
  </v-dialog>
</template>

<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue'
import {useDisplay} from 'vuetify'
import {useI18n} from 'vue-i18n'
import sortBy from 'lodash/sortBy'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import TmdbScraperFields from '../assets/TmdbScraperFields'
import {typedApi} from '@/services/typedApi'
import {getIconDataType} from '@/services/metaTypeUtils'
import {getMetaName} from '@/utils/metaI18n'
import {setNotification} from '@/services/notificationService'
import {useAppStore} from '@/stores/app'
import {useEventBus} from '@/utils/eventBus'
import {ensureTmdbScraperMeta} from '../services/ensureTmdbScraperMeta'
import {
  canAssignMetaToScraperField,
  resolveAssignmentMetaId,
  resolveAssignmentMetaType,
} from '../utils/tmdbFieldMapping'
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

const emit = defineEmits<{
  created: []
}>()

const appStore = useAppStore()
const eventBus = useEventBus()
const {xs} = useDisplay()
const {t} = useI18n()

const dialogOpen = ref(false)
const creatingFields = ref(false)
const pinnedMetas = ref<AssignedMeta[]>([])
const pinnedMetasFree = ref<AssignedMeta[]>([])
const dragging = ref<string | null>(null)
const scraperFields = ref<ScraperField[]>([])
const draggedMeta = ref<AssignedMeta | null>(null)

const mappedFieldCount = computed(() =>
  scraperFields.value.filter((field) => Boolean(field.meta)).length,
)

const showCreateFieldsButton = computed(() =>
  mappedFieldCount.value < scraperFields.value.length,
)

const fieldLabel = (field: ScraperFieldTemplate) =>
  t(`tmdb.fields.${field.key}`, field.name)

function translateWithFallback(key: string, fallback?: string) {
  const translated = t(key)
  return translated === key && fallback ? fallback : translated
}

function onDialogToggle(open: boolean) {
  dialogOpen.value = open
  if (open) void updateScraperFields()
}

function getAppendIcon(item: AssignedMeta): string | undefined {
  const icon = getIconDataType(resolveAssignmentMetaType(item, appStore.meta || []))
  return icon?.replace(/^mdi-/, '')
}

async function confirmCreateFields() {
  const confirmed = window.confirm(
    'Create missing Release date / Studio / Cast / Genres fields and map them to TMDB?',
  )
  if (!confirmed) return

  creatingFields.value = true
  try {
    const result = await ensureTmdbScraperMeta({
      mediaTypeId: Number(props.mediaTypeId),
      t: translateWithFallback,
    })
    eventBus.emit('getMeta')
    emit('created')
    await updateScraperFields()
    setNotification({
      type: 'success',
      title: 'TMDB fields',
      text: `Created ${result.createdFields}, pinned ${result.pinnedFields}, mapped ${result.mappedFields}.`,
    })
  } catch (error) {
    console.error('Failed to create TMDB scraper meta:', error)
    setNotification({
      type: 'error',
      title: 'TMDB fields',
      text: error instanceof Error ? error.message : String(error),
    })
  } finally {
    creatingFields.value = false
  }
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
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = canDrop ? 'move' : 'none'
  }
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
    console.error('Error assigning TMDB field:', error)
    setNotification({
      type: 'error',
      title: 'TMDB field mapping',
      text: 'Failed to assign field',
    })
  }
}

async function updateScraperFields() {
  await getPinnedMeta()
  scraperFields.value = (TmdbScraperFields as ScraperFieldTemplate[]).map((field) => ({...field}))
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
    console.error('Error removing TMDB field:', error)
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
    console.error('Error fetching pinned meta:', error)
  }
}

watch(() => props.mediaTypeId, () => { void updateScraperFields() })
onMounted(() => { updateScraperFields() })
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
