<template>
  <div class="scraper-settings mx-4">
    <settings-category-divider
      :title="t('settings_labels.library.data_scraper')"
      icon="search-web"
    >
      <template #actions>
        <v-spacer/>
        <button-documentation id="data_scraper"/>
      </template>
    </settings-category-divider>

    <v-alert
      class="mb-6"
      type="info"
      variant="tonal"
      density="comfortable"
      rounded="lg"
    >
      <div class="d-flex flex-wrap align-center justify-space-between ga-3">
        <div class="text-body-2">{{ t('adult_onboarding.intro') }}</div>
        <v-btn
          color="primary"
          rounded
          size="small"
          variant="flat"
          prepend-icon="mdi-shield-search"
          @click="openAdultOnboarding"
        >
          {{ t('adult_onboarding.open_guide') }}
        </v-btn>
      </div>
    </v-alert>

    <section class="scraper-block mb-6">
      <div class="text-subtitle-1 font-weight-medium mb-1">
        {{ t('settings_labels.tools.tpdb_api_key') }}
      </div>
      <div class="text-body-2 text-medium-emphasis mb-4">
        <i18n-t keypath="settings_labels.tools.tpdb_api_key_hint" tag="span">
          <template #site>
            <a
              href="https://theporndb.net/user/api-tokens"
              target="_blank"
              rel="noopener noreferrer"
            >theporndb.net</a>
          </template>
        </i18n-t>
      </div>

      <v-text-field
        v-model="tpdbApiKey"
        @blur="saveTpdbApiKey"
        :type="showTpdbApiKey ? 'text' : 'password'"
        :append-inner-icon="showTpdbApiKey ? 'mdi-eye' : 'mdi-eye-off'"
        @click:append-inner="showTpdbApiKey = !showTpdbApiKey"
        :placeholder="t('settings_labels.tools.tpdb_api_key_placeholder')"
        autocomplete="off"
        rounded
        variant="outlined"
        hide-details
        class="scraper-field"
      />
    </section>

    <v-divider class="mb-6"/>

    <section class="scraper-block mb-6">
      <div class="text-subtitle-1 font-weight-medium mb-1">
        {{ t('settings_labels.tools.scene_scraper') }}
      </div>
      <div class="text-body-2 text-medium-emphasis mb-4">
        {{ t('settings_labels.tools.scene_scraper_hint') }}
      </div>

      <v-autocomplete
        v-model="selectedVideoMediaType"
        :items="videoMediaTypes"
        item-value="id"
        item-title="name"
        :label="t('settings_labels.tools.video_media_type')"
        :placeholder="t('settings_labels.tools.select_video_media_type')"
        return-object
        variant="outlined"
        rounded
        hide-details
        class="scraper-field mb-4"
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

      <div class="d-flex flex-wrap ga-2 mb-4">
        <v-btn
          :disabled="!selectedVideoMediaType"
          color="primary"
          rounded
          variant="flat"
        >
          <DialogSceneScraperConfig
            v-if="selectedVideoMediaType"
            :media-type-id="selectedVideoMediaType.id"
          />
          <v-icon start>mdi-tune</v-icon>
          {{ t('settings_labels.tools.configure_scene_scraper') }}
        </v-btn>

        <v-btn
          :disabled="!selectedVideoMediaType || sceneScraperStore.autoScrapeInProgress || allVideosCount === 0"
          color="primary"
          rounded
          variant="tonal"
          @click="confirmScrapeAllScenes"
        >
          <v-icon start>mdi-cloud-download</v-icon>
          {{ t('settings_labels.tools.scrape_all_scenes', { count: allVideosCount }) }}
        </v-btn>
      </div>

      <settings-switch
        :title="t('settings_labels.tools.scene_auto_apply')"
        :hint="t('settings_labels.tools.scene_auto_apply_hint')"
        option="sceneAutoApplyOnExactMatch"
        icon-text="flash-auto"
      />

      <settings-switch
        :title="t('settings_labels.tools.scene_import_markers')"
        :hint="t('settings_labels.tools.scene_import_markers_hint')"
        option="sceneScraperImportMarkers"
        icon-text="bookmark-multiple-outline"
        class="mt-2"
      />

      <v-autocomplete
        v-if="settingsStore.sceneScraperImportMarkers === '1'"
        v-model="selected_marker_meta"
        @update:model-value="onMarkerMetaSelected"
        :items="marker_meta_options"
        item-value="id"
        item-title="name"
        :label="t('settings_labels.tools.scene_marker_meta')"
        :placeholder="t('settings_labels.tools.select_marker_meta')"
        :hint="t('settings_labels.tools.scene_marker_meta_hint')"
        persistent-hint
        return-object
        variant="outlined"
        rounded
        clearable
        class="scraper-field mt-4"
      >
        <template #selection="{ item }">
          <v-icon start>mdi-{{ item.raw.icon || 'tag' }}</v-icon>
          <span>{{ item.raw.name }}</span>
        </template>
        <template #item="{ item, props }">
          <v-list-item v-bind="props">
            <template #title>
              <v-icon start>mdi-{{ item.raw.icon || 'tag' }}</v-icon>
              <span>{{ item.raw.name }}</span>
            </template>
          </v-list-item>
        </template>
      </v-autocomplete>
    </section>

    <v-divider class="mb-6"/>

    <section class="scraper-block mb-2">
      <div class="text-subtitle-1 font-weight-medium mb-1">
        {{ t('settings_labels.tools.performer_scraper') }}
      </div>
      <div class="text-body-2 text-medium-emphasis mb-4">
        {{ t('settings_labels.tools.data_scraper_hint') }}
      </div>

      <v-autocomplete
        v-model="selected_meta"
        @update:model-value="onPerformerMetaSelected"
        :items="meta_tags"
        item-value="id"
        item-title="name"
        :label="t('settings_labels.tools.performers_meta')"
        :placeholder="t('settings_labels.tools.select_meta')"
        return-object
        variant="outlined"
        rounded
        hide-details
        class="scraper-field mb-4"
      >
        <template #selection="{ item }">
          <v-icon start>mdi-{{ item.raw.icon }}</v-icon>
          <span>{{ item.raw.name }}</span>
        </template>
        <template #item="{ item, props }">
          <v-list-item v-bind="props">
            <template #title>
              <v-icon start>mdi-{{ item.raw.icon }}</v-icon>
              <span>{{ item.raw.name }}</span>
            </template>
          </v-list-item>
        </template>
      </v-autocomplete>

      <div class="d-flex flex-wrap ga-2">
        <v-btn
          :disabled="!selected_meta"
          color="primary"
          rounded
          variant="flat"
        >
          <DialogScraperConfig v-if="selected_meta" :meta="selected_meta"/>
          <v-icon start>mdi-tune</v-icon>
          {{ t('settings_labels.tools.configure_scraper') }}
        </v-btn>

        <v-btn
          :disabled="!selected_meta || scraperStore.autoScrapeInProgress || allTagsCount === 0"
          color="primary"
          rounded
          variant="tonal"
          @click="confirmScrapeAll"
        >
          <v-icon start>mdi-cloud-download</v-icon>
          {{ t('settings_labels.tools.scrape_all_tags', { count: allTagsCount }) }}
        </v-btn>
      </div>
    </section>
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
import {setOption} from '@/services/settingsService'
import {useEventBus} from "@/utils/eventBus"
import {useScraperStore} from "../stores/scraper"
import {useSceneScraperStore} from "../stores/sceneScraper"
import {useAutoScrapeBatch} from "../composables/useAutoScrapeBatch"
import {useAutoSceneScrapeBatch, getAllVideoMediaForType} from "../composables/useAutoSceneScrapeBatch"
import {openAdultOnboarding} from "@/composable/useAdultOnboarding"
import {getAllTagsForMeta} from "@/utils/resolveSelectedTags"
import {isVideoMediaType} from "@/utils/mediaType"
import type { Meta } from '@/types/stores'
import type { MediaType } from '@/types/media'

const DialogScraperConfig = defineAsyncComponent(() =>
  import("./DialogScraperConfig.vue")
)

const DialogSceneScraperConfig = defineAsyncComponent(() =>
  import("./DialogSceneScraperConfig.vue")
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
const selected_marker_meta = ref<Meta | undefined>(undefined)
const tpdbApiKey = ref('')
const showTpdbApiKey = ref(false)

function saveTpdbApiKey() {
  setOption(tpdbApiKey.value, 'tpdbApiKey')
}

const meta_tags = computed(() => {
  const metas = store.meta?.filter(i => i.type === "array") || []
  return sortBy(metas, "name")
})

const marker_meta_options = computed(() => {
  const metas = store.meta?.filter(i => i.marks && i.type === 'array') || []
  return sortBy(metas, 'name')
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

function syncSelectedMarkerMeta() {
  const markerMetaId = Number(settingsStore.sceneScraperMarkerMetaId)
  if (!markerMetaId) {
    selected_marker_meta.value = undefined
    return
  }

  selected_marker_meta.value = marker_meta_options.value.find(
    (item) => item.id === markerMetaId,
  ) || selected_marker_meta.value
}

function onMarkerMetaSelected(meta: Meta | null | undefined) {
  selected_marker_meta.value = meta || undefined
  setOption(meta?.id ? String(meta.id) : '', 'sceneScraperMarkerMetaId')
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
  tpdbApiKey.value = settingsStore.tpdbApiKey || ''
  selected_meta.value = meta_tags.value.find(i => i.scraper)
  selectedVideoMediaType.value = videoMediaTypes.value[0]
  syncSelectedMarkerMeta()
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

    syncSelectedMarkerMeta()
  },
  { deep: true },
)

watch(
  () => settingsStore.sceneScraperMarkerMetaId,
  () => {
    syncSelectedMarkerMeta()
  },
)
</script>

<style scoped>
.scraper-field {
  max-width: 36rem;
}
</style>
