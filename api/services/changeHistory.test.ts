// @vitest-environment node
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {createTestDb, closeTestDb, type TestDb} from '../db/testUtils/createTestDb'
import {createDrizzleClient} from '../db/client'
import {installChangeHistory, withChangeOperation} from '../db/changeHistory'
import {historyDetails, listHistory, restoreHistory, HistoryConflict} from './changeHistory'
import {applyBulkMetaEdit} from './bulkMetaEdit'

describe('persistent change history', () => {
  let db: TestDb
  beforeEach(() => {
    db = createTestDb('change-history')
    installChangeHistory(db.sqlite)
    db.sqlite.exec(`
      INSERT INTO meta (id, name, type, createdAt, updatedAt) VALUES
        (1, 'Tags', 'array', '2026-01-01', '2026-01-01'),
        (2, 'Score', 'rating', '2026-01-01', '2026-01-01');
      INSERT INTO tags (id, name, metaId, createdAt, updatedAt) VALUES
        (1, 'First', 1, '2026-01-01', '2026-01-01'), (2, 'Second', 1, '2026-01-01', '2026-01-01');
      INSERT INTO media (id, path, name, rating, favorite, createdAt, updatedAt) VALUES
        (1, '/one.mp4', 'One', 2, 0, '2026-01-01', '2026-01-01'),
        (2, '/two.mp4', 'Two', 3, 1, '2026-01-01', '2026-01-01');
    `)
  })
  afterEach(() => closeTestDb(db))
  const latest = () => listHistory(db.sqlite, 50, 0).items[0]!
  const rating = (id = 1) => (db.sqlite.prepare('SELECT rating FROM media WHERE id=?').get(id) as {rating: number}).rating

  it('records previous/new values, time and source; ignores unchanged fields', () => {
    withChangeOperation('manual', () => db.sqlite.exec('UPDATE media SET rating=5, name=name WHERE id=1'))
    const operation = latest()
    expect(operation).toMatchObject({source: 'manual', fields: 1, items: 1, remaining: 1})
    expect(Date.parse(operation.occurredAt)).toBeGreaterThan(0)
    expect(historyDetails(db.sqlite, operation.id, 50, 0).items).toEqual([
      expect.objectContaining({entityName: 'One', field: 'rating', before: 2, after: 5}),
    ])
    restoreHistory(db.sqlite, operation.id)
    expect(rating()).toBe(2)
    expect(latest().source).toBe('history:restore')
    expect(listHistory(db.sqlite, 50, 0).items.find(op => op.id === operation.id)?.remaining).toBe(0)
    expect(() => restoreHistory(db.sqlite, operation.id)).toThrow(HistoryConflict)
    restoreHistory(db.sqlite, latest().id)
    expect(rating()).toBe(5)
  })

  it('undoes an operation across hundreds of cards with their own original values', async () => {
    const insert = db.sqlite.prepare("INSERT INTO media (id,path,name,rating,createdAt,updatedAt) VALUES (?,?,?,?,'2026','2026')")
    db.sqlite.transaction(() => { for (let id = 3; id <= 605; id++) insert.run(id, `/m${id}`, `Card ${id}`, id % 6) })()
    const ids = Array.from({length: 605}, (_, i) => i + 1)
    await applyBulkMetaEdit(db, {itemType: 'media', itemIds: ids, changes: [], presetChanges: [{field: 'rating', editType: 2, value: 9}]})
    const operation = latest()
    expect(operation).toMatchObject({items: 605, fields: 605, source: 'bulk-edit'})
    expect(historyDetails(db.sqlite, operation.id, 100, 0).hasMore).toBe(true)
    expect(restoreHistory(db.sqlite, operation.id).restored).toBe(605)
    expect(rating()).toBe(2)
    expect(rating(2)).toBe(3)
    expect(rating(605)).toBe(5)
  })

  it('rolls back the whole undo on a conflict, but allows restoring an unaffected field', () => {
    withChangeOperation('bulk', () => db.sqlite.exec('UPDATE media SET rating=5 WHERE id IN (1,2)'))
    const operation = latest()
    withChangeOperation('later', () => db.sqlite.exec('UPDATE media SET rating=4 WHERE id=1'))
    const historyCount = db.sqlite.prepare('SELECT count(*) n FROM changeHistory').get()
    expect(() => restoreHistory(db.sqlite, operation.id)).toThrow(HistoryConflict)
    expect(rating(1)).toBe(4)
    expect(rating(2)).toBe(5)
    expect(db.sqlite.prepare('SELECT count(*) n FROM changeHistory').get()).toEqual(historyCount)
    const field = historyDetails(db.sqlite, operation.id, 50, 0).items.find(f => f.entityId === 2)!
    restoreHistory(db.sqlite, operation.id, field.id)
    expect(rating(2)).toBe(3)
    expect(rating(1)).toBe(4)
  })

  it('collapses value replacement; preserves missing, SQL null, zero, false and empty values', () => {
    for (const initial of [undefined, null, '0', 'false', '']) {
      db.sqlite.exec('DELETE FROM valuesInMedia; DELETE FROM changeHistory')
      if (initial !== undefined) db.sqlite.prepare('INSERT INTO valuesInMedia VALUES (1,2,?)').run(initial)
      db.sqlite.exec('DELETE FROM changeHistory')
      withChangeOperation('edit', () => {
        db.sqlite.exec('DELETE FROM valuesInMedia WHERE mediaId=1 AND metaId=2')
        db.sqlite.exec("INSERT INTO valuesInMedia VALUES (1,2,'9')")
      })
      const operation = latest()
      expect(operation.fields).toBe(1)
      const field = historyDetails(db.sqlite, operation.id, 50, 0).items[0]!
      expect(field.before).toEqual(initial === undefined ? null : {value: initial})
      expect(field.fieldLabel).toBe('Score')
      restoreHistory(db.sqlite, operation.id, field.id)
      expect(db.sqlite.prepare('SELECT value FROM valuesInMedia WHERE mediaId=1 AND metaId=2').get())
        .toEqual(initial === undefined ? undefined : {value: initial})
    }
  })

  it('restores replaced tag assignments on cards and tags', async () => {
    for (const itemType of ['media', 'tag'] as const) {
      const table = itemType === 'media' ? 'tagsInMedia' : 'tagsInTags'
      db.sqlite.exec(`INSERT INTO ${table} VALUES (1,1,1)`)
      await applyBulkMetaEdit(db, {itemType, itemIds: [1], changes: [{metaId: 1, metaType: 'array', editType: 2, value: [2]}]})
      const operation = latest()
      expect(operation.fields).toBe(2)
      restoreHistory(db.sqlite, operation.id)
      expect(db.sqlite.prepare(`SELECT tagId FROM ${table}`).all()).toEqual([{tagId: 1}])
    }
  })

  it('records and restores mark creation, editing and soft/permanent deletion', () => {
    withChangeOperation('create', () => db.sqlite.exec("INSERT INTO marks (id,mediaId,tagId,time,text) VALUES (1,1,1,30,'Intro')"))
    const create = latest()
    withChangeOperation('edit', () => db.sqlite.exec("UPDATE marks SET time=60,text='Chapter' WHERE id=1"))
    restoreHistory(db.sqlite, latest().id)
    expect(db.sqlite.prepare('SELECT time,text FROM marks').get()).toEqual({time: 30, text: 'Intro'})
    withChangeOperation('delete', () => db.sqlite.exec("UPDATE marks SET deletedAt='2026-01-01' WHERE id=1"))
    restoreHistory(db.sqlite, latest().id)
    expect(db.sqlite.prepare('SELECT deletedAt FROM marks').get()).toEqual({deletedAt: null})
    withChangeOperation('purge', () => db.sqlite.exec('DELETE FROM marks WHERE id=1'))
    restoreHistory(db.sqlite, latest().id)
    expect(db.sqlite.prepare('SELECT time,text FROM marks').get()).toEqual({time: 30, text: 'Intro'})
    restoreHistory(db.sqlite, create.id)
    expect(db.sqlite.prepare('SELECT * FROM marks').all()).toEqual([])
  })

  it('refuses to recreate relations whose card or assigned tag has been removed', () => {
    db.sqlite.exec('INSERT INTO tagsInMedia VALUES (1,1,1); DELETE FROM changeHistory')
    withChangeOperation('remove-tag', () => db.sqlite.exec('DELETE FROM tagsInMedia'))
    const operation = latest()
    db.sqlite.exec('DELETE FROM tags WHERE id=1')
    expect(() => restoreHistory(db.sqlite, operation.id)).toThrow(HistoryConflict)
    expect(db.sqlite.prepare('SELECT * FROM tagsInMedia').all()).toEqual([])
  })

  it('does not retain audit entries for rolled-back writes or net zero changes', () => {
    expect(() => withChangeOperation('failed', () => db.sqlite.transaction(() => {
      db.sqlite.exec('UPDATE media SET rating=5 WHERE id=1')
      throw new Error('fail')
    })())).toThrow('fail')
    expect(listHistory(db.sqlite, 50, 0).items).toEqual([])
    withChangeOperation('noop', () => db.sqlite.exec('UPDATE media SET rating=5 WHERE id=1; UPDATE media SET rating=2 WHERE id=1'))
    expect(listHistory(db.sqlite, 50, 0).items).toEqual([])
  })

  it('rolls back every bulk change and its history if a later write fails', async () => {
    db.sqlite.exec(`CREATE TEMP TRIGGER reject_rating BEFORE UPDATE OF rating ON media
      WHEN NEW.id=2 BEGIN SELECT RAISE(ABORT, 'Cannot edit second card'); END`)
    await expect(applyBulkMetaEdit(db, {itemType: 'media', itemIds: [1, 2],
      changes: [{metaId: 2, metaType: 'rating', editType: 2, value: 8}],
      presetChanges: [{field: 'rating', editType: 2, value: 5}],
    })).rejects.toThrow()
    expect(rating()).toBe(2)
    expect(db.sqlite.prepare('SELECT * FROM valuesInMedia').all()).toEqual([])
    expect(listHistory(db.sqlite, 50, 0).items).toEqual([])
  })

  it('records direct reassignment of relation keys and restores both sides', () => {
    db.sqlite.exec('INSERT INTO tagsInMedia VALUES (1,1,1); DELETE FROM changeHistory')
    withChangeOperation('move-assignment', () => db.sqlite.exec('UPDATE tagsInMedia SET mediaId=2,tagId=2'))
    expect(latest().fields).toBe(2)
    restoreHistory(db.sqlite, latest().id)
    expect(db.sqlite.prepare('SELECT * FROM tagsInMedia').all()).toEqual([{mediaId: 1, tagId: 1, metaId: 1}])
  })

  it('reports a constraint conflict and rolls back without partial restoration', () => {
    withChangeOperation('rename', () => db.sqlite.exec("UPDATE tags SET name='Renamed', rating=5 WHERE id=1"))
    const operation = latest()
    db.sqlite.exec("INSERT INTO tags (name,metaId,createdAt,updatedAt) VALUES ('First',1,'2026','2026')")
    expect(() => restoreHistory(db.sqlite, operation.id)).toThrow(HistoryConflict)
    expect(db.sqlite.prepare('SELECT name,rating FROM tags WHERE id=1').get()).toEqual({name: 'Renamed', rating: 5})
    expect(listHistory(db.sqlite, 50, 0).items.find(op => op.id === operation.id)?.remaining).toBe(2)
  })

  it('keeps history and reinstalls capture after reconnecting', () => {
    withChangeOperation('before-restart', () => db.sqlite.exec('UPDATE media SET rating=5 WHERE id=1'))
    const operation = latest()
    const reopened = createDrizzleClient(db.dbPath)
    try {
      expect(listHistory(reopened.sqlite, 50, 0).items[0]?.id).toBe(operation.id)
      restoreHistory(reopened.sqlite, operation.id)
      expect(rating()).toBe(2)
      withChangeOperation('after-restart', () => reopened.sqlite.exec('UPDATE media SET rating=4 WHERE id=1'))
      expect(listHistory(reopened.sqlite, 50, 0).items[0]?.source).toBe('after-restart')
    } finally { reopened.sqlite.close() }
  })

  it('paginates and filters by entity without truncating a bulk operation', () => {
    withChangeOperation('bulk', () => db.sqlite.exec('UPDATE media SET rating=5'))
    withChangeOperation('tag', () => db.sqlite.exec('UPDATE tags SET rating=4 WHERE id=1'))
    expect(listHistory(db.sqlite, 1, 0)).toMatchObject({hasMore: true, items: [expect.objectContaining({source: 'tag'})]})
    expect(listHistory(db.sqlite, 1, 1)).toMatchObject({hasMore: false, items: [expect.objectContaining({source: 'bulk'})]})
    expect(listHistory(db.sqlite, 50, 0, {type: 'media', id: 1}).items).toEqual([expect.objectContaining({source: 'bulk', items: 2})])
  })
})
