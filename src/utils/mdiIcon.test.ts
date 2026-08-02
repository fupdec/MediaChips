import {describe, expect, it} from 'vitest'
import {mdiIcon, normalizeMdiIconName} from './mdiIcon'

describe('normalizeMdiIconName', () => {
  it('keeps bare Material icon names', () => {
    expect(normalizeMdiIconName('image-multiple')).toBe('image-multiple')
  })

  it('strips a leading mdi- prefix', () => {
    expect(normalizeMdiIconName('mdi-image-multiple')).toBe('image-multiple')
  })

  it('does not double-prefix when building mdiIcon', () => {
    expect(mdiIcon('mdi-fingerprint')).toBe('mdi-fingerprint')
    expect(mdiIcon('fingerprint')).toBe('mdi-fingerprint')
  })
})
