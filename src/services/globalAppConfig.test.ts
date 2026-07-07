import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const { updateConfig, putSetting, syncMinimizeToTray } = vi.hoisted(() => ({
  updateConfig: vi.fn().mockResolvedValue(undefined),
  putSetting: vi.fn().mockResolvedValue(undefined),
  syncMinimizeToTray: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/services/configService', () => ({
  updateConfig,
}))

vi.mock('@/services/typedApi', () => ({
  typedApi: {
    putSetting,
  },
}))

vi.mock('@/services/electronBridge', () => ({
  syncMinimizeToTray,
}))

import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'
import {
  hasGlobalAppConfigInConfig,
  readGlobalAppConfigFromStore,
  migrateGlobalAppConfigFromDbIfNeeded,
  persistGlobalAppConfig,
  migrateMinimizeToTrayFromDbIfNeeded,
} from '@/services/globalAppConfig'

describe('globalAppConfig', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('detects global settings in config', () => {
    expect(hasGlobalAppConfigInConfig({})).toBe(false)
    expect(hasGlobalAppConfigInConfig({ zoom: '1.25' })).toBe(true)
    expect(hasGlobalAppConfigInConfig({ allowLanAccess: false })).toBe(true)
  })

  it('reads global defaults when config fields are missing', () => {
    expect(readGlobalAppConfigFromStore({})).toEqual({
      allowLanAccess: '1',
      checkForUpdatesAtStartup: '1',
      selectedDisk: '',
      transcodeUnsupportedFormats: '1',
      transcodeMaxHeight: '1080',
      transcodeCacheMaxGb: '5',
      zoom: '1',
    })
  })

  it('migrates global settings from the active database to config', async () => {
    const settings = useSettingsStore()
    settings.zoom = '1.5'
    settings.checkForUpdatesAtStartup = '0'

    await migrateGlobalAppConfigFromDbIfNeeded({
      hadInDb: {
        zoom: true,
        checkForUpdatesAtStartup: true,
      },
    })

    expect(updateConfig).toHaveBeenCalledWith(expect.objectContaining({
      zoom: '1.5',
      checkForUpdatesAtStartup: '0',
    }))
    expect(useAppStore().config).toMatchObject({
      zoom: '1.5',
      checkForUpdatesAtStartup: '0',
    })
  })

  it('prefers global config over per-database settings', async () => {
    const app = useAppStore()
    app.config = {
      zoom: '1.25',
      checkForUpdatesAtStartup: '1',
      transcodeUnsupportedFormats: '0',
      transcodeMaxHeight: '720',
      transcodeCacheMaxGb: '10',
      allowLanAccess: '0',
      selectedDisk: 'D:',
    }

    const settings = useSettingsStore()
    settings.zoom = '2'
    settings.checkForUpdatesAtStartup = '0'
    settings.allowLanAccess = '1'

    await migrateGlobalAppConfigFromDbIfNeeded({
      hadInDb: {
        zoom: true,
        allowLanAccess: true,
      },
    })

    expect(settings.zoom).toBe('1.25')
    expect(settings.allowLanAccess).toBe('0')
    expect(putSetting).toHaveBeenCalled()
    expect(updateConfig).not.toHaveBeenCalled()
  })

  it('persists global setting updates to config.json', async () => {
    await persistGlobalAppConfig({ zoom: '1.5' })

    expect(updateConfig).toHaveBeenCalledWith(expect.objectContaining({
      zoom: '1.5',
    }))
    expect(useSettingsStore().zoom).toBe('1.5')
  })

  it('migrates minimizeToTray from the database to config', async () => {
    await migrateMinimizeToTrayFromDbIfNeeded('1')

    expect(updateConfig).toHaveBeenCalledWith({ minimizeToTray: '1' })
    expect(useAppStore().config.minimizeToTray).toBe('1')
    expect(putSetting).toHaveBeenCalledWith('minimizeToTray', '')
    expect(syncMinimizeToTray).toHaveBeenCalledWith(true)
  })

  it('persists minimizeToTray updates to config.json and syncs the tray', async () => {
    const { persistMinimizeToTray } = await import('@/services/globalAppConfig')

    await persistMinimizeToTray(true)

    expect(updateConfig).toHaveBeenCalledWith({ minimizeToTray: '1' })
    expect(useAppStore().config.minimizeToTray).toBe('1')
    expect(syncMinimizeToTray).toHaveBeenCalledWith(true)
  })
})
