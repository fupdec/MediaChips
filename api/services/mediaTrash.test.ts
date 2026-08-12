import {describe, expect, it} from 'vitest'
import {
  MEDIA_TRASH_RETENTION_DAYS,
  buildTrashPath,
  isPastTrashRetention,
} from '../../shared/mediaTrash'
import {softDeleteMedia, restoreTrashMedia} from './mediaTrash'

describe('mediaTrash service helpers', () => {
  it('exports soft-delete and restore entry points', () => {
    expect(typeof softDeleteMedia).toBe('function')
    expect(typeof restoreTrashMedia).toBe('function')
  })

  it('keeps retention and path helpers aligned with shared module', () => {
    expect(MEDIA_TRASH_RETENTION_DAYS).toBe(30)
    expect(buildTrashPath(1, 'a.mp4')).toBe('__mediachips_trash__/1/a.mp4')
    const now = Date.parse('2026-08-12T12:00:00.000Z')
    const expired = new Date(now - (MEDIA_TRASH_RETENTION_DAYS + 1) * 86400000).toISOString()
    expect(isPastTrashRetention(expired, now)).toBe(true)
  })
})
