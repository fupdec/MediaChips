/**
 * @vitest-environment node
 */
import {beforeEach, describe, expect, it, vi} from 'vitest'

const {saveConfigFile, restartListener} = vi.hoisted(() => ({
  saveConfigFile: vi.fn(),
  restartListener: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./configFile', () => ({
  saveConfigFile,
}))

import {
  applyLanAccessChange,
  didLanAccessChange,
  registerServerNetworkDeps,
} from './lanAccess'

describe('didLanAccessChange', () => {
  it('is false when the LAN flag stays enabled', () => {
    expect(didLanAccessChange('1', '1')).toBe(false)
    expect(didLanAccessChange(true, '1')).toBe(false)
    expect(didLanAccessChange('1', true)).toBe(false)
  })

  it('is false when the LAN flag stays disabled', () => {
    expect(didLanAccessChange('0', '0')).toBe(false)
    expect(didLanAccessChange(false, '0')).toBe(false)
  })

  it('is true when the LAN flag toggles', () => {
    expect(didLanAccessChange('1', '0')).toBe(true)
    expect(didLanAccessChange('0', '1')).toBe(true)
    expect(didLanAccessChange(true, false)).toBe(true)
  })
})

describe('applyLanAccessChange', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    registerServerNetworkDeps({
      config: {allowLanAccess: '1'} as never,
      configPath: '/tmp/config.json',
      getBestLocalIp: () => '127.0.0.1',
      getAllIps: () => [],
      restartListener,
    })
  })

  it('does not restart the HTTP listener when LAN is already enabled', async () => {
    // initLanAccess defaults lanEnabled to true before deps are registered.
    await applyLanAccessChange(true)
    expect(restartListener).not.toHaveBeenCalled()
    expect(saveConfigFile).toHaveBeenCalled()
  })
})
