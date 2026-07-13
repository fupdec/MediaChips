import type {Component} from 'vue'
import type {RouteRecordRaw} from 'vue-router'
import type {
  MediaChipsPlugin,
  PluginApi,
  PluginCatalogEntry,
  PluginManifest,
} from '@shared/plugins'
import type {SettingsNavItem} from '@/components/settings/SettingsNav.vue'

export type {
  MediaChipsPlugin,
  PluginApi,
  PluginCatalogEntry,
  PluginManifest,
}

export type PluginComponentLoader = () => Promise<{default: Component}>

export type PluginComponentMap = Record<string, PluginComponentLoader>

export type {SettingsNavItem, RouteRecordRaw}
