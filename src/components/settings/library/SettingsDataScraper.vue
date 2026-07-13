<template>
  <div class="mx-4">
    <settings-category-divider
      :title="t('settings_labels.library.data_scraper')"
      icon="search-web"
    >
      <template #actions>
        <button-documentation id="data_scraper"/>
      </template>
    </settings-category-divider>

    <settings-switch
      :title="t('settings_labels.tools.adult_features')"
      :hint="t('settings_labels.tools.adult_features_hint')"
      option="showAdultContent"
      icon-text="shield-alert"
      id="adult_content_checkbox"
      class="mb-4"
    />

    <template v-if="settingsStore.showAdultContent === '1'">
      <v-card-subtitle class="px-0 mb-2">{{ t('settings_labels.tools.performer_scraper') }}</v-card-subtitle>
      <div class="text-caption text-medium-emphasis mb-4">
        {{ t('settings_labels.tools.data_scraper_hint') }}
      </div>

      <v-row>
        <v-col cols="12" sm="6">
          <v-autocomplete
            v-model="selected_meta"
            @update:model-value="onPerformerMetaSelected"
            :items="meta_tags"
            item-value="id"
            item-title="name"
            :label="t('settings_labels.tools.performers_meta')"
            :placeholder="t('settings_labels.tools.select_meta')"
            return-object
            variant="filled"
          >
            <template v-slot:selection="{ item }">
              <v-icon start>mdi-{{ item.raw.icon }}</v-icon>
              <span>{{ item.raw.name }}</span>
            </template>
            <template v-slot:item="{ item, props }">
              <v-list-item v-bind="props">
                <template #title>
                  <v-icon start>mdi-{{ item.raw.icon }}</v-icon>
                  <span>{{ item.raw.name }}</span>
                </template>
              </v-list-item>
            </template>
          </v-autocomplete>
        </v-col>
        <v-col cols="12" sm="6">
          <v-btn
            :disabled="!selected_meta"
            class="mb-4"
            color="primary"
            rounded
            variant="flat"
          >
            <DialogScraperConfig v-if="selected_meta" :meta="selected_meta"/>

            <v-icon start>mdi-search-web</v-icon>
            {{ t('settings_labels.tools.configure_scraper') }}
          </v-btn>

          <v-btn
            :disabled="!selected_meta || scraperStore.autoScrapeInProgress || allTagsCount === 0"
            @click="confirmScrapeAll"
            class="mb-4 ml-2"
            color="info"
            rounded
            variant="tonal"
          >
            <v-icon start>mdi-cloud-download</v-icon>
            {{ t('settings_labels.tools.scrape_all_tags', { count: allTagsCount }) }}
          </v-btn>
        </v-col>
      </v-row>

      <v-divider class="my-4"/>

      <v-card-subtitle class="px-0 mb-2">{{ t('settings_labels.tools.scene_scraper') }}</v-card-subtitle>
      <div class="text-caption text-medium-emphasis mb-4">
        {{ t('settings_labels.tools.scene_scraper_hint') }}
      </div>

      <v-row>
        <v-col cols="12" sm="6">
          <v-autocomplete
            v-model="selectedVideoMediaType"
            :items="videoMediaTypes"
            item-value="id"
            item-title="name"
            :label="t('settings_labels.tools.video_media_type')"
            :placeholder="t('settings_labels.tools.select_video_media_type')"
            return-object
            variant="filled"
          >
            <template #selection="{ item }">
              <v-icon start>mdi-{{ item.raw.icon || 'video' }}</v-icon>
              <span>{{ item.raw.name }}</span>
            </template>
            <template #item="{ item, props }">
              <v-list-item v-bind="props">
                <template #title>
                  <v-icon start>mdi-{{ item.raw.icon || 'video' }}</v-icon>
                  <span>{{ item.raw.name }}</span>
                </template>
              </v-list-item>
            </template>
          </v-autocomplete>
        </v-col>
        <v-col cols="12" sm="6">
          <v-btn
            :disabled="!selectedVideoMediaType"
            class="mb-4"
            color="primary"
            rounded
            variant="flat"
          >
            <DialogSceneScraperConfig
              v-if="selectedVideoMediaType"
              :media-type-id="selectedVideoMediaType.id"
            />

            <v-icon start>mdi-movie-search</v-icon>
            {{ t('settings_labels.tools.configure_scene_scraper') }}
          </v-btn>

          <v-btn
            v-if="selectedVideoMediaType"
            :disabled="!selectedVideoMediaType || sceneScraperStore.autoScrapeInProgress || allVideosCount === 0"
            @click="confirmScrapeAllScenes"
            class="mb-4 ml-2"
            color="info"
            rounded
            variant="tonal"
          >
            <v-icon start>mdi-cloud-download</v-icon>
            {{ t('settings_labels.tools.scrape_all_scenes', { count: allVideosCount }) }}
          </v-btn>
        </v-col>
      </v-row>

      <settings-switch
        :title="t('settings_labels.tools.scene_auto_apply')"
        :hint="t('settings_labels.tools.scene_auto_apply_hint')"
        option="sceneAutoApplyOnExactMatch"
        icon-text="flash-auto"
        class="mt-2"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import {ref, computed, onMounted, watch, defineAsyncComponent} from "vue"
import {useI18n} from "vue-i18n"
import {useAppStore} from "@/stores/app"
import {typedApi} from "@/services/typedApi"
import sortBy from 'lodash/sortBy'
import ButtonDocumentation from "@/components/ui/ButtonDocumentation.vue"
import SettingsCategoryDivider from "@/components/ui/SettingsCategoryDivider.vue"
import SettingsSwitch from "@/components/ui/SettingsSwitch.vue"
import {useSettingsStore} from "@/stores/settings"
import {useEventBus} from "@/utils/eventBus"
import {useScraperStore} from "@/stores/scraper"
import {useSceneScraperStore} from "@/stores/sceneScraper"
import {useAutoScrapeBatch} from "@/composable/useAutoScrapeBatch"
import {useAutoSceneScrapeBatch, getAllVideoMediaForType} from "@/composable/useAutoSceneScrapeBatch"
import {getAllTagsForMeta} from "@/utils/resolveSelectedTags"
import {isVideoMediaType} from "@/utils/mediaType"
import type { Meta } from '@/types/stores'
import type { MediaType } from '@/types/media'

const DialogScraperConfig = defineAsyncComponent(() =>
  import("@/components/dialogs/DialogScraperConfig.vue")
)

const DialogSceneScraperConfig = defineAsyncComponent(() =>
  import("@/components/dialogs/DialogSceneScraperConfig.vue")
)

const store = useAppStore()
const settingsStore = useSettingsStore()
const scraperStore = useScraperStore()
const sceneScraperStore = useSceneScraperStore()
const { runForAll } = useAutoScrapeBatch()
const { runForAll: runSceneScrapeForAll } = useAutoSceneScrapeBatch()
const eventBus = useEventBus()
const {t} = useI18n()

const selected_meta = ref<Meta | undefined>(undefined)
const selectedVideoMediaType = ref<MediaType | undefined>(undefined)

const meta_tags = computed(() => {
  const metas = store.meta?.filter(i => i.type === "array") || []
  return sortBy(metas, "name")
})

const videoMediaTypes = computed(() => {
  const types = store.mediaTypes?.filter((item) => isVideoMediaType(item)) || []
  return sortBy(types, "name")
})

const allTagsCount = computed(() => {
  if (!selected_meta.value) return 0
  return getAllTagsForMeta(selected_meta.value.id).length
})

const allVideosCount = ref(0)

async function refreshAllVideosCount() {
  if (!selectedVideoMediaType.value?.id) {
    allVideosCount.value = 0
    return
  }

  const response = await getAllVideoMediaForType(selectedVideoMediaType.value.id)
  allVideosCount.value = response.length
}

async function onPerformerMetaSelected(meta: Meta | null | undefined) {
  selected_meta.value = meta || undefined
  if (!meta) return
  await updateSettings(meta)
}

async function confirmScrapeAll() {
  if (!selected_meta.value || allTagsCount.value === 0) return

  const confirmed = window.confirm(
    t('settings_labels.tools.scrape_all_tags_confirm', { count: allTagsCount.value }),
  )
  if (!confirmed) return

  await runForAll(selected_meta.value)
}

async function confirmScrapeAllScenes() {
  if (!selectedVideoMediaType.value || allVideosCount.value === 0) return

  const confirmed = window.confirm(
    t('settings_labels.tools.scrape_all_scenes_confirm', { count: allVideosCount.value }),
  )
  if (!confirmed) return

  await runSceneScrapeForAll(selectedVideoMediaType.value.id)
}

async function updateSettings(meta: Meta) {
  const allMeta = store.meta || []
  for (const item of allMeta) {
    try {
      await typedApi.updateMeta(item.id, {scraper: false})
    } catch (error) {
      console.error("Error updating meta setting:", error)
    }
  }

  try {
    await typedApi.updateMeta(meta.id, {scraper: true})

    eventBus.emit("getMeta")
  } catch (error) {
    console.error("Error updating selected meta:", error)
  }
}

onMounted(async () => {
  selected_meta.value = meta_tags.value.find(i => i.scraper)
  selectedVideoMediaType.value = videoMediaTypes.value[0]
  await refreshAllVideosCount()
})

watch(selectedVideoMediaType, () => {
  void refreshAllVideosCount()
})

watch(
  () => store.meta,
  () => {
    if (selected_meta.value) {
      selected_meta.value = meta_tags.value.find(
        (item) => item.id === selected_meta.value?.id,
      ) || selected_meta.value
    } else {
      selected_meta.value = meta_tags.value.find(i => i.scraper)
    }
  },
  { deep: true },
)
</script>
