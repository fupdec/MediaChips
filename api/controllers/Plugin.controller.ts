import type {ApiDb} from '../types/db'
import {sendAsClientError, sendControllerError, sendCreated, sendOk} from '../types/errors'
import type {ApiRequest, ApiResponse} from '../types/http'
import {
  installPluginFromPath,
  listInstalledUserPlugins,
  uninstallPlugin,
} from '../services/pluginInstall'
import {remountPluginMainsAfterInstall} from '../services/pluginMainRuntime'

export default function createPluginController(_db: ApiDb) {
  const list = async (_req: ApiRequest, res: ApiResponse) => {
    try {
      const enabledRaw = _req.query.enabledPlugins
      const enabledPlugins = typeof enabledRaw === 'string' && enabledRaw.trim()
        ? (() => {
            try {
              const parsed = JSON.parse(enabledRaw) as unknown
              return Array.isArray(parsed) ? parsed.map(String) : []
            } catch {
              return enabledRaw.split(',').map((item) => item.trim()).filter(Boolean)
            }
          })()
        : []
      sendOk(res, listInstalledUserPlugins(enabledPlugins))
    } catch (err: unknown) {
      sendControllerError(res, err, 'Failed to list plugins')
    }
  }

  const install = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const sourcePath = String(req.body.path || '').trim()
      const entry = await installPluginFromPath(sourcePath)
      remountPluginMainsAfterInstall()
      sendCreated(res, entry)
    } catch (err: unknown) {
      sendAsClientError(res, err, 'Failed to install plugin')
    }
  }

  const uninstall = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const pluginId = String(req.body.id || req.params.id || '').trim()
      await uninstallPlugin(pluginId)
      sendOk(res, {ok: true})
    } catch (err: unknown) {
      sendAsClientError(res, err, 'Failed to uninstall plugin')
    }
  }

  return {list, install, uninstall}
}
