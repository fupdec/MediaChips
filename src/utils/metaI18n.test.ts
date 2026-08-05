import { describe, expect, it, vi } from 'vitest'
import { getMetaName } from './metaI18n'

describe('getMetaName', () => {
  it('maps known default meta names to i18n keys', () => {
    const t = vi.fn((key: string, fallback?: string) => `${key}:${fallback}`)
    expect(getMetaName({ name: 'Rating' }, t)).toBe('meta.default_names.rating:Rating')
    expect(getMetaName({ name: 'file_name' }, t)).toBe('meta.default_names.file_name:file_name')
  })

  it('returns the raw name for custom metas', () => {
    const t = vi.fn((key: string, fallback?: string) => key)
    expect(getMetaName({ name: 'Studio' }, t)).toBe('Studio')
    expect(getMetaName(undefined, t)).toBe('')
    expect(t).not.toHaveBeenCalled()
  })
})
