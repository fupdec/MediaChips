import { describe, expect, it, vi } from 'vitest'
import { getMediaTypeName } from './mediaTypeI18n'

describe('getMediaTypeName', () => {
  it('maps aliases to media.type_names keys', () => {
    const t = vi.fn((key: string, fallback?: string) => `${key}:${fallback}`)
    expect(getMediaTypeName({ type: 'movies', name: 'Movies' }, t)).toBe('media.type_names.video:Movies')
    expect(getMediaTypeName({ type: 'photos', name: 'Photos' }, t)).toBe('media.type_names.image:Photos')
    expect(getMediaTypeName({ type: 'music', name: 'Audio' }, t)).toBe('media.type_names.audio:Audio')
  })

  it('falls back to name when type is unknown or missing', () => {
    const t = vi.fn((key: string, fallback?: string) => key)
    expect(getMediaTypeName({ type: 'custom', name: 'Custom' }, t)).toBe('Custom')
    expect(getMediaTypeName(null, t)).toBe('')
    expect(t).not.toHaveBeenCalled()
  })
})
