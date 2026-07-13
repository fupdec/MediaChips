<template>
  <v-dialog
    :fullscreen="xs"
    max-width="800"
    scrollable
    activator="parent"
  >
    <template v-slot:default="{ isActive }">
      <v-card>
        <DialogHeader
          @close="isActive.value = false"
          :header="t('scraper.setup')"
          closable
        />

        <v-card-text class="pa-4">
          <v-alert type="info"
            density="comfortable"
            variant="tonal"
            rounded="xl"
            class="text-caption mb-4">
            {{ t('scraper.drag_meta_hint') }}
          </v-alert>

          <v-card-subtitle class="mb-2">{{ t('scraper.pinned_meta') }}</v-card-subtitle>

          <div v-if="pinnedMetasFree.length"
            class="d-flex flex-wrap">
            <div
              v-for="cm in pinnedMetasFree"
              :key="cm.id"
              @dragstart="handleDragStart(cm)"
              @dragend="dragging = null"
              draggable="true"
              class="ma-1"
              :style="{cursor: dragging ? 'grabbing' : 'grab'}"
            >
              <v-chip
                size="small"
                label
                :prepend-icon="`mdi-${cm.meta?.icon}`"
                :append-icon="getIconDataType(cm.meta?.type || '')"
              >
                {{ getMetaName(cm.meta, t) }}
              </v-chip>
            </div>
          </div>

          <v-alert v-else
            type="info"
            rounded="xl"
            variant="tonal"
            class="text-caption">
            {{ t('scraper.no_more_meta_added') }}
          </v-alert>

          <v-divider class="my-4"></v-divider>

          <!-- Right column -->
          <v-card-subtitle class="mb-2">{{ t('scraper.fields_title') }}</v-card-subtitle>

          <div class="d-flex flex-wrap">
            <div
              v-for="(field, index) in scraperFields"
              :key="index"
              @dragover.prevent="handleDragover(field, $event)"
              @drop="handleDrop(field, index, $event)"
              :class="[{
                allowed: dragging === field.type,
                assigned: field.meta
              }]"
              class="data-field ma-1"
            >
              <!-- Field assigned -->
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

              <!-- Field empty -->
              <div v-else
                class="d-flex justify-space-between align-center px-1">
              <span class="text-medium-emphasis text-body-1 mr-2">
                {{ getScraperFieldName(field) }}
              </span>
                <span class="text-medium-emphasis text-caption">
                {{ getMetaTypeName(field.type) }}
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
import { ref, onMounted } from 'vue'
import type {PropType} from 'vue'
import {useDisplay} from 'vuetify'
import {useI18n} from 'vue-i18n'
import {typedApi} from '@/services/typedApi'
import sortBy from 'lodash/sortBy'
import {getIconDataType} from '@/services/metaTypeUtils'
import DialogHeader from "@/components/elements/DialogHeader.vue";
import ScraperFields from "@/assets/ScraperFields";
import {getMetaName} from "@/utils/metaI18n";
import type {AssignedMeta, Meta} from '@/types/stores'

interface ScraperFieldTemplate {
  name: string
  type: string
  key: string
}

interface ScraperField extends ScraperFieldTemplate {
  meta?: AssignedMeta | null
}

const props = defineProps({
  meta: {
    type: Object as PropType<Meta>,
    required: true,
  },
})

defineEmits(['close'])

const {xs} = useDisplay()
const {t} = useI18n()

const pinnedMetas = ref<AssignedMeta[]>([])
const pinnedMetasFree = ref<AssignedMeta[]>([])
const dragging = ref<string | null>(null)
const scraperFields = ref<ScraperField[]>([])
const draggedMeta = ref<AssignedMeta | null>(null)

const getScraperFieldName = (field: ScraperFieldTemplate) => t(`scraper.fields.${field.key}`, field.name)

const getMetaTypeName = (type: string) => t(`meta.types.${type}`, type)

function handleDragStart(meta: AssignedMeta) {
  console.log(meta)
  dragging.value = meta.meta?.type || null
  draggedMeta.value = meta
}

function handleDragover(field: ScraperField, event: DragEvent) {
  if (field.meta || (draggedMeta.value && draggedMeta.value.meta?.type !== field.type)) {
    event.dataTransfer!.dropEffect = 'none'
  } else {
    event.preventDefault()
  }
}

async function handleDrop(field: ScraperField, index: number, event: DragEvent) {
  event.preventDefault()

  if (!draggedMeta.value || field.meta || draggedMeta.value.meta?.type !== field.type) {
    return
  }

  try {
    await typedApi.updatePinnedMetaAssignment({
      data: {scraper: field.key},
      metaId: draggedMeta.value.metaId,
      pinnedMetaId: draggedMeta.value.pinnedMetaId
    })

    await updateScraperFields()
    dragging.value = null
    draggedMeta.value = null
  } catch (error) {
    console.error('Error assigning scraper field:', error)
  }
}

async function updateScraperFields() {
  await getPinnedMeta()
  scraperFields.value = (ScraperFields as ScraperFieldTemplate[]).map((field) => ({...field}))

  for (const field of scraperFields.value) {
    const found = pinnedMetas.value.find(i => i.scraper === field.key)
    if (found) field.meta = found
  }
}

async function remove(meta: AssignedMeta) {
  try {
    await typedApi.updatePinnedMetaAssignment({
      data: {scraper: null},
      metaId: meta.metaId,
      pinnedMetaId: meta.pinnedMetaId
    })

    await updateScraperFields()
  } catch (error) {
    console.error('Error removing scraper field:', error)
  }
}

async function getPinnedMeta() {
  try {
    const res = await typedApi.getPinnedChildMeta(props.meta?.id ?? 0)

    if (res.data?.length) {
      pinnedMetas.value = sortBy(res.data, ['meta.name'])
      pinnedMetasFree.value = pinnedMetas.value.filter(i => !i.scraper)
    } else {
      pinnedMetas.value = []
      pinnedMetasFree.value = []
    }
  } catch (error) {
    console.error('Error fetching pinned meta:', error)
  }
}

onMounted(() => {
  updateScraperFields()
})
</script>

<style scoped>
.data-field {
  border: 1px dashed #777;
  border-radius: 5px;
  margin-bottom: 5px;
  transition: 0.3s all;
  min-height: 40px;
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