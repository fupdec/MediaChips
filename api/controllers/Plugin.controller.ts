import type {ApiDb} from '../types/db'
import {HttpError, apiErrorMessage, sendControllerError} from '../types/errors'
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
      sendControllerError(res, err, 'Failed to list plugins')
    }
  }

  const install = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const sourcePath = String(req.body.path || '').trim()
      const entry = await installPluginFromPath(sourcePath)
      remountPluginMainsAfterInstall()
      res.status(201).send(entry)
    } catch (err: unknown) {
      sendControllerError(
        res,
        err instanceof HttpError ? err : new HttpError(400, apiErrorMessage(err) || 'Failed to install plugin'),
        'Failed to install plugin',
      )
    }
  }

  const uninstall = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const pluginId = String(req.body.id || req.params.id || '').trim()
      await uninstallPlugin(pluginId)
      res.status(200).send({ok: true})
    } catch (err: unknown) {
      sendControllerError(
        res,
        err instanceof HttpError ? err : new HttpError(400, apiErrorMessage(err) || 'Failed to uninstall plugin'),
        'Failed to uninstall plugin',
      )
    }
  }

  return {list, install, uninstall}
}
