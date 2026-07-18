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
          header="TMDB person field mapping"
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
            Create fields under the Cast category, then drag pinned child meta onto TMDB targets
            (Birthday, Deathday, Place of birth, Known for, Gender).
            Name / Also known as / Biography / photo are built-in.
          </v-alert>

          <div
            v-if="showCreateFieldsButton"
            class="d-flex flex-wrap align-center justify-space-between ga-3 mb-4"
          >
            <div class="text-body-2 text-medium-emphasis">
              Missing mapped person fields for this category.
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
              :key="item.pinnedMetaId ?? item.metaId ?? item.id"
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
            All pinned meta are already assigned to TMDB person fields.
          </v-alert>

          <v-alert
            v-else
            type="warning"
            rounded="xl"
            variant="tonal"
            class="text-caption"
          >
            No pinned meta under this category. Create fields first.
          </v-alert>

          <v-divider class="my-4"/>

          <v-card-subtitle class="mb-2">TMDB person fields</v-card-subtitle>

          <div class="d-flex flex-wrap">
            <div
              v-for="(field, index) in scraperFields"
              :key="field.key || index"
              @dragover.prevent="handleDragover(field, $event)"
              @drop.prevent="handleDrop(field, $event)"
              :class="{
                allowed: dragging === field.type,
                assigned: field.meta,
              }"
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
import TmdbPersonFields from '../assets/TmdbPersonFields'
import {typedApi} from '@/services/typedApi'
import {getIconDataType} from '@/services/metaTypeUtils'
import {getMetaName} from '@/utils/metaI18n'
import {setNotification} from '@/services/notificationService'
import {useEventBus} from '@/utils/eventBus'
import {ensureTmdbPersonMeta} from '../services/ensureTmdbPersonMeta'
import type {AssignedMeta} from '@/types/stores'
import type {Meta} from '@/types/stores'

interface ScraperFieldTemplate {
  name: string
  type: string
  key: string
}

interface ScraperField extends ScraperFieldTemplate {
  meta?: AssignedMeta | null
}

const props = defineProps<{
  meta?: Meta | null
  mediaTypeId?: number | null
}>()

const emit = defineEmits<{
  created: [meta: Meta]
}>()

const eventBus = useEventBus()
const {xs} = useDisplay()
const {t} = useI18n()

const dialogOpen = ref(false)
const creatingFields = ref(false)
const localMetaId = ref<number | null>(null)
const pinnedMetas = ref<AssignedMeta[]>([])
const pinnedMetasFree = ref<AssignedMeta[]>([])
const dragging = ref<string | null>(null)
const scraperFields = ref<ScraperField[]>([])
const draggedMeta = ref<AssignedMeta | null>(null)

const effectiveMetaId = computed(() => {
  const fromProps = Number(props.meta?.id)
  if (Number.isFinite(fromProps) && fromProps > 0) return fromProps
  return localMetaId.value
})

const mappedFieldCount = computed(() =>
  scraperFields.value.filter((field) => Boolean(field.meta)).length,
)

const showCreateFieldsButton = computed(() =>
  !effectiveMetaId.value || mappedFieldCount.value < scraperFields.value.length,
)

const fieldLabel = (field: ScraperFieldTemplate) =>
  t(`tmdb.person_fields.${field.key}`, field.name)

function translateWithFallback(key: string, fallback?: string) {
  const translated = t(key)
  return translated === key && fallback ? fallback : translated
}

function onDialogToggle(open: boolean) {
  dialogOpen.value = open
  if (open) void updateScraperFields()
}

function getAppendIcon(item: AssignedMeta): string | undefined {
  // Child field type lives on item.meta for pinned-child rows.
  const icon = getIconDataType(String(item.meta?.type || ''))
  return icon?.replace(/^mdi-/, '')
}

async function confirmCreateFields() {
  const confirmed = window.confirm(
    'Create missing Birthday / Deathday / Place of birth / Known for / Gender fields and map them to TMDB?',
  )
  if (!confirmed) return

  creatingFields.value = true
  try {
    const result = await ensureTmdbPersonMeta({
      parentMetaId: effectiveMetaId.value,
      mediaTypeId: props.mediaTypeId || null,
      t: translateWithFallback,
    })
    localMetaId.value = Number(result.parentMeta.id)
    eventBus.emit('getMeta')
    emit('created', result.parentMeta)
    await updateScraperFields()
    setNotification({
      type: 'success',
      title: 'TMDB person fields',
      text: `Created ${result.createdFields}, pinned ${result.pinnedFields}, mapped ${result.mappedFields}.`,
    })
  } catch (error) {
    console.error('Failed to create TMDB person meta:', error)
    const message = (error as {response?: {data?: {message?: string}}})?.response?.data?.message
      || (error instanceof Error ? error.message : String(error))
    setNotification({
      type: 'error',
      title: 'TMDB person fields',
      text: message,
    })
  } finally {
    creatingFields.value = false
  }
}

function handleDragStart(meta: AssignedMeta, event: DragEvent) {
  dragging.value = String(meta.meta?.type || '') || null
  draggedMeta.value = meta
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(
      'text/plain',
      String(meta.pinnedMetaId ?? meta.meta?.id ?? ''),
    )
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
    && String(draggedMeta.value.meta?.type || '') === field.type,
  )
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = canDrop ? 'move' : 'none'
  }
}

async function handleDrop(field: ScraperField, event: DragEvent) {
  event.preventDefault()
  const dragged = draggedMeta.value
  if (
    !dragged
    || field.meta
    || String(dragged.meta?.type || '') !== field.type
  ) {
    return
  }

  // Adult convention: metaId = parent category, pinnedMetaId = child field.
  const parentId = Number(dragged.metaId ?? effectiveMetaId.value)
  const childId = Number(dragged.pinnedMetaId ?? dragged.meta?.id)
  if (!Number.isFinite(parentId) || !Number.isFinite(childId) || parentId <= 0 || childId <= 0) {
    return
  }

  try {
    await typedApi.updatePinnedMetaAssignment({
      data: {scraper: field.key},
      metaId: parentId,
      pinnedMetaId: childId,
    })
    await updateScraperFields()
    handleDragEnd()
  } catch (error) {
    console.error('Error assigning TMDB person field:', error)
    setNotification({
      type: 'error',
      title: 'TMDB person mapping',
      text: 'Failed to assign field',
    })
  }
}

async function updateScraperFields() {
  await getPinnedMeta()
  scraperFields.value = (TmdbPersonFields as ScraperFieldTemplate[]).map((field) => ({...field}))
  for (const field of scraperFields.value) {
    const found = pinnedMetas.value.find((item) => item.scraper === field.key)
    if (found) field.meta = found
  }
}

async function remove(meta: AssignedMeta) {
  const parentId = Number(meta.metaId ?? effectiveMetaId.value)
  const childId = Number(meta.pinnedMetaId ?? meta.meta?.id)
  if (!Number.isFinite(parentId) || !Number.isFinite(childId) || parentId <= 0 || childId <= 0) {
    return
  }
  try {
    await typedApi.updatePinnedMetaAssignment({
      data: {scraper: null},
      metaId: parentId,
      pinnedMetaId: childId,
    })
    await updateScraperFields()
  } catch (error) {
    console.error('Error removing TMDB person field:', error)
  }
}

async function getPinnedMeta() {
  const metaId = Number(effectiveMetaId.value)
  if (!Number.isFinite(metaId) || metaId <= 0) {
    pinnedMetas.value = []
    pinnedMetasFree.value = []
    return
  }

  try {
    const res = await typedApi.getPinnedChildMeta(metaId)
    if (res.data?.length) {
      pinnedMetas.value = sortBy(res.data, ['meta.name'])
      pinnedMetasFree.value = pinnedMetas.value.filter((item) => !item.scraper)
    } else {
      pinnedMetas.value = []
      pinnedMetasFree.value = []
    }
  } catch (error) {
    console.error('Error fetching pinned person meta:', error)
  }
}

watch(() => props.meta?.id, (id) => {
  if (id) localMetaId.value = null
  void updateScraperFields()
})

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
  min-width: 240px;
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
