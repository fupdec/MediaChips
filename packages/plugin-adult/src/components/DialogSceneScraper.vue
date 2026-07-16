<template>
  <v-dialog
    v-show="dialogsStore.sceneScraper.show"
    @update:model-value="closeDialog"
    :model-value="dialogsStore.sceneScraper.show"
    width="900"
    scrollable
  >
    <v-card>
      <DialogHeader
        @close="closeDialog"
        :header="t('scene_scraper.title')"
        :subheader="mediaLabel"
        closable
      />

      <v-card-text class="py-6">
        <form @submit.prevent="searchScenesByText()">
          <v-text-field
            v-model="query"
            :disabled="sceneScraperStore.searchInProgress"
            :loading="sceneScraperStore.searchInProgress"
            :placeholder="t('scene_scraper.search_placeholder')"
            append-inner-icon="mdi-magnify"
            @click:append-inner="searchScenesByText()"
            class="mb-4"
            hide-details
            variant="filled"
            density="comfortable"
            autofocus
          />
        </form>

        <v-alert
          v-if="matchMethodLabel"
          type="success"
          variant="tonal"
          class="mb-4"
        >
          {{ matchMethodLabel }}
        </v-alert>

        <v-alert
          v-if="errorMessage"
          type="error"
          variant="tonal"
          class="mb-4"
        >
          {{ errorMessage }}
        </v-alert>

        <v-alert
          v-else-if="!sceneScraperStore.searchInProgress && searched && !scenes.length"
          type="info"
          variant="tonal"
          class="mb-4"
        >
          {{ t('scene_scraper.no_results') }}
        </v-alert>

        <v-row>
          <v-col
            cols="12"
            sm="6"
            md="4"
            v-for="scene in scenes"
            :key="scene.id"
          >
            <v-card
              @click="openDataTransfer(scene)"
              :variant="selectedScene?.id === scene.id ? 'outlined' : 'elevated'"
              :color="selectedScene?.id === scene.id ? 'primary' : undefined"
              height="100%"
            >
              <v-img
                :src="getSceneImage(scene)"
                :aspect-ratio="16/9"
                cover
              >
                <template #placeholder>
                  <div class="d-flex align-center justify-center fill-height bg-grey-darken-3">
                    <v-icon size="40" color="grey">mdi-movie-open-outline</v-icon>
                  </div>
                </template>
              </v-img>

              <v-card-title class="text-body-2 py-2">
                {{ scene.title || t('scene_scraper.untitled') }}
              </v-card-title>

              <v-card-subtitle class="pb-2">
                <div v-if="scene.studio?.name">{{ scene.studio.name }}</div>
                <div>{{ formatSceneDate(scene) }}</div>
              </v-card-subtitle>
            </v-card>
          </v-col>
        </v-row>

        <v-dialog v-model="dialogDataTransfer" max-width="1000px" scrollable>
          <v-card>
            <DialogHeader
              @close="dialogDataTransfer = false"
              :header="t('scene_scraper.data_transfer', { name: selectedScene?.title || t('scene_scraper.untitled') })"
              :buttons="transferButtons"
              closable
            />

            <v-card-text>
              <SceneScraperDataTransfer
                v-if="selectedScene && transferContextKey"
                :key="transferContextKey"
                :scene="selectedScene"
              />
            </v-card-text>
          </v-card>
        </v-dialog>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import SceneScraperDataTransfer from './scraper/SceneScraperDataTransfer.vue'
import {useAppStore} from '@/stores/app'
import {useDialogsStore} from '@/stores/dialogs'
import {useItemsStore} from '@/stores/items'
import {useSceneScraperStore} from '../stores/sceneScraper'
import {useSettingsStore} from '@/stores/settings'
import {useEventBus} from '@/utils/eventBus'
import {setNotification} from '@/services/notificationService'
import {
  applyManualSceneTransferToMedia,
  isExactOshashMatch,
  type SceneAutoApplyResult,
} from '../services/sceneScraperAutoApply'
import {applySceneScrapeResultToCard} from '../services/sceneScraperCardRefresh'
import {applyTransferAllToFields} from '../utils/sceneTransferApply'
import {buildSceneSearchQueryFromFilename} from '@/utils/sceneSearchQuery'
import {buildSceneScrapeSuccessNotificationText} from '../utils/sceneScraperMarkerSummary'
import {
  getCurrentMediaType,
  getMediaDeleteAssetFolder,
} from '@/utils/mediaType'
import type {SceneScraperScene} from '../types/sceneScraper'

interface DialogHeaderButton {
  icon?: string
  text?: string
  color?: string
  outlined?: boolean
  action?: () => void | Promise<void>
}

const appStore = useAppStore()
const dialogsStore = useDialogsStore()
const itemsStore = useItemsStore()
const sceneScraperStore = useSceneScraperStore()
const settingsStore = useSettingsStore()
const eventBus = useEventBus()
const {t} = useI18n()

const searched = ref(false)
const selectedScene = ref<SceneScraperScene | null>(null)
const dialogDataTransfer = ref(false)
const transferInProgress = ref(false)
const searchGeneration = ref(0)

const query = computed({
  get: () => sceneScraperStore.query,
  set: (value: string) => {
    sceneScraperStore.query = value
  },
})

const scenes = computed(() => sceneScraperStore.scenes)

const transferContextKey = computed(() => {
  const mediaId = dialogsStore.sceneScraper.media?.id
  const sceneId = selectedScene.value?.id
  if (mediaId == null || !sceneId) return ''
  return `${mediaId}:${sceneId}`
})

const mediaLabel = computed((): string => {
  const media = dialogsStore.sceneScraper.media
  if (!media) return ''
  return media.basename || media.name || media.path?.split('/').pop() || ''
})

const errorMessage = computed(() => sceneScraperStore.lastError)

const matchMethodLabel = computed(() => {
  if (!searched.value || sceneScraperStore.searchInProgress) return ''
  if (sceneScraperStore.matchMethod === 'oshash') {
    return t('scene_scraper.matched_by_oshash')
  }
  if (sceneScraperStore.matchMethod === 'search' && sceneScraperStore.scenes.length) {
    return t('scene_scraper.matched_by_search')
  }
  return ''
})

const transferButtons = computed((): DialogHeaderButton[] => [
  {
    icon: 'check',
    text: t('common.apply'),
    color: 'success',
    outlined: false,
    action: transferScrapedInfo,
  },
])

function getSceneImage(scene: SceneScraperScene): string {
  return scene.images?.[0]?.url || '/images/unavailable.png'
}

function formatSceneDate(scene: SceneScraperScene): string {
  return scene.date || scene.release_date || ''
}

function openDataTransfer(scene: SceneScraperScene) {
  // Drop leftover transfer UI state from the previous scene/media.
  sceneScraperStore.fields = []
  sceneScraperStore.selectedPosterUrl = null
  sceneScraperStore.markers = []
  sceneScraperStore.markersSceneId = null
  selectedScene.value = scene
  dialogDataTransfer.value = true
}

function hasManualTransferChanges(): boolean {
  const fields = sceneScraperStore.fields || []
  if (fields.some((field) => field.isTransfered)) return true
  if (String(sceneScraperStore.selectedPosterUrl || '').trim()) return true
  return (sceneScraperStore.markers || []).some(
    (marker) => marker.selected && !marker.alreadyExists && !marker.unresolved,
  )
}

async function refreshMediaAfterScrape(
  mediaId: number,
  result?: Pick<SceneAutoApplyResult, 'mediaName' | 'mediaBookmark' | 'mediaTags' | 'mediaValues'>,
  {
    refreshThumb = true,
    reloadEditor = true,
  }: {
    refreshThumb?: boolean
    reloadEditor?: boolean
  } = {},
) {
  await applySceneScrapeResultToCard(mediaId, result, {refreshThumb})

  // Refetch after local card update so a stale in-flight list request cannot win.
  eventBus.emit('getItemsFromDb', {ids: [mediaId], type: 'media'})

  if (reloadEditor) {
    eventBus.emit('transferSceneScrapedInfo')
  }
}

/** Patch oshash locally only — never refetch here (races with oshash auto-apply). */
function syncMediaAfterOshashUpdate(mediaId: number, oshash: string) {
  const scraperMedia = dialogsStore.sceneScraper.media
  if (scraperMedia && Number(scraperMedia.id) === Number(mediaId)) {
    dialogsStore.sceneScraper.media = {...scraperMedia, oshash}
  }

  const editingMedia = dialogsStore.mediaEditing.media
  if (editingMedia && Number(editingMedia.id) === Number(mediaId)) {
    dialogsStore.mediaEditing.media = {...editingMedia, oshash}
  }

  itemsStore.updateItem({
    id: mediaId,
    item: {oshash},
  })
}

function syncMediaEditingCopy(
  mediaId: number,
  {
    mediaName,
    mediaBookmark,
  }: {
    mediaName?: string | null
    mediaBookmark?: string | null
  } = {},
) {
  const editingMedia = dialogsStore.mediaEditing.media
  if (!editingMedia || Number(editingMedia.id) !== Number(mediaId)) return

  dialogsStore.mediaEditing.media = {
    ...editingMedia,
    ...(mediaName !== undefined ? {name: mediaName || undefined} : {}),
    ...(mediaBookmark !== undefined ? {bookmark: mediaBookmark} : {}),
  }
}

async function transferScrapedInfo() {
  const media = dialogsStore.sceneScraper.media
  if (!media?.id || transferInProgress.value) return

  // Apply without an explicit selection → transfer everything found.
  if (!hasManualTransferChanges()) {
    sceneScraperStore.fields = applyTransferAllToFields(sceneScraperStore.fields || [])
    for (const marker of sceneScraperStore.markers || []) {
      if (!marker.alreadyExists && !marker.unresolved) {
        marker.selected = true
      }
    }
    sceneScraperStore.setMarkers([...(sceneScraperStore.markers || [])])
  }

  const didTransferContent = hasManualTransferChanges()
  transferInProgress.value = true
  try {
    const mediaType = getCurrentMediaType(
      appStore.mediaTypes,
      media.mediaTypeId ?? itemsStore.environment?.media_type_id,
    )
    const mediaTypeFolder = getMediaDeleteAssetFolder(mediaType) || 'videos'

    const result = await applyManualSceneTransferToMedia({
      media,
      fields: sceneScraperStore.fields || [],
      allTags: appStore.tags || [],
      mediaPath: appStore.mediaPath,
      mediaTypeFolder,
      selectedPosterUrl: sceneScraperStore.selectedPosterUrl,
      markers: sceneScraperStore.markers || [],
      sceneTitle: selectedScene.value?.title || null,
    })

    if (!result.success) {
      setNotification({
        type: 'error',
        title: t('scraper.error'),
        text: t(`scene_scraper.auto_scrape_error.${result.error || 'save_failed'}`),
      })
      return
    }

    // No scene data transferred — only possible side effect is lazy oshash from match.
    if (!didTransferContent) {
      const oshash = String(sceneScraperStore.oshash || media.oshash || '').trim()
      if (oshash) {
        syncMediaAfterOshashUpdate(Number(media.id), oshash)
      }
      dialogDataTransfer.value = false
      closeDialog()
      return
    }

    syncMediaEditingCopy(Number(media.id), {
      mediaName: result.mediaName,
      mediaBookmark: result.mediaBookmark,
    })
    await refreshMediaAfterScrape(Number(media.id), result)

    if (result.markersImported && result.markersImported > 0) {
      eventBus.emit('refreshMarkThumbs')
    }

    setNotification({
      type: 'success',
      title: t('scene_scraper.auto_scrape_done'),
      text: buildSceneScrapeSuccessNotificationText({
        sceneTitle: result.sceneTitle,
        mediaName: result.mediaName,
        markersImported: result.markersImported,
        importMarkersEnabled: settingsStore.sceneScraperImportMarkers === '1',
        t,
      }),
    })

    dialogDataTransfer.value = false
    closeDialog()
  } finally {
    transferInProgress.value = false
  }
}

async function tryAutoApplyExactMatch(): Promise<boolean> {
  const media = dialogsStore.sceneScraper.media
  if (!media) return false
  if (settingsStore.sceneAutoApplyOnExactMatch !== '1') return false
  if (!isExactOshashMatch(sceneScraperStore.matchMethod, sceneScraperStore.scenes.length)) {
    return false
  }

  const result = await sceneScraperStore.autoScrapeMedia({
    media,
    requireExactOshash: true,
  })

  if (!result.success) return false

  setNotification({
    type: 'success',
    title: t('scene_scraper.auto_scrape_done'),
    text: buildSceneScrapeSuccessNotificationText({
      sceneTitle: result.sceneTitle,
      mediaName: result.mediaName,
      markersImported: result.markersImported,
      importMarkersEnabled: settingsStore.sceneScraperImportMarkers === '1',
      t,
    }),
  })
  syncMediaEditingCopy(Number(media.id), {
    mediaName: result.mediaName,
    mediaBookmark: result.mediaBookmark,
  })
  await refreshMediaAfterScrape(Number(media.id), result)
  closeDialog()
  return true
}

async function searchScenes({useTextSearchOnly = false}: {useTextSearchOnly?: boolean} = {}) {
  const generation = ++searchGeneration.value
  const media = dialogsStore.sceneScraper.media
  const mediaId = media?.id != null ? Number(media.id) : null

  searched.value = true
  selectedScene.value = null
  dialogDataTransfer.value = false

  if (useTextSearchOnly) {
    await sceneScraperStore.searchScenes()
    return
  }

  const hadOshash = Boolean(String(media?.oshash || '').trim())

  if (mediaId) {
    await sceneScraperStore.matchScenesForMedia({
      mediaId,
      query: sceneScraperStore.query,
    })

    // Ignore stale responses from an earlier media/search.
    if (generation !== searchGeneration.value) return
    if (Number(dialogsStore.sceneScraper.media?.id) !== mediaId) return

    const nextOshash = String(sceneScraperStore.oshash || '').trim()
    if (!hadOshash && nextOshash) {
      // Lazy oshash write during match — sync card, do not toast.
      syncMediaAfterOshashUpdate(mediaId, nextOshash)
    }
  } else {
    await sceneScraperStore.searchScenes()
    if (generation !== searchGeneration.value) return
  }

  if (generation !== searchGeneration.value) return
  if (mediaId != null && Number(dialogsStore.sceneScraper.media?.id) !== mediaId) return

  if (sceneScraperStore.matchMethod === 'oshash' && sceneScraperStore.scenes.length === 1) {
    if (await tryAutoApplyExactMatch()) return
    if (generation !== searchGeneration.value) return
    if (mediaId != null && Number(dialogsStore.sceneScraper.media?.id) !== mediaId) return
    openDataTransfer(sceneScraperStore.scenes[0])
  }
}

async function searchScenesByText() {
  await searchScenes({useTextSearchOnly: true})
}

function closeDialog(value = false) {
  if (value) return
  searchGeneration.value += 1
  dialogsStore.sceneScraper.show = false
  dialogsStore.sceneScraper.media = null
  selectedScene.value = null
  dialogDataTransfer.value = false
  searched.value = false
  sceneScraperStore.reset()
}

function bootstrapQuery() {
  const media = dialogsStore.sceneScraper.media
  const filename = String(
    media?.basename || media?.name || media?.path?.split('/').pop() || '',
  )
  sceneScraperStore.setQueryFromFilename(filename)

  if (!sceneScraperStore.query && filename) {
    sceneScraperStore.query = buildSceneSearchQueryFromFilename(filename)
  }
}

function prepareForMedia(mediaId: number | null) {
  selectedScene.value = null
  dialogDataTransfer.value = false
  searched.value = false
  sceneScraperStore.clearSearchResults()
  sceneScraperStore.currentValues = {}
  sceneScraperStore.pinned = []
  sceneScraperStore.transferMediaId = mediaId
  bootstrapQuery()
}

onMounted(async () => {
  const mediaId = dialogsStore.sceneScraper.media?.id != null
    ? Number(dialogsStore.sceneScraper.media.id)
    : null
  prepareForMedia(mediaId)
  await searchScenes()
})

watch(
  () => dialogsStore.sceneScraper.media?.id,
  async (mediaId, previousId) => {
    if (!mediaId || mediaId === previousId) return
    prepareForMedia(Number(mediaId))
    await searchScenes()
  },
)
</script>
