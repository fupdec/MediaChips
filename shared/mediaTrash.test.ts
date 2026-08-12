import {describe, expect, it} from 'vitest'
import {
  buildTrashPath,
  isPastTrashRetention,
  MEDIA_TRASH_RETENTION_DAYS,
} from './mediaTrash'

describe('mediaTrash', () => {
  it('builds a unique trash path', () => {
    expect(buildTrashPath(42, 'a/b.mp4')).toBe('__mediachips_trash__/42/a_b.mp4')
  })

  it('detects retention expiry', () => {
    const now = Date.parse('2026-08-12T12:00:00.000Z')
    const fresh = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString()
    const old = new Date(now - (MEDIA_TRASH_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000).toISOString()
    expect(isPastTrashRetention(fresh, now)).toBe(false)
    expect(isPastTrashRetention(old, now)).toBe(true)
    expect(isPastTrashRetention(null, now)).toBe(false)
  })
})
