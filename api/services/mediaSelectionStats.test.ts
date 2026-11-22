/** @vitest-environment node */
import Database from 'better-sqlite3'
import {describe, expect, it} from 'vitest'
import {getMediaSelectionStats} from './mediaSelectionStats'

describe('selection statistics', () => {
  it('counts only selected existing IDs, once, across SQL batches', () => {
    const sqlite = new Database(':memory:')
    try {
      sqlite.exec('CREATE TABLE media (id INTEGER PRIMARY KEY, filesize INTEGER)')
      const insert = sqlite.prepare('INSERT INTO media VALUES (?, ?)')
      sqlite.transaction(() => {
        for (let id = 1; id <= 1200; id++) insert.run(id, id === 1200 ? null : id)
      })()
      const ids = Array.from({length: 1200}, (_, i) => i + 1)
      expect(getMediaSelectionStats({sqlite}, [...ids, 1, 500, 9999])).toEqual({
        count: 1200, filesize: 1199 * 1200 / 2, missing: 1, unknownSize: 1,
      })
      expect(getMediaSelectionStats({sqlite}, [2, 4, 9999])).toEqual({count: 2, filesize: 6, missing: 1, unknownSize: 0})
      expect(getMediaSelectionStats({sqlite}, [])).toEqual({count: 0, filesize: 0, missing: 0, unknownSize: 0})
    } finally {
      sqlite.close()
    }
  })
})
