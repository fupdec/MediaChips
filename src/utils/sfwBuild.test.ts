import { afterEach, describe, expect, it, vi } from 'vitest'

describe('sfwBuild', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('detects SFW / store channel from env', async () => {
    vi.stubEnv('MEDIA_CHIPS_SFW', '1')
    const mod = await import('./sfwBuild')
    expect(mod.isSfwBuild()).toBe(true)
    expect(mod.isStoreBuild()).toBe(true)
  })

  it('detects MS Store AppX flag separately', async () => {
    vi.stubEnv('MEDIA_CHIPS_SFW', '')
    vi.stubEnv('MEDIA_CHIPS_MSSTORE', '1')
    const mod = await import('./sfwBuild')
    expect(mod.isSfwBuild()).toBe(false)
    expect(mod.isMsStoreBuild()).toBe(true)
  })
})
