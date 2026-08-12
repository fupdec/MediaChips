<template>
  <div class="settings-page">
    <div class="settings-page-layout">
      <aside class="settings-page-layout__sidebar">
        <SettingsNav
          v-model="tab"
          :items="navItems"
        />
      </aside>

      <div ref="contentRef" class="settings-page-layout__content">
        <v-container max-width="960" class="settings-page-layout__container">
          <SettingsTabHeader
            :title="activeNavItem.label"
            :description="activeNavItem.description"
            :icon="activeNavItem.icon"
          />

          <div v-if="tab === 'general'">
            <SettingsList>
              <SettingsSection id="settings-general">
                <SettingsGeneral/>
              </SettingsSection>

              <SettingsSection id="settings-locale">
                <SettingsLocale/>
              </SettingsSection>

              <SettingsSection id="settings-login">
                <SettingsLogin/>
              </SettingsSection>

              <SettingsGroupLabel :title="t('settings.groups.playback')"/>

              <SettingsSection id="settings-video-player">
                <SettingsVideoPlayer/>
              </SettingsSection>

              <SettingsSection id="settings-video-preview">
                <SettingsVideoPreview/>
              </SettingsSection>

              <template v-if="LOCAL_AI_UI_ENABLED">
                <SettingsGroupLabel :title="t('settings.groups.local_ai')"/>
                <SettingsLocalAi/>
              </template>
            </SettingsList>
          </div>

          <div v-else-if="tab === 'appearance'">
            <SettingsList>
              <SettingsSection id="settings-appearance-theme" padded>
                <SettingsAppearanceDarkMode/>
                <SettingsAppearanceZoom/>
              </SettingsSection>

              <SettingsSection id="settings-appearance-colors" padded>
                <SettingsAppearanceThemeColors/>
              </SettingsSection>

              <SettingsSection id="settings-appearance-cards" padded>
                <SettingsAppearanceCards/>
              </SettingsSection>

              <SettingsSection id="settings-appearance-page" padded>
                <SettingsAppearancePage/>
              </SettingsSection>

              <SettingsSection id="settings-appearance-sfw">
                <SettingsSfwMode/>
              </SettingsSection>
            </SettingsList>
          </div>

          <div v-else-if="tab === 'library'">
            <SettingsList>
              <SettingsSection id="settings-tag-categories">
                <SettingsTagCategories/>
              </SettingsSection>

              <SettingsSection id="settings-meta">
                <SettingsMeta/>
              </SettingsSection>

              <SettingsSection id="settings-media-types">
                <SettingsMediaTypes/>
              </SettingsSection>

              <SettingsSection id="settings-chip-recipes">
                <SettingsChipRecipes/>
              </SettingsSection>

              <v-switch
                id="settings-library-advanced"
                v-model="libraryAdvanced"
                color="primary"
                class="mt-0 mb-2 settings-library-advanced-switch"
                inset
                hide-details
              >
                <template #label>
                  <div class="d-flex flex-column ml-4">
                    <div class="text-body-1 text-high-emphasis">
                      {{ t('settings.groups.advanced') }}
                    </div>
                  </div>
                </template>
              </v-switch>

              <template v-if="libraryAdvanced">
                <SettingsMetaAssignment/>

                <SettingsSection id="settings-quick-tags-section">
                  <SettingsQuickTags/>
                </SettingsSection>

                <SettingsSection id="settings-parse-library-tags">
                  <SettingsParseLibraryTags/>
                </SettingsSection>
              </template>
            </SettingsList>
          </div>

          <div v-else-if="isPluginOwnedTab(tab)">
            <SettingsList>
              <SettingsSection
                v-for="panel in panelsForActiveTab"
                :key="`${panel.pluginId}:${panel.componentKey}`"
                :id="panel.sectionId"
              >
                <component :is="resolvePanelComponent(panel.componentKey)"/>
              </SettingsSection>
            </SettingsList>
          </div>

          <div v-else-if="tab === 'files'">
            <SettingsList>
              <SettingsSection id="settings-watched-folders">
                <SettingsWatchedFolders/>
              </SettingsSection>

              <SettingsSection id="settings-bulk-paths">
                <SettingsBulkPathEditing/>
              </SettingsSection>

              <SettingsSection id="settings-folder-tags">
                <SettingsFolderTags/>
              </SettingsSection>
            </SettingsList>
          </div>

          <div v-else-if="tab === 'database'">
            <SettingsList>
              <SettingsGroupLabel :title="t('settings.groups.storage')"/>

              <SettingsSection id="settings-databases">
                <SettingsDatabases/>
              </SettingsSection>

              <SettingsSection id="settings-open-data-folder">
                <SettingsOpenDataFolder/>
              </SettingsSection>

              <SettingsGroupLabel
                :title="t('settings.groups.maintenance_health')"
                icon="heart-pulse"
                accent
              />

              <SettingsLibraryHealthGuide/>

              <SettingsGroupLabel
                :title="t('settings.groups.maintenance_media')"
                icon="image-multiple-outline"
                accent
              />

              <SettingsGenerateVideoImages/>

              <SettingsGenerateImageThumbs/>

              <SettingsGroupLabel
                :title="t('settings.groups.maintenance_backfill')"
                icon="database-sync-outline"
                accent
              />

              <SettingsBackfillTask :config="FINGERPRINT_BACKFILL" :step="2"/>

              <SettingsBackfillTask :config="VISUAL_HASH_BACKFILL"/>

              <SettingsBackfillTask :config="VIDEO_CODEC_BACKFILL" :step="3"/>

              <SettingsBackfillTask :config="MEDIA_CREATED_BACKFILL"/>

              <SettingsBackfillTask :config="CLIP_EMBEDDING_BACKFILL" :step="4"/>

              <SettingsGroupLabel
                :title="t('settings.groups.maintenance_faces')"
                icon="face-recognition"
                accent
              />

              <SettingsDetectFaces/>

              <SettingsGroupLabel
                :title="t('settings.groups.maintenance_cleanup')"
                icon="broom"
                accent
              />

              <SettingsFindDuplicates/>

              <SettingsTagImageAiUpscale/>

              <SettingsFindMissingMedia/>

              <SettingsGenerateAutoChapters/>

              <SettingsClearGeneratedImages/>
            </SettingsList>
          </div>

          <div v-else-if="tab === 'plugins'">
            <SettingsList>
              <SettingsSection id="settings-plugins">
                <SettingsPlugins/>
              </SettingsSection>

              <SettingsSection
                v-for="panel in panelsForActiveTab"
                :key="`${panel.pluginId}:${panel.componentKey}`"
                :id="panel.sectionId"
              >
                <component :is="resolvePanelComponent(panel.componentKey)"/>
              </SettingsSection>
            </SettingsList>
          </div>

          <div v-else-if="tab === 'about'">
            <SettingsList>
              <SettingsSection id="settings-registration">
                <SettingsRegistration/>
              </SettingsSection>

              <SettingsSection id="settings-about">
                <About/>
              </SettingsSection>
            </SettingsList>
          </div>
        </v-container>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed, ref, onMounted, watch, nextTick, defineAsyncComponent, type Component} from "vue"
import {useRoute, useRouter} from "vue-router"
import {useI18n} from "vue-i18n"
import SettingsList from "@/components/ui/SettingsList.vue"
import SettingsSection from "@/components/ui/SettingsSection.vue"
import SettingsNav, {type SettingsNavItem} from "@/components/settings/SettingsNav.vue"
import SettingsTabHeader from "@/components/settings/SettingsTabHeader.vue"
import SettingsGroupLabel from "@/components/settings/SettingsGroupLabel.vue"
import SettingsAppearanceThemeColors
  from "@/components/settings/appearance/SettingsAppearanceThemeColors.vue"
import SettingsAppearanceCards
  from "@/components/settings/appearance/SettingsAppearanceCards.vue"
import SettingsAppearanceDarkMode
  from "@/components/settings/appearance/SettingsAppearanceDarkMode.vue"
import SettingsAppearanceZoom
  from "@/components/settings/appearance/SettingsAppearanceZoom.vue"
import SettingsAppearancePage
  from "@/components/settings/appearance/SettingsAppearancePage.vue"
import SettingsSfwMode
  from "@/components/settings/appearance/SettingsSfwMode.vue"
import {usePluginsStore} from "@/stores/plugins"
import {resolvePluginComponentLoader} from "@/services/pluginHost"
import {LOCAL_AI_UI_ENABLED} from "@shared/features"
import {
  FINGERPRINT_BACKFILL,
  VISUAL_HASH_BACKFILL,
  CLIP_EMBEDDING_BACKFILL,
  VIDEO_CODEC_BACKFILL,
  MEDIA_CREATED_BACKFILL,
} from "@/composable/useSettingsBackfillStream"

const SettingsWatchedFolders = defineAsyncComponent(() =>
  import("@/components/settings/tools/SettingsWatchedFolders.vue")
)
const SettingsBulkPathEditing = defineAsyncComponent(() =>
  import("@/components/settings/files/SettingsBulkPathEditing.vue")
)
const SettingsFolderTags = defineAsyncComponent(() =>
  import("@/components/settings/files/SettingsFolderTags.vue")
)
const SettingsMeta = defineAsyncComponent(() =>
  import("@/components/settings/SettingsMeta.vue")
)
const SettingsMetaAssignment = defineAsyncComponent(() =>
  import("@/components/settings/SettingsMetaAssignment.vue")
)
const SettingsMediaTypes = defineAsyncComponent(() =>
  import("@/components/settings/SettingsMediaTypes.vue")
)
const SettingsTagCategories = defineAsyncComponent(() =>
  import("@/components/settings/library/SettingsTagCategories.vue")
)
const SettingsChipRecipes = defineAsyncComponent(() =>
  import("@/components/settings/library/SettingsChipRecipes.vue")
)
const SettingsQuickTags = defineAsyncComponent(() =>
  import("@/components/settings/library/SettingsQuickTags.vue")
)
const SettingsParseLibraryTags = defineAsyncComponent(() =>
  import("@/components/settings/library/SettingsParseLibraryTags.vue")
)
const SettingsVideoPreview = defineAsyncComponent(() =>
  import("@/components/settings/tools/SettingsVideoPreview.vue")
)
const SettingsVideoPlayer = defineAsyncComponent(() =>
  import("@/components/settings/general/SettingsVideoPlayer.vue")
)
const SettingsLogin = defineAsyncComponent(() =>
  import("@/components/settings/general/SettingsLogin.vue")
)
const SettingsOpenDataFolder = defineAsyncComponent(() =>
  import("@/components/settings/database/SettingsOpenDataFolder.vue")
)
const SettingsDatabases = defineAsyncComponent(() =>
  import("@/components/settings/database/SettingsDatabases.vue")
)
const SettingsLibraryHealthGuide = defineAsyncComponent(() =>
  import("@/components/settings/database/SettingsLibraryHealthGuide.vue")
)
const SettingsBackfillTask = defineAsyncComponent(() =>
  import("@/components/settings/database/SettingsBackfillTask.vue")
)
const SettingsFindMissingMedia = defineAsyncComponent(() =>
  import("@/components/settings/database/SettingsFindMissingMedia.vue")
)
const SettingsFindDuplicates = defineAsyncComponent(() =>
  import("@/components/settings/database/SettingsFindDuplicates.vue")
)
const SettingsGenerateVideoImages = defineAsyncComponent(() =>
  import("@/components/settings/database/SettingsGenerateVideoImages.vue")
)
const SettingsGenerateAutoChapters = defineAsyncComponent(() =>
  import("@/components/settings/database/SettingsGenerateAutoChapters.vue")
)
const SettingsGenerateImageThumbs = defineAsyncComponent(() =>
  import("@/components/settings/database/SettingsGenerateImageThumbs.vue")
)
const SettingsTagImageAiUpscale = defineAsyncComponent(() =>
  import("@/components/settings/database/SettingsTagImageAiUpscale.vue")
)
const SettingsLocalAi = defineAsyncComponent(() =>
  import("@/components/settings/general/SettingsLocalAi.vue")
)
const SettingsDetectFaces = defineAsyncComponent(() =>
  import("@/components/settings/database/SettingsDetectFaces.vue")
)
const SettingsClearGeneratedImages = defineAsyncComponent(() =>
  import("@/components/settings/database/SettingsClearGeneratedImages.vue")
)
const SettingsGeneral = defineAsyncComponent(() =>
  import("@/components/settings/general/SettingsGeneral.vue")
)
const SettingsLocale = defineAsyncComponent(() =>
  import("@/components/settings/general/SettingsLocale.vue")
)
const SettingsRegistration = defineAsyncComponent(() =>
  import("@/components/settings/about/SettingsRegistration.vue")
)
const SettingsPlugins = defineAsyncComponent(() =>
  import("@/components/settings/plugins/SettingsPlugins.vue")
)
const About = defineAsyncComponent(() =>
  import("@/components/app/About.vue")
)

const TAB_ALIASES: Record<string, string> = {
  tools: "general",
  meta: "library",
  media: "library",
  assignment: "library",
  video: "general",
  // Legacy: scraper lived under Library before the adult plugin tab.
  data_scraper: "adult",
}

const CORE_NAV_ITEMS: SettingsNavItem[] = [
  {
    value: "general",
    icon: "mdi-application-cog-outline",
    labelKey: "settings.tabs.general",
    descKey: "settings.tabs_desc.general",
    docId: "settings-doc-tab-general",
  },
  {
    value: "appearance",
    icon: "mdi-brush-variant",
    labelKey: "settings.tabs.appearance",
    descKey: "settings.tabs_desc.appearance",
    docId: "settings-doc-tab-appearance",
  },
  {
    value: "library",
    icon: "mdi-bookshelf",
    labelKey: "settings.tabs.library",
    descKey: "settings.tabs_desc.library",
    docId: "settings-doc-tab-library",
  },
  {
    value: "files",
    icon: "mdi-folder-cog-outline",
    labelKey: "settings.tabs.files",
    descKey: "settings.tabs_desc.files",
    docId: "settings-doc-tab-files",
  },
  {
    value: "database",
    icon: "mdi-database-outline",
    labelKey: "settings.tabs.database",
    descKey: "settings.tabs_desc.database",
    docId: "settings-doc-tab-database",
  },
  {
    value: "plugins",
    icon: "mdi-puzzle-outline",
    labelKey: "settings.tabs.plugins",
    descKey: "settings.tabs_desc.plugins",
    docId: "settings-doc-tab-plugins",
  },
  {
    value: "about",
    icon: "mdi-information-variant",
    labelKey: "settings.tabs.about",
    descKey: "settings.tabs_desc.about",
    docId: "settings-doc-tab-about",
  },
]

const pluginComponentCache = new Map<string, Component>()

const tab = ref("general")
const contentRef = ref<HTMLElement | null>(null)
const applyingRoute = ref(false)
const libraryAdvanced = ref(false)
const route = useRoute()
const router = useRouter()
const {t} = useI18n()
const pluginsStore = usePluginsStore()

const pluginNavItems = computed((): SettingsNavItem[] => {
  void pluginsStore.revision
  return pluginsStore.settingsNav.map((item) => ({
    value: item.value,
    icon: item.icon,
    labelKey: item.labelKey,
    descKey: item.descKey,
    docId: item.docId,
  }))
})

const navItems = computed((): SettingsNavItem[] => {
  const items = [...CORE_NAV_ITEMS]
  const insertAt = items.findIndex((item) => item.value === 'plugins')
  const pluginItems = pluginNavItems.value
  if (insertAt >= 0) {
    items.splice(insertAt, 0, ...pluginItems)
  } else {
    items.push(...pluginItems)
  }
  return items
})

const panelsForActiveTab = computed(() => {
  void pluginsStore.revision
  return pluginsStore.settingsPanels.filter((panel) => panel.tab === tab.value)
})

function isPluginOwnedTab(tabValue: string): boolean {
  return pluginNavItems.value.some((item) => item.value === tabValue)
}

function resolvePanelComponent(componentKey: string): Component | null {
  const cached = pluginComponentCache.get(componentKey)
  if (cached) return cached

  const loader = resolvePluginComponentLoader(componentKey)
  if (!loader) return null

  const asyncComponent = defineAsyncComponent(loader)
  pluginComponentCache.set(componentKey, asyncComponent)
  return asyncComponent
}

const activeNavItem = computed(() => {
  const item = navItems.value.find(entry => entry.value === tab.value) || navItems.value[0]
  return {
    label: t(item.labelKey),
    description: t(item.descKey),
    icon: item.icon,
  }
})

watch(
  () => pluginsStore.revision,
  () => {
    if (!navItems.value.some((item) => item.value === tab.value)) {
      tab.value = 'general'
    }
  },
)

const SETTINGS_SECTION_IDS: Record<string, string> = {
  general_app: "settings-general",
  locale: "settings-locale",
  login: "settings-login",
  video_player: "settings-video-player",
  video_preview: "video_preview",
  appearance_theme: "settings-appearance-theme",
  appearance_colors: "settings-appearance-colors",
  appearance_cards: "settings-appearance-cards",
  appearance_page: "settings-appearance-page",
  appearance_sfw: "settings-appearance-sfw",
  meta: "settings-meta",
  tag_categories: "settings-tag-categories",
  chip_recipes: "settings-chip-recipes",
  media_types: "settings-media-types",
  field_pinning: "settings-meta-assignment",
  quick_tags: "settings-quick-tags",
  parse_library_tags: "settings-parse-library-tags",
  bulk_paths: "settings-bulk-paths",
  folder_tags: "settings-folder-tags",
  watched_folders: "settings-watched-folders",
  open_data_folder: "settings-open-data-folder",
  databases: "settings-databases",
  library_health_guide: "settings-library-health-guide",
  generate_video_images: "settings-generate-video-images",
  generate_auto_chapters: "settings-generate-auto-chapters",
  generate_image_thumbs: "settings-generate-image-thumbs",
  tag_image_ai_upscale: "settings-tag-image-ai-upscale",
  local_ai: "settings-local-ai",
  detect_faces: "settings-detect-faces",
  video_codec_backfill: "settings-video-codec-backfill",
  media_created_backfill: "settings-media-created-backfill",
  oshash_backfill: "settings-fingerprint-backfill",
  fingerprint_backfill: "settings-fingerprint-backfill",
  visual_hash_backfill: "settings-visual-hash-backfill",
  clip_embedding_backfill: "settings-clip-embedding-backfill",
  content_hash_backfill: "settings-fingerprint-backfill",
  find_missing: "settings-find-missing-media",
  find_duplicates: "settings-find-duplicates",
  clear_generated: "settings-clear-generated-images",
  backups: "database_backups",
  database_add: "database_add",
  plugins_list: "settings-plugins",
  adult_scraper: "settings-adult-scraper",
  registration: "settings-registration",
  about: "settings-about",
}

function resolveTab(routeTab: string) {
  return TAB_ALIASES[routeTab] || routeTab
}

function getScrollContainer(): HTMLElement | null {
  if (!contentRef.value) return null

  const contentStyle = getComputedStyle(contentRef.value)
  if (contentStyle.overflowY === 'auto' || contentStyle.overflowY === 'scroll') {
    return contentRef.value
  }

  return contentRef.value.closest('.main-scroll') as HTMLElement | null
}

function scrollToSettingsSection(sectionId: string, attempts = 24) {
  const scrollContainer = getScrollContainer()
  const element = document.getElementById(sectionId)
  if (scrollContainer && element) {
    const top = element.getBoundingClientRect().top
      - scrollContainer.getBoundingClientRect().top
      + scrollContainer.scrollTop

    scrollContainer.scrollTo({
      top: Math.max(0, top - 8),
      behavior: "smooth",
    })
    return
  }

  if (attempts <= 0) return

  requestAnimationFrame(() => {
    scrollToSettingsSection(sectionId, attempts - 1)
  })
}

function scheduleScrollToSection(sectionId: string) {
  // Advanced library sections mount behind v-if; wait for layout after expand.
  nextTick(() => {
    nextTick(() => {
      scrollToSettingsSection(sectionId)
    })
  })
}

const GENERAL_SECTIONS = new Set([
  "general_app",
  "locale",
  "login",
  "video_player",
  "video_preview",
  ...(LOCAL_AI_UI_ENABLED ? ["local_ai"] as const : []),
])

const APPEARANCE_SECTIONS = new Set([
  "appearance_theme",
  "appearance_colors",
  "appearance_cards",
  "appearance_page",
  "appearance_sfw",
])

const LIBRARY_SECTIONS = new Set([
  "meta",
  "tag_categories",
  "chip_recipes",
  "media_types",
  "field_pinning",
  "quick_tags",
  "parse_library_tags",
])

const LIBRARY_ADVANCED_SECTIONS = new Set([
  "field_pinning",
  "quick_tags",
  "parse_library_tags",
])

const FILES_SECTIONS = new Set([
  "bulk_paths",
  "folder_tags",
  "watched_folders",
])

const DATABASE_SECTIONS = new Set([
  "open_data_folder",
  "databases",
  "database_add",
  "library_health_guide",
  "generate_video_images",
  "generate_auto_chapters",
  "generate_image_thumbs",
  "detect_faces",
  "video_codec_backfill",
  "media_created_backfill",
  "oshash_backfill",
  "fingerprint_backfill",
  "visual_hash_backfill",
  "clip_embedding_backfill",
  "content_hash_backfill",
  "find_missing",
  "find_duplicates",
  "clear_generated",
  "backups",
  "tag_image_ai_upscale",
])

const PLUGINS_SECTIONS = new Set([
  "plugins_list",
  "adult_scraper",
])

const ABOUT_SECTIONS = new Set([
  "registration",
  "about",
])

function applyRouteSettings() {
  applyingRoute.value = true

  const section = String(route.query.section || "")

  if (GENERAL_SECTIONS.has(section)) {
    tab.value = "general"
  } else if (APPEARANCE_SECTIONS.has(section)) {
    tab.value = "appearance"
  } else if (LIBRARY_SECTIONS.has(section)) {
    tab.value = "library"
    if (LIBRARY_ADVANCED_SECTIONS.has(section)) {
      libraryAdvanced.value = true
    }
  } else if (FILES_SECTIONS.has(section)) {
    tab.value = "files"
  } else if (DATABASE_SECTIONS.has(section)) {
    tab.value = "database"
  } else if (PLUGINS_SECTIONS.has(section)) {
    tab.value = "plugins"
  } else if (ABOUT_SECTIONS.has(section)) {
    tab.value = "about"
  } else if (route.query.tab) {
    tab.value = resolveTab(String(route.query.tab))
  }

  // Deep-links into field pinning may use view/mediaTypeId/metaId without section
  if (
    resolveTab(String(route.query.tab || tab.value)) === "library"
    && (route.query.view === "media" || route.query.view === "tags"
      || route.query.mediaTypeId || route.query.metaId)
  ) {
    libraryAdvanced.value = true
  }

  const sectionId = SETTINGS_SECTION_IDS[section]

  nextTick(() => {
    if (sectionId) {
      scheduleScrollToSection(sectionId)
    }
    applyingRoute.value = false
  })
}

function syncTabToRoute(nextTab: string) {
  const currentTab = resolveTab(String(route.query.tab || "general"))

  // Same tab: keep current query (including section deep-links).
  if (currentTab === nextTab) return

  router.replace({path: "/settings", query: {tab: nextTab}})
}

onMounted(applyRouteSettings)

watch(tab, (nextTab) => {
  if (!applyingRoute.value) {
    const scrollContainer = getScrollContainer()
    if (scrollContainer) {
      scrollContainer.scrollTop = 0
    }
    syncTabToRoute(nextTab)
    return
  }
})

watch(() => route.fullPath, applyRouteSettings)
</script>

<style scoped>
.settings-library-advanced-switch :deep(.v-label) {
  opacity: 1;
}

.settings-page {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  box-sizing: border-box;
}

.settings-page-layout {
  display: flex;
  align-items: stretch;
  flex: 1 1 auto;
  gap: 28px;
  width: 100%;
  min-height: 0;
  max-width: 1180px;
  margin-inline: auto;
  padding: 12px 20px 0;
  overflow: hidden;
  box-sizing: border-box;
}

.settings-page-layout__sidebar {
  flex: 0 0 248px;
  min-height: 0;
  overflow-y: auto;
  padding-top: 4px;
}

.settings-page-layout__content {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.settings-page-layout__container {
  width: 100%;
  padding-inline: 0;
  padding-bottom: 24px;
}

@media (max-width: 959px) {
  .settings-page {
    flex: none;
    min-height: auto;
    overflow: visible;
  }

  .settings-page-layout {
    flex-direction: column;
    gap: 12px;
    height: auto;
    overflow: visible;
    padding: 8px 12px 0;
  }

  .settings-page-layout__sidebar {
    flex: none;
    width: 100%;
    overflow: visible;
    padding-top: 0;
  }

  .settings-page-layout__content {
    overflow: visible;
  }
}
</style>
