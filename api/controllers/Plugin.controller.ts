import type {ApiDb} from '../types/db'
import {apiErrorMessage} from '../types/errors'
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
      res.status(200).send(listInstalledUserPlugins(enabledPlugins))
    } catch (err: unknown) {
      res.status(500).send({message: apiErrorMessage(err) || 'Failed to list plugins'})
    }
  }

  const install = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const sourcePath = String(req.body?.path || '').trim()
      if (!sourcePath) {
        res.status(400).send({message: 'path is required'})
        return
      }
      const entry = await installPluginFromPath(sourcePath)
      remountPluginMainsAfterInstall()
      res.status(201).send(entry)
    } catch (err: unknown) {
      res.status(400).send({message: apiErrorMessage(err) || 'Failed to install plugin'})
    }
  }

  const uninstall = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const pluginId = String(req.body?.id || req.params?.id || '').trim()
      if (!pluginId) {
        res.status(400).send({message: 'id is required'})
        return
      }
      await uninstallPlugin(pluginId)
      res.status(200).send({ok: true})
    } catch (err: unknown) {
      res.status(400).send({message: apiErrorMessage(err) || 'Failed to uninstall plugin'})
    }
  }

  return {list, install, uninstall}
}
