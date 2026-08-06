/**
 * @vitest-environment node
 */
import {describe, expect, it} from 'vitest'
import {resolveServerAppFolder} from './serverConfig'

describe('resolveServerAppFolder', () => {
  it('prefers MEDIA_CHIPS_DATA_DIR over Electron userData', () => {
    const previous = process.env.MEDIA_CHIPS_DATA_DIR
    process.env.MEDIA_CHIPS_DATA_DIR = '/tmp/mc-data-dir'
    try {
      const result = resolveServerAppFolder({
        isElectron: true,
        getUserDataPath: () => '/tmp/electron-user-data',
      })
      expect(result.usedDataDir).toBe(true)
      expect(result.appFolder).toBe('/tmp/mc-data-dir')
    } finally {
      if (previous === undefined) delete process.env.MEDIA_CHIPS_DATA_DIR
      else process.env.MEDIA_CHIPS_DATA_DIR = previous
    }
  })

  it('uses explicit dataDir option even when env is empty', () => {
    const previous = process.env.MEDIA_CHIPS_DATA_DIR
    delete process.env.MEDIA_CHIPS_DATA_DIR
    try {
      const result = resolveServerAppFolder({
        dataDir: '/custom/data',
        isElectron: true,
        getUserDataPath: () => '/tmp/electron-user-data',
      })
      expect(result).toEqual({
        appFolder: '/custom/data',
        usedDataDir: true,
      })
    } finally {
      if (previous === undefined) delete process.env.MEDIA_CHIPS_DATA_DIR
      else process.env.MEDIA_CHIPS_DATA_DIR = previous
    }
  })

  it('falls back to Electron userData when no data dir is set', () => {
    const previous = process.env.MEDIA_CHIPS_DATA_DIR
    delete process.env.MEDIA_CHIPS_DATA_DIR
    try {
      const result = resolveServerAppFolder({
        isElectron: true,
        getUserDataPath: () => '/tmp/electron-user-data',
      })
      expect(result).toEqual({
        appFolder: '/tmp/electron-user-data',
        usedDataDir: false,
      })
    } finally {
      if (previous === undefined) delete process.env.MEDIA_CHIPS_DATA_DIR
      else process.env.MEDIA_CHIPS_DATA_DIR = previous
    }
  })
})
