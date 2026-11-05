import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {usePluginsStore} from '@/stores/plugins'
import {LOCAL_AI_UI_ENABLED} from '@shared/features'
import {CORE_SETTINGS_TABS, SETTINGS_SECTIONS, settingsPanelTab} from '@/utils/settingsNavigation'
import type {SettingsSearchItem} from '@/utils/settingsNavigation'

/** Shared localized index for settings navigation and the global search palette. */
export function useSettingsSearch() {
  const {t, te} = useI18n()
  const pluginsStore = usePluginsStore()
  const items = computed((): SettingsSearchItem[] => {
    void pluginsStore.revision
    const core = SETTINGS_SECTIONS.filter(item => (!item.localAi || LOCAL_AI_UI_ENABLED) && !['general_app', 'database_add'].includes(item.key)).map(item => ({
      section: item.key,
      tab: item.tab,
      title: t(item.titleKey),
      category: t(CORE_SETTINGS_TABS.find(tab => tab.value === item.tab)!.labelKey),
      terms: [...item.searchKeys.map(key => t(key)), ...(item.keywords || [])],
    }))
    const panels = pluginsStore.settingsPanels.filter(panel => panel.sectionId).map(panel => {
      const entry = pluginsStore.catalog.find(entry => entry.manifest.id === panel.pluginId)
      const panelTab = settingsPanelTab(panel)
      const nav = [...CORE_SETTINGS_TABS, ...pluginsStore.settingsNav].find(item => item.value === panelTab)
      return {
        section: panel.sectionId!, tab: panelTab,
        title: te(`settings_labels.plugins.catalog.${panel.pluginId}.name`) ? t(`settings_labels.plugins.catalog.${panel.pluginId}.name`) : entry?.manifest.name || panel.pluginId,
        category: nav ? t(nav.labelKey) : t('settings.tabs.plugins'),
        terms: [te(`settings_labels.plugins.catalog.${panel.pluginId}.description`) ? t(`settings_labels.plugins.catalog.${panel.pluginId}.description`) : entry?.manifest.description || '', panel.componentKey],
      }
    })
    return [...core, ...panels]
  })

  return {items}
}
