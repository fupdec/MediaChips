<template>
  <div class="settings-page settings-page--styled-sections" :class="{'settings-page--maintenance': tab === 'maintenance'}">
    <div class="settings-page-layout">
      <aside class="settings-page-layout__sidebar">
        <SettingsSearch :items="searchItems" @select="openSearchResult"/>
        <SettingsNav
          v-model="tab"
          :items="navItems"
          class="settings-page-layout__nav"
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
              <SettingsSection id="settings-locale">
                <SettingsLocale/>
              </SettingsSection>
              <SettingsSection id="settings-behavior">
                <SettingsGeneral/>
              </SettingsSection>
              <SettingsSection id="settings-filtering"><SettingsFilterBehavior/></SettingsSection>
              <SettingsGroupLabel :title="t('settingsLayout.security')" icon="shield-lock-outline" accent/>
              <SettingsSection id="settings-network"><div id="settings-general"><SettingsNetwork/></div></SettingsSection>
              <SettingsSection id="settings-login">
                <SettingsLogin/>
              </SettingsSection>
              <SettingsSection id="settings-appearance-sfw">
                <SettingsSfwMode/>
              </SettingsSection>
            </SettingsList>
          </div>

          <div v-else-if="tab === 'appearance'">
            <SettingsList>
              <SettingsSection id="settings-appearance-theme" padded>
                <SettingsAppearanceDarkMode>
                  <SettingsAppearanceZoom/>
                </SettingsAppearanceDarkMode>
              </SettingsSection>
              <SettingsSection id="settings-appearance-colors" padded>
                <SettingsAppearanceThemeColors/>
              </SettingsSection>
              <SettingsSection id="settings-appearance-navigation"><SettingsAppearanceNavigation/></SettingsSection>
              <SettingsGroupLabel :title="t('settings_labels.appearance.cards')" icon="view-grid-outline" accent/>
              <SettingsSection id="settings-appearance-cards" padded>
                <SettingsAppearanceCards/>
              </SettingsSection>
              <SettingsGroupLabel :title="t('settings_labels.appearance.page')" icon="page-layout-body" accent/>
              <SettingsSection id="settings-appearance-page" padded>
                <SettingsAppearancePage/>
              </SettingsSection>
              <SettingsSection id="settings-image-grid"><SettingsImageGrid/></SettingsSection>
            </SettingsList>
          </div>

          <div v-else-if="tab === 'viewing'">
            <SettingsList>
              <SettingsSection id="settings-video-player">
                <SettingsVideoPlayer/>
              </SettingsSection>
              <SettingsSection id="settings-video-preview">
                <SettingsVideoPreview/>
              </SettingsSection>
              <SettingsSection id="settings-appearance-image-viewer">
                <SettingsAppearanceImageViewer/>
              </SettingsSection>
            </SettingsList>
          </div>

          <div v-else-if="tab === 'library'">
            <SettingsList>
              <SettingsMetaAssignment/>
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
              <SettingsSection id="settings-quick-tags-section">
                <SettingsQuickTags/>
              </SettingsSection>
              <SettingsSection id="settings-parse-library-tags">
                <SettingsParseLibraryTags/>
              </SettingsSection>
              <SettingsSection id="settings-folder-tags">
                <SettingsFolderTags/>
              </SettingsSection>
            </SettingsList>
          </div>

          <div v-else-if="tab === 'connections'">
            <SettingsList>
              <SettingsSection id="settings-watched-folders">
                <SettingsWatchedFolders/>
              </SettingsSection>
              <SettingsSection id="settings-sources">
                <SettingsCategoryDivider :title="t('sources.title')" icon="server-network-outline"/>
                <SourcesPanel/>
              </SettingsSection>
              <SettingsSection id="settings-metadata-transfer">
                <SettingsCategoryDivider :title="t('metadata_transfer.title')" icon="swap-horizontal"/>
                <div class="d-flex align-center flex-wrap ga-2">
                  <DialogMetadataTransfer>
                    <template #activator="{open}">
                      <v-btn prepend-icon="mdi-swap-horizontal" variant="tonal" @click="open">{{ t('metadata_transfer.open') }}</v-btn>
                    </template>
                  </DialogMetadataTransfer>
                  <ButtonDocumentation id="settings.files.metadata_transfer"/>
                </div>
              </SettingsSection>
            </SettingsList>
          </div>

          <div v-else-if="tab === 'processing'">
            <SettingsList>
              <SettingsGenerateAutoChapters/>
              <SettingsLocalAi v-if="LOCAL_AI_UI_ENABLED"/>
              <SettingsSection id="settings-marker-moments">
                <div class="mx-4">
                  <SettingsCategoryDivider :title="t('marker_moments.title')" icon="image-search-outline"/>
                  <v-switch
                    v-model="markerMomentsEnabled"
                    :label="t('marker_moments.enable')"
                    :hint="t('marker_moments.settings_hint')"
                    persistent-hint
                    color="primary"
                    inset
                  />
                  <v-switch
                    v-model="markerMomentsAutoRefresh"
                    :label="t('marker_moments.auto_refresh')"
                    :disabled="!markerMomentsEnabled"
                    color="primary"
                    inset
                    hide-details
                  />
                </div>
              </SettingsSection>
            </SettingsList>
          </div>

          <SettingsMaintenance
            v-else-if="tab === 'maintenance'"
            :section-id="maintenanceSection"
            @navigate="scrollSettingsToTop"
          />

          <div v-else-if="tab === 'database'">
            <SettingsList>
              <SettingsSection id="settings-databases">
                <SettingsDatabases/>
              </SettingsSection>
              <SettingsSection id="settings-open-data-folder">
                <SettingsOpenDataFolder/>
              </SettingsSection>
              <SettingsSection id="settings-change-history" class="settings-history" padded>
                <div class="settings-history__main">
                  <div class="settings-history__icon" aria-hidden="true">
                    <v-icon icon="mdi-history" size="26"/>
                  </div>
                  <div class="settings-history__copy">
                    <h3>{{ t('change_history.title') }}</h3>
                    <p>{{ t('change_history.workspace_hint') }}</p>
                  </div>
                  <div class="settings-history__action">
                    <DialogChangeHistory/>
                  </div>
                </div>
                <div class="settings-history__note">
                  <v-icon icon="mdi-shield-check-outline" size="16" aria-hidden="true"/>
                  <span>{{ t('change_history.protection_hint') }}</span>
                </div>
              </SettingsSection>
            </SettingsList>
          </div>

          <div v-else-if="tab === 'plugins'">
            <SettingsList>
              <SettingsSection id="settings-plugins">
                <SettingsPlugins/>
              </SettingsSection>
              <SettingsPluginPanels :panels="panelsForActiveTab"/>

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
              <SettingsSection id="settings-server-logs">
                <SettingsServerLogs/>
              </SettingsSection>
            </SettingsList>
          </div>

          <div v-else-if="isPluginOwnedTab(tab)">
            <SettingsList><SettingsPluginPanels :panels="panelsForActiveTab"/></SettingsList>
          </div>
        </v-container>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {useSettingsSearch} from '@/composable/useSettingsSearch'
import SettingsSearch from '@/components/settings/SettingsSearch.vue'
import ButtonDocumentation from '@/components/ui/ButtonDocumentation.vue'
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'
import SettingsPluginPanels from '@/components/settings/SettingsPluginPanels.vue'
import SettingsNetwork from '@/components/settings/general/SettingsNetwork.vue'
import SettingsAppearanceNavigation from '@/components/settings/appearance/SettingsAppearanceNavigation.vue'
import SettingsFilterBehavior from '@/components/settings/appearance/SettingsFilterBehavior.vue'
import SettingsImageGrid from '@/components/settings/appearance/SettingsImageGrid.vue'
import {CORE_SETTINGS_TABS, resolveSettingsLocation, settingsPanelTab} from '@/utils/settingsNavigation'
import type {SettingsSearchItem} from '@/utils/settingsNavigation'
import DialogChangeHistory from '@/components/dialogs/DialogChangeHistory.vue'
import {computed, ref, onMounted, onBeforeUnmount, watch, nextTick, defineAsyncComponent} from "vue"
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
import SettingsAppearanceImageViewer
  from "@/components/settings/appearance/SettingsAppearanceImageViewer.vue"
import SettingsSfwMode
  from "@/components/settings/appearance/SettingsSfwMode.vue"
import {usePluginsStore} from "@/stores/plugins"
import {markerMomentsAutoRefresh, markerMomentsEnabled} from '@/services/markerMomentPreferences'
import {LOCAL_AI_UI_ENABLED} from "@shared/features"

const SettingsMaintenance = defineAsyncComponent(() =>
  import("@/components/settings/database/SettingsMaintenance.vue")
)
const SettingsWatchedFolders = defineAsyncComponent(() =>
  import("@/components/settings/tools/SettingsWatchedFolders.vue")
)
const DialogMetadataTransfer = defineAsyncComponent(() => import('@/components/dialogs/DialogMetadataTransfer.vue'))
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
const SourcesPanel = defineAsyncComponent(() => import("@/components/dialogs/SourcesPanel.vue"))
const SettingsGenerateAutoChapters = defineAsyncComponent(() =>
  import("@/components/settings/database/SettingsGenerateAutoChapters.vue")
)
const SettingsLocalAi = defineAsyncComponent(() =>
  import("@/components/settings/general/SettingsLocalAi.vue")
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
const SettingsServerLogs = defineAsyncComponent(() =>
  import("@/components/settings/about/SettingsServerLogs.vue")
)
const About = defineAsyncComponent(() =>
  import("@/components/app/About.vue")
)

const tab = ref("general")
const maintenanceSection = ref<string>()
const contentRef = ref<HTMLElement | null>(null)
const applyingRoute = ref(false)
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

const navItems = computed((): SettingsNavItem[] => [...CORE_SETTINGS_TABS, ...pluginNavItems.value])

const panelsForActiveTab = computed(() => pluginsStore.settingsPanels.filter(panel => settingsPanelTab(panel) === tab.value))

function isPluginOwnedTab(value: string): boolean {
  return pluginNavItems.value.some(item => item.value === value)
}

const {items: searchItems} = useSettingsSearch()

function openSearchResult(item: SettingsSearchItem) {
  const query = {tab: item.tab, section: item.section}
  if (route.query.tab === item.tab && route.query.section === item.section) applyRouteSettings()
  else void router.push({path: '/settings', query})
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
  applyRouteSettings,
)

function getScrollContainer(): HTMLElement | null {
  if (!contentRef.value) return null

  const contentStyle = getComputedStyle(contentRef.value)
  if (contentStyle.overflowY === 'auto' || contentStyle.overflowY === 'scroll') {
    return contentRef.value
  }

  return contentRef.value.closest('.main-scroll') as HTMLElement | null
}

let scrollRequest = 0
function scheduleScrollToSection(sectionId: string) {
  const request = ++scrollRequest
  let attempts = 0
  let previousTop: number | undefined
  let stable = 0
  const scroll = () => {
    if (request !== scrollRequest) return
    const container = getScrollContainer()
    const element = document.getElementById(sectionId)
    const details = tab.value === 'maintenance' ? element?.closest('details') : null
    if (details && !details.open) details.open = true
    if (container && element && element.getClientRects().length) {
      const top = element.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop
      stable = previousTop !== undefined && Math.abs(top - previousTop) < 1 ? stable + 1 : 0
      previousTop = top
      container.scrollTo({top: Math.max(0, top - 8), behavior: 'instant'})
      if (stable >= 4) {
        if (!element.matches('button, a[href], input, select, textarea, [tabindex]')) {
          element.setAttribute('tabindex', '-1')
        }
        element.focus({preventScroll: true})
        return
      }
    }
    if (++attempts < 100) window.setTimeout(scroll, 50)
  }
  nextTick(scroll)
}

function applyRouteSettings() {
  applyingRoute.value = true
  ++scrollRequest
  const location = resolveSettingsLocation(
    String(route.query.tab || 'general'), String(route.query.section || ''),
    pluginsStore.settingsPanels,
  )
  tab.value = navItems.value.some(item => item.value === location.tab) ? location.tab : 'general'
  maintenanceSection.value = location.tab === 'maintenance' ? location.elementId : undefined
  nextTick(() => {
    if (location.elementId) scheduleScrollToSection(location.elementId)
    applyingRoute.value = false
  })
}

function scrollSettingsToTop() {
  const container = getScrollContainer()
  if (container) container.scrollTop = 0
}

function syncTabToRoute(nextTab: string) {
  const currentTab = resolveSettingsLocation(String(route.query.tab || "general"), String(route.query.section || ""), pluginsStore.settingsPanels).tab

  // Same tab: keep current query (including section deep-links).
  if (currentTab === nextTab) return

  router.replace({path: "/settings", query: {tab: nextTab}})
}

onMounted(applyRouteSettings)
onBeforeUnmount(() => { ++scrollRequest })

watch(tab, (nextTab) => {
  if (!applyingRoute.value) {
    ++scrollRequest
    scrollSettingsToTop()
    syncTabToRoute(nextTab)
    return
  }
})

watch(() => route.fullPath, applyRouteSettings)
</script>

<style src="@/components/settings/settingsCards.css"></style>

<style scoped>
.settings-history {
  border: 1px solid rgba(var(--v-theme-primary), .12);
  background: linear-gradient(120deg, rgba(var(--v-theme-primary), .045), rgba(var(--v-theme-surface), .6)) !important;
  padding: 20px !important;
}

.settings-history__main {
  display: flex;
  align-items: center;
  gap: 16px;
}

.settings-history__icon {
  display: grid;
  place-items: center;
  flex: 0 0 48px;
  height: 48px;
  border-radius: 14px;
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), .09);
}

.settings-history__copy {
  flex: 1;
  min-width: 0;
}

.settings-history__copy h3 {
  margin: 0 0 6px;
  font-size: .9375rem;
  font-weight: 600;
  line-height: 1.4;
}

.settings-history__copy p {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), .65);
  font-size: .8125rem;
  line-height: 1.6;
}

.settings-history__action {
  flex-shrink: 0;
}

.settings-history__note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid rgba(var(--v-theme-on-surface), .08);
  color: rgba(var(--v-theme-on-surface), .55);
  font-size: .75rem;
  line-height: 1.5;
}

.settings-history__note .v-icon {
  flex-shrink: 0;
  margin-top: 1px;
}

@media (max-width: 1200px) {
  .settings-history__main { flex-wrap: wrap; }
  .settings-history__copy { flex-basis: calc(100% - 64px); }
  .settings-history__action { margin-left: 64px; max-width: 100%; }
}

@media (max-width: 600px) {
  .settings-history { padding: 16px !important; }
  .settings-history__action { margin-left: 0; width: 100%; }
  .settings-history__action :deep(.history-trigger) {
    width: 100%;
    height: auto;
    padding-block: 10px;
  }
  .settings-history__action :deep(.v-btn__content) { white-space: normal; }
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
  padding-inline: 20px;
  overflow: hidden;
  box-sizing: border-box;
}

.settings-page-layout__sidebar {
  flex: 0 0 248px;
  min-height: 0;
  overflow-y: auto;
  padding-top: 22px;
}

.settings-page-layout__content {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
}

@media (min-width: 960px) {
  .settings-page-layout__nav {
    padding-top: 10px;
  }
}

.settings-page-layout__container {
  width: 100%;
  padding-inline: 0;
  padding-block: 16px calc(24px + var(--floating-nav-clearance, 0px));
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

  .settings-page-layout__container {
    padding-top: 0;
  }
}
</style>
