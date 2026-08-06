/**
 * @vitest-environment node
 */
import Database from 'better-sqlite3'
import {describe, expect, it} from 'vitest'
import type {ApiDb} from '../types/db'
import {
  clampAssistantToolLimit,
  filterMediaRowsByQuery,
  filterTagRowsByQuery,
  projectMetaRowsForAssistant,
  resolveAssistantToolQuery,
  searchMediaRowsByQuery,
  searchTagRowsByQuery,
} from './assistantToolQueries'

function createAssistantQueryDb(): ApiDb {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL,
      name TEXT
    );
    CREATE TABLE tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      metaId INTEGER
    );
    INSERT INTO media (path, name) VALUES
      ('/films/Ada.mp4', 'Ada'),
      ('/films/Bob.mp4', 'Bob'),
      ('/other/clip.mp4', 'Quiet');
    INSERT INTO tags (name, metaId) VALUES
      ('Ada', 1),
      ('Bob', 1),
      ('Carol%', 2);
  `)
  return {sqlite} as ApiDb
}

describe('assistantToolQueries', () => {
  it('resolves query aliases and clamps limits', () => {
    expect(resolveAssistantToolQuery({q: 'ada'})).toBe('ada')
    expect(resolveAssistantToolQuery({query: 'x'})).toBe('x')
    expect(clampAssistantToolLimit(100, {max: 20, fallback: 10})).toBe(20)
    expect(clampAssistantToolLimit(undefined, {max: 20, fallback: 10})).toBe(10)
    expect(clampAssistantToolLimit(0, {max: 20, fallback: 10})).toBe(10)
  })

  it('filters media and tag rows in memory', () => {
    const media = [
      {id: 1, name: 'Ada', path: '/a.mp4'},
      {id: 2, name: 'Bob', path: '/b.mp4'},
    ]
    expect(filterMediaRowsByQuery(media, 'ada', 10)).toEqual([media[0]])
    expect(filterMediaRowsByQuery(media, '', 10)).toEqual([])

    const tags = [
      {id: 1, name: 'Ada'},
      {id: 2, name: 'Bob'},
    ]
    expect(filterTagRowsByQuery(tags, 'bo', 10)).toEqual([tags[1]])
    expect(filterTagRowsByQuery(tags, '', 1)).toEqual([tags[0]])

    expect(projectMetaRowsForAssistant([
      {id: 1, name: 'People', type: 'array', extra: true},
      {id: 2, name: 'Year', type: 'number'},
    ], 1)).toEqual([
      {id: 1, name: 'People', type: 'array'},
    ])
  })

  it('searches media/tags via SQL without loading the full tables', () => {
    const db = createAssistantQueryDb()

    expect(searchMediaRowsByQuery(db, '', 10)).toEqual([])
    expect(searchMediaRowsByQuery(db, 'ada', 10)).toEqual([
      {id: 1, name: 'Ada', path: '/films/Ada.mp4'},
    ])
    expect(searchMediaRowsByQuery(db, 'other', 10)).toEqual([
      {id: 3, name: 'Quiet', path: '/other/clip.mp4'},
    ])
    expect(searchMediaRowsByQuery(db, 'a', 1)).toHaveLength(1)

    expect(searchTagRowsByQuery(db, '', 2)).toEqual([
      {id: 1, name: 'Ada', metaId: 1},
      {id: 2, name: 'Bob', metaId: 1},
    ])
    expect(searchTagRowsByQuery(db, 'bo', 10)).toEqual([
      {id: 2, name: 'Bob', metaId: 1},
    ])
    // Literal % in the name must not become a LIKE wildcard.
    expect(searchTagRowsByQuery(db, 'Carol%', 10)).toEqual([
      {id: 3, name: 'Carol%', metaId: 2},
    ])
  })
})
