import type { ApiDb } from '../types/db'
import { apiErrorMessage, paramString } from '../types/errors'
import type { ApiRequest, ApiResponse } from '../types/http'

import { createSettingsRepository } from '../db/repositories/settings'
import { getAuthService } from '../../app/server/authRegistry'
import { applyLanAccessChange, isLanAccessEnvLocked } from '../../app/server/lanAccess'
import { isGlobalAppConfigKey } from '../../shared/appGlobalConfig'
import { getAppConfigPath } from '../utils/appConfigPath'
import { loadConfigFile, saveConfigFile } from '../../app/server/configFile'

export default function (db: ApiDb) {
  const settingsRepo = createSettingsRepository(db.drizzle)

  const findAll = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const authService = getAuthService()
      const data = settingsRepo.findAll()
      const settings = await authService.loadSecuritySettings()
      const sanitized = authService.sanitizeSettingRows(
        data as Parameters<typeof authService.sanitizeSettingRows>[0],
        settings.passwordProtection,
        authService.isRequestAuthenticated(req),
      )
      res.status(201).send(sanitized)
    } catch (err: unknown) {
      res.status(500).send({
        message: apiErrorMessage(err) || "Some error occurred while retrieving media."
      })
    }
  };

  const findOne = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const authService = getAuthService()
      const data = settingsRepo.findByOption(paramString(req.params.option))
      const settings = await authService.loadSecuritySettings()
      const sanitized = authService.sanitizeSettingRow(
        (data ?? null) as Parameters<typeof authService.sanitizeSettingRow>[0],
        settings.passwordProtection,
        authService.isRequestAuthenticated(req),
      )
      res.status(201).send(sanitized)
    } catch (err: unknown) {
      res.status(500).send({
        message: apiErrorMessage(err) || "Some error occurred while retrieving media."
      })
    }
  };

  const update = async function (req: ApiRequest, res: ApiResponse) {
    if (!req.body) return res.sendStatus(400)

    const option = paramString(req.params.option)

    try {
      if (isGlobalAppConfigKey(option)) {
        const value = String(req.body.value)

        if (value === '') {
          settingsRepo.upsertByOption(option, '')
          return res.status(201).send([1])
        }

        if (option === 'allowLanAccess') {
          if (isLanAccessEnvLocked()) {
            return res.status(409).send({
              message: 'LAN access is controlled by MEDIA_CHIPS_ALLOW_LAN environment variable',
            })
          }

          const enabled = value === '1' || req.body.value === 1 || req.body.value === true
          await applyLanAccessChange(enabled)
        } else {
          const configPath = getAppConfigPath()
          const loaded = loadConfigFile(configPath)
          if (!loaded.config) {
            return res.status(500).send({
              message: 'Failed to load application config',
            })
          }

          loaded.config[option] = value
          saveConfigFile(configPath, loaded.config)

          const globalConfig = global as { serverConfig?: Record<string, unknown> }
          if (globalConfig.serverConfig) {
            globalConfig.serverConfig[option] = value
          }
        }

        settingsRepo.upsertByOption(option, '')
        return res.status(201).send([1])
      }

      settingsRepo.upsertByOption(option, req.body.value)

      if (option === 'phrase' || option === 'passwordProtection') {
        getAuthService().invalidateSettingsCache()
      }

      res.status(201).send([1])
    } catch (err) {
      res.status(500).send({
        message: apiErrorMessage(err) || "Some error occurred while retrieving media."
      })
    }
  };

  return {
    findAll,
    findOne,
    update,
  }
}
