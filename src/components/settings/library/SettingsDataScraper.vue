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
      :title="t('settings_labels.tools.data_scraper')"
      :hint="t('settings_labels.tools.data_scraper_hint')"
      option="showAdultContent"
      id="data_scraper_checkbox"
    />

    <div v-if="settingsStore.showAdultContent == '1'">
      <v-row>
        <v-col cols="12" sm="6">
          <v-autocomplete
            :model-value="selected_meta"
            @update:model-value="updateSettings"
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
            v-if="selected_meta"
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
    </div>
  </div>
</template>

<script setup lang="ts">
import {ref, computed, onMounted, defineAsyncComponent} from "vue"
import {useI18n} from "vue-i18n"
import {useAppStore} from "@/stores/app"
import {useSettingsStore} from "@/stores/settings"
import {typedApi} from "@/services/typedApi"
import sortBy from 'lodash/sortBy'
import ButtonDocumentation from "@/components/ui/ButtonDocumentation.vue"
import SettingsCategoryDivider from "@/components/ui/SettingsCategoryDivider.vue"
import SettingsSwitch from "@/components/ui/SettingsSwitch.vue"
import {useEventBus} from "@/utils/eventBus"
import {useScraperStore} from "@/stores/scraper"
import {useAutoScrapeBatch} from "@/composable/useAutoScrapeBatch"
import {getAllTagsForMeta} from "@/utils/resolveSelectedTags"
import type {Meta} from "@/types/stores"

const DialogScraperConfig = defineAsyncComponent(() =>
  import("@/components/dialogs/DialogScraperConfig.vue")
)

const store = useAppStore()
const settingsStore = useSettingsStore()
const scraperStore = useScraperStore()
const { runForAll } = useAutoScrapeBatch()
const eventBus = useEventBus()
const {t} = useI18n()

const selected_meta = ref<Meta | undefined>(undefined)

const meta_tags = computed(() => {
  const metas = store.meta?.filter(i => i.type === "array") || []
  return sortBy(metas, "name")
})

const allTagsCount = computed(() => {
  if (!selected_meta.value) return 0
  return getAllTagsForMeta(selected_meta.value.id).length
})

async function confirmScrapeAll() {
  if (!selected_meta.value || allTagsCount.value === 0) return

  const confirmed = window.confirm(
    t('settings_labels.tools.scrape_all_tags_confirm', { count: allTagsCount.value }),
  )
  if (!confirmed) return

  await runForAll(selected_meta.value)
}

async function updateSettings(meta: Meta | null | undefined) {
  if (!meta) return

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

onMounted(() => {
  selected_meta.value = meta_tags.value.find(i => i.scraper)
})
</script>
