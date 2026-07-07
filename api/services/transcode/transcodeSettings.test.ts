/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  getTranscodeSettings,
  isTranscodeEnabled,
} from './transcodeSettings'

describe('transcodeSettings', () => {
  afterEach(() => {
    const globalConfig = global as { serverConfig?: Record<string, unknown> }
    delete globalConfig.serverConfig
  })

  it('uses config.json defaults when transcode keys are missing from server config', async () => {
    const globalConfig = global as { serverConfig?: Record<string, unknown> }
    globalConfig.serverConfig = {
      port: 12321,
      zoom: '1',
    }

    const settings = await getTranscodeSettings(null)

    expect(settings.transcodeUnsupportedFormats).toBe('1')
    expect(isTranscodeEnabled(settings)).toBe(true)
  })

  it('respects explicit transcode settings from config.json', async () => {
    const globalConfig = global as { serverConfig?: Record<string, unknown> }
    globalConfig.serverConfig = {
      transcodeUnsupportedFormats: '0',
      transcodeMaxHeight: '720',
      transcodeCacheMaxGb: '2',
    }

    const settings = await getTranscodeSettings(null)

    expect(settings).toEqual({
      transcodeUnsupportedFormats: '0',
      transcodeMaxHeight: '720',
      transcodeCacheMaxGb: '2',
    })
    expect(isTranscodeEnabled(settings)).toBe(false)
  })
})
