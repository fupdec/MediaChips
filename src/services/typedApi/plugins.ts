import {apiClient} from '../apiClient'
import {API_ROUTES} from '@shared/api/routes'
import type {PluginCatalogEntry} from '@shared/plugins'
import {
  PathPayloadSchema,
  PluginUninstallRequestSchema,
} from '@shared/schemas/requests'
import {
  parsePluginCatalogEntry,
  parsePluginCatalogList,
  parsePluginUninstallResponse,
} from '@shared/schemas'
import {validated, validateRequest} from './validate'

export const pluginsApi = {
  listPlugins(enabledPluginIds: string[] = []) {
    return apiClient.get<PluginCatalogEntry[]>(API_ROUTES.plugin, {
      params: {enabledPlugins: JSON.stringify(enabledPluginIds)},
    }).then((res) => ({
      ...res,
      data: validated(parsePluginCatalogList, res.data),
    }))
  },

  installPlugin(sourcePath: string) {
    const body = validateRequest(PathPayloadSchema, {path: sourcePath})
    return apiClient.post<PluginCatalogEntry>(API_ROUTES.pluginInstall, body).then((res) => ({
      ...res,
      data: validated(parsePluginCatalogEntry, res.data),
    }))
  },

  uninstallPlugin(pluginId: string) {
    const body = validateRequest(PluginUninstallRequestSchema, {id: pluginId})
    return apiClient.post<{ok: true}>(API_ROUTES.pluginUninstall, body).then((res) => ({
      ...res,
      data: validated(parsePluginUninstallResponse, res.data),
    }))
  },
}
