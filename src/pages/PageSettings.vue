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
              <SettingsSection>
                <SettingsGeneral/>
              </SettingsSection>

              <SettingsSection>
                <SettingsLocale/>
              </SettingsSection>

              <SettingsSection>
                <SettingsLogin/>
              </SettingsSection>

              <SettingsGroupLabel :title="t('settings.groups.playback')"/>

              <SettingsSection>
                <SettingsVideoPlayer/>
              </SettingsSection>

              <SettingsSection>
                <SettingsVideoPreview/>
              </SettingsSection>
            </SettingsList>
          </div>

          <div v-else-if="tab === 'appearance'">
            <SettingsList>
              <SettingsSection padded>
                <SettingsAppearanceDarkMode/>
                <SettingsAppearanceZoom/>
              </SettingsSection>

              <SettingsSection padded>
                <SettingsAppearanceThemeColors/>
              </SettingsSection>

              <SettingsSection padded>
                <SettingsAppearanceCards/>
              </SettingsSection>

              <SettingsSection padded>
                <SettingsAppearancePage/>
              </SettingsSection>

              <SettingsSection>
                <SettingsSfwMode/>
              </SettingsSection>
            </SettingsList>
          </div>

          <div v-else-if="tab === 'library'">
            <SettingsList>
              <SettingsMeta/>

              <SettingsMediaTypes/>

              <SettingsMetaAssignment/>

              <SettingsSection>
                <SettingsDataScraper/>
              </SettingsSection>

              <SettingsSection>
                <SettingsQuickTags/>
              </SettingsSection>

              <SettingsSection>
                <SettingsParseLibraryTags/>
              </SettingsSection>
            </SettingsList>
          </div>

          <div v-else-if="tab === 'files'">
            <SettingsList>
              <SettingsSection>
                <SettingsBulkPathEditing/>
              </SettingsSection>

              <SettingsSection>
                <SettingsWatchedFolders/>
              </SettingsSection>
            </SettingsList>
          </div>

          <div v-else-if="tab === 'database'">
            <SettingsList>
              <SettingsGroupLabel :title="t('settings.groups.storage')"/>

              <SettingsSection>
                <SettingsOpenDataFolder/>
              </SettingsSection>

              <SettingsSection>
                <SettingsDatabases/>
              </SettingsSection>

              <SettingsGroupLabel :title="t('settings.groups.maintenance')"/>

              <SettingsSection>
                <SettingsContentHashBackfill/>
              </SettingsSection>

              <SettingsSection>
                <SettingsVideoCodecBackfill/>
              </SettingsSection>

              <SettingsSection>
                <SettingsFindMissingMedia/>
              </SettingsSection>

              <SettingsSection>
                <SettingsGenerateVideoImages/>
              </SettingsSection>

              <SettingsSection>
                <SettingsGenerateImageThumbs/>
              </SettingsSection>

              <SettingsSection>
                <SettingsClearGeneratedImages/>
              </SettingsSection>
            </SettingsList>
          </div>

          <div v-else-if="tab === 'about'">
            <SettingsList>
              <SettingsSection>
                <SettingsRegistration/>
              </SettingsSection>

              <SettingsSection>
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
import {computed, ref, onMounted, watch, nextTick, defineAsyncComponent} from "vue"
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

const SettingsWatchedFolders = defineAsyncComponent(() =>
  import("@/components/settings/tools/SettingsWatchedFolders.vue")
)
const SettingsBulkPathEditing = defineAsyncComponent(() =>
  import("@/components/settings/files/SettingsBulkPathEditing.vue")
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
const SettingsDataScraper = defineAsyncComponent(() =>
  import("@/components/settings/library/SettingsDataScraper.vue")
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
const SettingsClearGeneratedImages = defineAsyncComponent(() =>
  import("@/components/settings/database/SettingsClearGeneratedImages.vue")
)
const SettingsGenerateVideoImages = defineAsyncComponent(() =>
  import("@/components/settings/database/SettingsGenerateVideoImages.vue")
)
const SettingsGenerateImageThumbs = defineAsyncComponent(() =>
  import("@/components/settings/database/SettingsGenerateImageThumbs.vue")
)
const SettingsContentHashBackfill = defineAsyncComponent(() =>
  import("@/components/settings/database/SettingsContentHashBackfill.vue")
)
const SettingsVideoCodecBackfill = defineAsyncComponent(() =>
  import("@/components/settings/database/SettingsVideoCodecBackfill.vue")
)
const SettingsFindMissingMedia = defineAsyncComponent(() =>
  import("@/components/settings/database/SettingsFindMissingMedia.vue")
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
const About = defineAsyncComponent(() =>
  import("@/components/app/About.vue")
)

const TAB_ALIASES: Record<string, string> = {
  tools: "general",
  meta: "library",
  media: "library",
  assignment: "library",
  video: "general",
}

const NAV_ITEMS: SettingsNavItem[] = [
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
    value: "about",
    icon: "mdi-information-variant",
    labelKey: "settings.tabs.about",
    descKey: "settings.tabs_desc.about",
    docId: "settings-doc-tab-about",
  },
]

const tab = ref("general")
const contentRef = ref<HTMLElement | null>(null)
const applyingRoute = ref(false)
const route = useRoute()
const router = useRouter()
const {t} = useI18n()

const navItems = NAV_ITEMS

const activeNavItem = computed(() => {
  const item = NAV_ITEMS.find(entry => entry.value === tab.value) || NAV_ITEMS[0]
  return {
    label: t(item.labelKey),
    description: t(item.descKey),
    icon: item.icon,
  }
})

const SETTINGS_SECTION_IDS: Record<string, string> = {
  generate_video_images: "settings-generate-video-images",
  generate_image_thumbs: "settings-generate-image-thumbs",
  video_codec_backfill: "settings-video-codec-backfill",
  field_pinning: "settings-meta-assignment",
  video_preview: "video_preview",
  backups: "database_backups",
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

function applyRouteSettings() {
  applyingRoute.value = true

  const section = String(route.query.section || "")

  if (
    section === "generate_video_images"
    || section === "generate_image_thumbs"
    || section === "video_codec_backfill"
    || section === "backups"
  ) {
    tab.value = "database"
  } else if (section === "field_pinning") {
    tab.value = "library"
  } else if (section === "video_preview") {
    tab.value = "general"
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
