import {describe, expect, it} from 'vitest'
import {
  MEDIA_TRASH_RETENTION_DAYS,
  buildTrashPath,
  isPastTrashRetention,
} from '../../shared/mediaTrash'
import type {ApiDb} from '../types/db'
import {softDeleteMedia, softDeleteMediaMany, restoreTrashMedia} from './mediaTrash'

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

type FakeRow = {
  id: number
  path: string | null
  basename: string | null
  deletedAt: string | null
  trashOriginalPath?: string | null
  trashPurgeFile?: number
}

function createFakeDb(rows: Map<number, FakeRow>, failOnId = -1) {
  const sqlite = {
    prepare(sql: string) {
      if (sql.includes('SELECT')) return {get: (id: number) => rows.get(id)}
      return {
        run: (deletedAt: string, original: string | null, purge: number, trashPath: string, _updatedAt: string, id: number) => {
          if (id === failOnId) throw new Error('boom')
          Object.assign(rows.get(id)!, {deletedAt, trashOriginalPath: original, trashPurgeFile: purge, path: trashPath})
        },
      }
    },
    transaction<A extends unknown[], R>(fn: (...args: A) => R) {
      return (...args: A): R => {
        const snapshot = new Map([...rows].map(([key, value]) => [key, {...value}]))
        try {
          return fn(...args)
        } catch (error) {
          rows.clear()
          snapshot.forEach((value, key) => rows.set(key, value))
          throw error
        }
      }
    },
  }
  return {sqlite} as unknown as ApiDb
}

describe('softDeleteMediaMany', () => {
  it('moves rows to Trash in one batch and reports missing and already trashed ids', () => {
    const rows = new Map<number, FakeRow>([
      [1, {id: 1, path: '/a/x.jpg', basename: 'x.jpg', deletedAt: null}],
      [2, {id: 2, path: '/a/y.jpg', basename: null, deletedAt: null}],
      [3, {id: 3, path: '__t/3/z.jpg', basename: 'z.jpg', deletedAt: 'old'}],
    ])
    const result = softDeleteMediaMany(createFakeDb(rows), [1, 2, 3, 99, -5], {purgeFile: true})

    expect(result).toEqual({deletedIds: [1, 2, 3], missingIds: [99]})
    expect(rows.get(1)).toMatchObject({
      path: buildTrashPath(1, 'x.jpg'),
      trashOriginalPath: '/a/x.jpg',
      trashPurgeFile: 1,
    })
    expect(rows.get(2)?.path).toBe(buildTrashPath(2, 'y.jpg'))
    expect(rows.get(3)).toMatchObject({path: '__t/3/z.jpg', deletedAt: 'old'})
  })

  it('rolls the whole batch back when one row fails', () => {
    const rows = new Map<number, FakeRow>([
      [1, {id: 1, path: '/a/x.jpg', basename: 'x.jpg', deletedAt: null}],
      [2, {id: 2, path: '/a/y.jpg', basename: 'y.jpg', deletedAt: null}],
    ])
    expect(() => softDeleteMediaMany(createFakeDb(rows, 2), [1, 2])).toThrow('boom')
    expect(rows.get(1)).toMatchObject({path: '/a/x.jpg', deletedAt: null})
    expect(rows.get(2)).toMatchObject({path: '/a/y.jpg', deletedAt: null})
  })
})
