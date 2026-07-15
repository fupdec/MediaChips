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
                v-if="selectedScene"
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
import {useDialogsStore} from '@/stores/dialogs'
import {useSceneScraperStore} from '../stores/sceneScraper'
import {useSettingsStore} from '@/stores/settings'
import {useEventBus} from '@/utils/eventBus'
import {setNotification} from '@/services/notificationService'
import {isExactOshashMatch} from '../services/sceneScraperAutoApply'
import {buildSceneSearchQueryFromFilename} from '@/utils/sceneSearchQuery'
import {buildSceneScrapeSuccessNotificationText} from '../utils/sceneScraperMarkerSummary'
import type {SceneScraperScene} from '../types/sceneScraper'

interface DialogHeaderButton {
  icon?: string
  text?: string
  color?: string
  outlined?: boolean
  action?: () => void | Promise<void>
}

const dialogsStore = useDialogsStore()
const sceneScraperStore = useSceneScraperStore()
const settingsStore = useSettingsStore()
const eventBus = useEventBus()
const {t} = useI18n()

const searched = ref(false)
const selectedScene = ref<SceneScraperScene | null>(null)
const dialogDataTransfer = ref(false)

const query = computed({
  get: () => sceneScraperStore.query,
  set: (value: string) => {
    sceneScraperStore.query = value
  },
})

const scenes = computed(() => sceneScraperStore.scenes)

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
  selectedScene.value = scene
  dialogDataTransfer.value = true
}

function transferScrapedInfo() {
  dialogDataTransfer.value = false
  dialogsStore.sceneScraper.show = false
  eventBus.emit('transferSceneScrapedInfo')
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
  eventBus.emit('getItemsFromDb', { ids: [media.id], type: 'media' })
  closeDialog()
  return true
}

async function searchScenes({useTextSearchOnly = false}: {useTextSearchOnly?: boolean} = {}) {
  searched.value = true
  selectedScene.value = null
  dialogDataTransfer.value = false

  if (useTextSearchOnly) {
    await sceneScraperStore.searchScenes()
    return
  }

  const media = dialogsStore.sceneScraper.media
  if (media?.id) {
    await sceneScraperStore.matchScenesForMedia({
      mediaId: Number(media.id),
      query: sceneScraperStore.query,
    })
  } else {
    await sceneScraperStore.searchScenes()
  }

  if (sceneScraperStore.matchMethod === 'oshash' && sceneScraperStore.scenes.length === 1) {
    if (await tryAutoApplyExactMatch()) return
    openDataTransfer(sceneScraperStore.scenes[0])
  }
}

async function searchScenesByText() {
  await searchScenes({useTextSearchOnly: true})
}

function closeDialog(value = false) {
  if (value) return
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

onMounted(async () => {
  bootstrapQuery()
  await searchScenes()
})

watch(
  () => dialogsStore.sceneScraper.media?.id,
  async (mediaId, previousId) => {
    if (!mediaId || mediaId === previousId) return
    bootstrapQuery()
    searched.value = false
    selectedScene.value = null
    dialogDataTransfer.value = false
    await searchScenes()
  },
)
</script>
