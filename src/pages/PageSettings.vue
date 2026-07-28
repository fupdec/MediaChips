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
              <div id="settings-meta">
                <SettingsMeta/>
              </div>

              <div id="settings-media-types">
                <SettingsMediaTypes/>
              </div>

              <SettingsMetaAssignment/>

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
              <SettingsSection id="settings-bulk-paths">
                <SettingsBulkPathEditing/>
              </SettingsSection>

              <SettingsSection id="settings-folder-tags">
                <SettingsFolderTags/>
              </SettingsSection>

              <SettingsSection id="settings-watched-folders">
                <SettingsWatchedFolders/>
              </SettingsSection>
            </SettingsList>
          </div>

          <div v-else-if="tab === 'database'">
            <SettingsList>
              <SettingsGroupLabel :title="t('settings.groups.storage')"/>

              <SettingsSection id="settings-open-data-folder">
                <SettingsOpenDataFolder/>
              </SettingsSection>

              <SettingsSection id="settings-databases">
                <SettingsDatabases/>
              </SettingsSection>

              <SettingsGroupLabel :title="t('settings.groups.maintenance_backfill')"/>

              <SettingsSection>
                <SettingsBackfillTask :config="FINGERPRINT_BACKFILL"/>
                <v-divider class="mx-4 mb-2"/>
                <SettingsBackfillTask :config="VIDEO_CODEC_BACKFILL"/>
              </SettingsSection>

              <SettingsSection id="settings-find-missing-media">
                <SettingsFindMissingMedia/>
              </SettingsSection>

              <SettingsGroupLabel :title="t('settings.groups.maintenance_media')"/>

              <SettingsSection>
                <SettingsGenerateVideoImages/>
              </SettingsSection>

              <SettingsSection>
                <SettingsGenerateImageThumbs/>
              </SettingsSection>

              <SettingsGroupLabel :title="t('settings.groups.maintenance_faces')"/>

              <SettingsSection>
                <SettingsDetectFaces/>
              </SettingsSection>

              <SettingsGroupLabel :title="t('settings.groups.maintenance_cleanup')"/>

              <SettingsSection id="settings-clear-generated-images">
                <SettingsClearGeneratedImages/>
              </SettingsSection>
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
import {
  FINGERPRINT_BACKFILL,
  VIDEO_CODEC_BACKFILL,
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
const SettingsBackfillTask = defineAsyncComponent(() =>
  import("@/components/settings/database/SettingsBackfillTask.vue")
)
const SettingsFindMissingMedia = defineAsyncComponent(() =>
  import("@/components/settings/database/SettingsFindMissingMedia.vue")
)
const SettingsGenerateVideoImages = defineAsyncComponent(() =>
  import("@/components/settings/database/SettingsGenerateVideoImages.vue")
)
const SettingsGenerateImageThumbs = defineAsyncComponent(() =>
  import("@/components/settings/database/SettingsGenerateImageThumbs.vue")
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
  media_types: "settings-media-types",
  field_pinning: "settings-meta-assignment",
  quick_tags: "settings-quick-tags",
  parse_library_tags: "settings-parse-library-tags",
  bulk_paths: "settings-bulk-paths",
  folder_tags: "settings-folder-tags",
  watched_folders: "settings-watched-folders",
  open_data_folder: "settings-open-data-folder",
  databases: "settings-databases",
  generate_video_images: "settings-generate-video-images",
  generate_image_thumbs: "settings-generate-image-thumbs",
  detect_faces: "settings-detect-faces",
  video_codec_backfill: "settings-video-codec-backfill",
  oshash_backfill: "settings-fingerprint-backfill",
  fingerprint_backfill: "settings-fingerprint-backfill",
  content_hash_backfill: "settings-fingerprint-backfill",
  find_missing: "settings-find-missing-media",
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

function scrollToSettingsSection(sectionId: string, attempts = 12) {
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

const GENERAL_SECTIONS = new Set([
  "general_app",
  "locale",
  "login",
  "video_player",
  "video_preview",
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
  "media_types",
  "field_pinning",
  "quick_tags",
  "parse_library_tags",
])

const LIBRARY_ADVANCED_SECTIONS = new Set([
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
  "generate_video_images",
  "generate_image_thumbs",
  "detect_faces",
  "video_codec_backfill",
  "oshash_backfill",
  "fingerprint_backfill",
  "content_hash_backfill",
  "find_missing",
  "clear_generated",
  "backups",
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

  const sectionId = SETTINGS_SECTION_IDS[section]

  nextTick(() => {
    if (sectionId) {
      scrollToSettingsSection(sectionId)
    }
    applyingRoute.value = false
  })
}

function syncTabToRoute(nextTab: string) {
  const currentTab = resolveTab(String(route.query.tab || "general"))
  const currentSection = String(route.query.section || "")

  if (currentTab === nextTab && !currentSection) return

  const query: Record<string, string> = {tab: nextTab}

  router.replace({path: "/settings", query})
}

onMounted(applyRouteSettings)

watch(tab, (nextTab) => {
  const scrollContainer = getScrollContainer()
  if (scrollContainer) {
    scrollContainer.scrollTop = 0
  }
  if (applyingRoute.value) return
  syncTabToRoute(nextTab)
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
