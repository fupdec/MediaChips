<template>
  <v-alert
    type="warning"
    :model-value="metas.length === 0"
    class="mt-4 caption"
    density="compact"
    variant="text"
  >
    {{ t('scene_scraper.no_meta_warning') }} <br/>
    {{ t('scene_scraper.configure_hint') }}
    <div v-if="mediaTypeId" class="mt-2">
      <v-btn size="small" color="primary" variant="text">
        <DialogSceneScraperConfig :media-type-id="mediaTypeId"/>
        {{ t('scene_scraper.configure') }}
      </v-btn>
    </div>
  </v-alert>

  <v-card-actions class="px-0">
    <v-btn @click="restoreAll" color="primary" class="px-4" rounded variant="flat">
      <v-icon icon="mdi-restore" start></v-icon>
      {{ t('common.restore_all') }}
    </v-btn>
    <v-spacer></v-spacer>
    <v-btn
      @click="transferAll"
      color="primary"
      class="px-4"
      rounded
      variant="flat"
    >
      <v-icon icon="mdi-transfer-left" start></v-icon>
      {{ t('common.transfer_all') }}
    </v-btn>
  </v-card-actions>

  <v-table class="transfer-table" density="compact">
    <thead>
    <tr>
      <th class="pl-8" style="width: 20%">{{ t('common.meta') }}</th>
      <th style="width: 10%">{{ t('filters.parameter') }}</th>
      <th class="text-right pr-12" style="width: 35%">{{ t('common.current') }}</th>
      <th style="width: 35%">{{ t('common.found') }}</th>
    </tr>
    </thead>
    <tbody>
    <tr v-for="(item, index) in fields" :key="index">
      <td class="pl-12">
        <v-btn
          @click="restore(item)"
          :disabled="!item.isTransfered"
          class="restore-btn"
          color="primary"
          size="small"
          variant="text"
          icon
        >
          <v-icon>mdi-restore</v-icon>
        </v-btn>
        <v-icon size="20"> mdi-{{ item.meta.icon }}</v-icon>
        {{ getMetaName(item.meta, t) }}
      </td>

      <td>{{ getScraperFieldName(item.key) }}</td>

      <td class="text-right pr-12">
        <span>{{ formatFieldValue(item.valueCurrent) }}</span>
        <v-btn
          @click="transfer(item)"
          :disabled="item.isTransfered || item.isAlreadyContain"
          class="transfer-btn"
          color="primary"
          size="small"
          variant="text"
          icon
        >
          <v-icon>mdi-transfer-left</v-icon>
        </v-btn>
      </td>

      <td>
        <template v-if="item.dataType === 'array' && item.scrapedTags?.length">
          <div class="scraped-tags">
            <v-chip
              v-for="(tag, tagIndex) in item.scrapedTags"
              :key="`${tag.name}-${tagIndex}`"
              :disabled="tag.alreadyAssigned"
              :color="getTagChipColor(tag)"
              :variant="tag.selected ? 'flat' : 'outlined'"
              size="small"
              class="ma-1 scraped-tag-chip"
              @click="toggleScrapedTag(item, tag)"
            >
              <v-icon
                v-if="tag.alreadyAssigned"
                start
                size="small"
              >
                mdi-check
              </v-icon>
              <v-icon
                v-else-if="!tag.exists"
                start
                size="small"
              >
                mdi-plus-circle-outline
              </v-icon>
              <v-icon
                v-else
                start
                size="small"
              >
                mdi-tag
              </v-icon>
              {{ tag.name }}
            </v-chip>
          </div>
        </template>
        <span v-else>{{ formatFieldValue(item.valueScraper) }}</span>
      </td>
    </tr>
    </tbody>
  </v-table>

  <SceneScraperSelectPoster :scene="scene"/>

  <v-alert
    v-if="hasArrayScrapedTags || hasScenePosterImages"
    type="info"
    density="compact"
    variant="tonal"
    class="mt-4 text-caption"
  >
    <template v-if="hasArrayScrapedTags">
      <ul class="scraped-tags-legend mb-0 pl-4">
        <li>
          <v-icon size="x-small" color="primary" class="mr-1">mdi-tag</v-icon>
          {{ t('scene_scraper.tag_exists') }}
        </li>
        <li>
          <v-icon size="x-small" color="success" class="mr-1">mdi-plus-circle-outline</v-icon>
          {{ t('scene_scraper.tag_new') }}
        </li>
        <li>
          <v-icon size="x-small" class="mr-1">mdi-check</v-icon>
          {{ t('scene_scraper.tag_already_assigned') }}
        </li>
      </ul>
    </template>

    <div v-if="hasScenePosterImages" :class="{'mt-2': hasArrayScrapedTags}">
      {{ t('scene_scraper.poster_select_hint') }}
    </div>
  </v-alert>
</template>

<script setup lang="ts">
import {computed, defineAsyncComponent, onMounted, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useSceneScraperStore} from '@/stores/sceneScraper'
import {useAppStore} from '@/stores/app'
import {useDialogsStore} from '@/stores/dialogs'
import {getMetaName} from '@/utils/metaI18n'
import {buildSceneTransferFields} from '@/utils/buildSceneTransferFields'
import {applyTransferAllToFields} from '@/utils/sceneTransferApply'
import SceneScraperSelectPoster from '@/components/scraper/SceneScraperSelectPoster.vue'
import type {SceneScraperScene} from '@/types/sceneScraper'
import type {ScraperTransferField} from '@/types/scraper'
import type {SceneScraperTagEntry} from '@/utils/sceneScraperTags'

const DialogSceneScraperConfig = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogSceneScraperConfig.vue'),
)

const props = defineProps<{
  scene: SceneScraperScene
}>()

const sceneScraperStore = useSceneScraperStore()
const appStore = useAppStore()
const dialogsStore = useDialogsStore()
const {t} = useI18n()

const fields = computed(() => sceneScraperStore.fields)
const pinned = computed(() => sceneScraperStore.pinned)
const metas = computed(() => pinned.value.filter((item) => item.scraper))
const currentValues = computed(() => sceneScraperStore.currentValues)

const mediaTypeId = computed(() => {
  const mediaTypeId = dialogsStore.sceneScraper.media?.mediaTypeId
  return mediaTypeId ? Number(mediaTypeId) : null
})

const hasArrayScrapedTags = computed(() =>
  fields.value.some((item) => item.dataType === 'array' && item.scrapedTags?.length),
)

const hasScenePosterImages = computed(() =>
  (props.scene.images || []).some((image) => String(image.url ?? '').trim()),
)

const getScraperFieldName = (key: string) => t(`scene_scraper.fields.${key}`, key)

function cloneTransferValue(value: unknown): unknown {
  if (Array.isArray(value)) return [...value]
  if (value && typeof value === 'object') return {...value as Record<string, unknown>}
  return value
}

function formatFieldValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.filter(Boolean).join(', ')
  }
  if (value == null || value === '') return ''
  return String(value)
}

function normalizeNameList(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  return value
    .map((entry) => String(entry ?? '').trim())
    .filter(Boolean)
}

function areNameListsEqual(current: unknown, reserved: unknown): boolean {
  const currentNames = normalizeNameList(current)
  const reservedNames = normalizeNameList(reserved)

  if (currentNames.length !== reservedNames.length) return false

  const reservedSet = new Set(reservedNames.map((name) => name.toLowerCase()))
  return currentNames.every((name) => reservedSet.has(name.toLowerCase()))
}

function syncArrayValueFromTags(item: ScraperTransferField) {
  if (!item.scrapedTags?.length) return

  const reservedNames = normalizeNameList(item.valueReserved)
  const reservedLower = new Set(reservedNames.map((name) => name.toLowerCase()))
  const merged = [...reservedNames]

  for (const tag of item.scrapedTags) {
    if (!tag.selected || tag.alreadyAssigned) continue

    const normalized = tag.name.toLowerCase()
    if (reservedLower.has(normalized)) continue

    merged.push(tag.name)
    reservedLower.add(normalized)
  }

  item.valueCurrent = merged
  item.isTransfered = !areNameListsEqual(merged, item.valueReserved)
}

function resetScrapedTags(item: ScraperTransferField) {
  if (!item.scrapedTags?.length) return

  for (const tag of item.scrapedTags) {
    tag.selected = false
  }
}

function getTagChipColor(tag: SceneScraperTagEntry): string | undefined {
  if (tag.alreadyAssigned) return undefined
  return tag.exists ? 'primary' : 'success'
}

function toggleScrapedTag(item: ScraperTransferField, tag: SceneScraperTagEntry) {
  if (tag.alreadyAssigned) return

  tag.selected = !tag.selected
  syncArrayValueFromTags(item)
  sceneScraperStore.fields = [...sceneScraperStore.fields]
}

async function getData() {
  sceneScraperStore.fields = buildSceneTransferFields({
    scene: props.scene,
    pinned: pinned.value,
    currentValues: currentValues.value,
    tags: appStore.tags || [],
  })
}

function restore(item: ScraperTransferField) {
  item.valueCurrent = cloneTransferValue(item.valueReserved)
  resetScrapedTags(item)
  item.isTransfered = false
  sceneScraperStore.fields = [...sceneScraperStore.fields]
}

function transfer(item: ScraperTransferField) {
  if (item.isTransfered || item.isAlreadyContain) return

  if (item.dataType === 'array' && item.scrapedTags?.length) {
    for (const tag of item.scrapedTags) {
      if (!tag.alreadyAssigned) {
        tag.selected = true
      }
    }
    syncArrayValueFromTags(item)
  } else if (item.dataType === 'bookmark' || item.dataType === 'mediaName') {
    item.valueCurrent = item.valueScraper
    item.isTransfered = true
  } else {
    item.valueCurrent = item.valueScraper
    item.isTransfered = true
  }

  sceneScraperStore.fields = [...sceneScraperStore.fields]
}

function restoreAll() {
  sceneScraperStore.fields
    .filter((item) => item.isTransfered)
    .forEach((item) => restore(item))
  sceneScraperStore.selectedPosterUrl = null
}

function transferAll() {
  sceneScraperStore.fields = applyTransferAllToFields(sceneScraperStore.fields)
}

onMounted(() => {
  getData()
})

watch(
  [() => props.scene, pinned, currentValues],
  () => {
    getData()
  },
  {deep: true},
)
</script>

<style>
.transfer-table {
  .v-table__wrapper {
    overflow: hidden;
  }

  td {
    position: relative;
  }

  .restore-btn,
  .transfer-btn {
    position: absolute;
    top: 0;
    bottom: 0;
    margin: auto;
  }

  .restore-btn {
    left: 0;
  }

  .transfer-btn {
    right: 0;
  }

  .scraped-tags {
    padding-right: 8px;
  }

  .scraped-tag-chip:not(.v-chip--disabled) {
    cursor: pointer;
  }
}

.scraped-tags-legend {
  li + li {
    margin-top: 4px;
  }
}
</style>
