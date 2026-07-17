/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import type { ApiDb } from '../types/db'
import { ensureSearchFtsIndex } from '../db/searchFts'
import {
  searchMediaByName,
  searchMediaByBookmark,
  searchTagsByName,
  searchTagsByBookmark,
  searchGlobal,
} from './globalSearch'

function createSearchTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL,
      name TEXT,
      bookmark TEXT,
      mediaTypeId INTEGER,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE videoMetadata (
      mediaId INTEGER PRIMARY KEY,
      width INTEGER,
      height INTEGER
    );

    CREATE TABLE imageMetadata (
      mediaId INTEGER PRIMARY KEY,
      width INTEGER,
      height INTEGER
    );

    CREATE TABLE tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      synonyms TEXT,
      bookmark TEXT,
      metaId INTEGER,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE tagsInMedia (
      mediaId INTEGER NOT NULL,
      tagId INTEGER NOT NULL,
      metaId INTEGER NOT NULL,
      PRIMARY KEY (mediaId, tagId, metaId)
    );

    INSERT INTO media (path, name, bookmark, mediaTypeId, createdAt, updatedAt) VALUES
      ('/a.mp4', 'Action Hero', 'favorite scene notes', 1, '2024-01-01', '2024-01-01'),
      ('/b.mp4', 'Drama Night', NULL, 1, '2024-01-01', '2024-01-01'),
      ('/c.mp4', 'Актер дня', NULL, 1, '2024-01-01', '2024-01-01'),
      ('/d.mp4', 'Quiet Film', 'watched on vacation trip', 1, '2024-01-01', '2024-01-01');

    INSERT INTO tags (name, synonyms, bookmark, metaId, createdAt, updatedAt) VALUES
      ('Actor', 'Performer', NULL, 1, '2024-01-01', '2024-01-01'),
      ('Director', NULL, 'vacation notes here', 1, '2024-01-01', '2024-01-01'),
      ('YasmiButt', 'anal, gape', NULL, 2, '2024-01-01', '2024-01-01'),
      ('Anal Gape', NULL, NULL, 3, '2024-01-01', '2024-01-01'),
      ('Lana Analise', NULL, NULL, 2, '2024-01-01', '2024-01-01'),
      ('Режиссёр', 'исполнитель', NULL, 1, '2024-01-01', '2024-01-01');

    INSERT INTO tagsInMedia (mediaId, tagId, metaId) VALUES
      (2, 1, 1);
  `)

  ensureSearchFtsIndex(sqlite)

  const db = { sqlite } as ApiDb

  return { sqlite, db }
}

describe('globalSearch FTS', () => {
  it('finds media by prefix using FTS', async () => {
    const { sqlite, db } = createSearchTestDb()

    try {
      const results = await searchMediaByName(db, 'act', 10) as Array<{ name?: string }>
      expect(results).toHaveLength(1)
      expect(results[0].name).toBe('Action Hero')
    } finally {
      sqlite.close()
    }
  })

  it('finds tags by name using FTS', async () => {
    const { sqlite, db } = createSearchTestDb()

    try {
      const byName = await searchTagsByName(db, 'act', 10) as Array<{ name?: string; matchSource?: string }>
      expect(byName.some((tag) => tag.name === 'Actor')).toBe(true)
      expect(byName.find((tag) => tag.name === 'Actor')?.matchSource).toBe('name')

      const bySynonym = await searchTagsByName(db, 'perform', 10) as Array<{
        name?: string
        matchSource?: string
        matchedSynonyms?: string[]
      }>
      expect(bySynonym.some((tag) => tag.name === 'Actor')).toBe(true)
      expect(bySynonym.find((tag) => tag.name === 'Actor')?.matchSource).toBe('synonym')
      expect(bySynonym.find((tag) => tag.name === 'Actor')?.matchedSynonyms).toContain('Performer')
    } finally {
      sqlite.close()
    }
  })

  it('matches tags by synonyms while rejecting incidental name prefixes', async () => {
    const { sqlite, db } = createSearchTestDb()

    try {
      const results = await searchTagsByName(db, 'anal', 10) as Array<{
        name?: string
        matchSource?: string
        matchedSynonyms?: string[]
      }>
      const names = results.map((tag) => tag.name)

      expect(names).toContain('Anal Gape')
      expect(names).toContain('YasmiButt')
      expect(names).not.toContain('Lana Analise')

      const yasmi = results.find((tag) => tag.name === 'YasmiButt')
      expect(yasmi?.matchSource).toBe('synonym')
      expect(yasmi?.matchedSynonyms).toContain('anal')
    } finally {
      sqlite.close()
    }
  })

  it('returns slim media fields only', async () => {
    const { sqlite, db } = createSearchTestDb()

    try {
      const results = await searchMediaByName(db, 'act', 10) as Array<Record<string, unknown>>
      expect(results).toHaveLength(1)
      expect(Object.keys(results[0]).sort()).toEqual(['height', 'id', 'mediaTypeId', 'name', 'path', 'width'])
    } finally {
      sqlite.close()
    }
  })

  it('combines media and tag search', async () => {
    const { sqlite, db } = createSearchTestDb()

    try {
      const results = await searchGlobal(db, 'act', 10)
      expect(results.media.map((item) => (item as {name?: string}).name).sort()).toEqual(['Action Hero', 'Drama Night'])
      const action = results.media.find((item) => (item as {name?: string}).name === 'Action Hero') as {
        matchSource?: string
      }
      const drama = results.media.find((item) => (item as {name?: string}).name === 'Drama Night') as {
        matchSource?: string
        matchedTags?: Array<{name: string}>
      }
      expect(action?.matchSource).toBe('name')
      expect(drama?.matchSource).toBe('tag')
      expect(drama?.matchedTags?.some((tag) => tag.name === 'Actor')).toBe(true)
      expect(results.tags.some((tag) => tag.name === 'Actor')).toBe(true)
    } finally {
      sqlite.close()
    }
  })

  it('finds tags within a meta category', async () => {
    const { sqlite, db } = createSearchTestDb()

    try {
      const results = await searchTagsByName(db, 'anal', {limit: 10, metaId: 2})
      const names = results.map((tag) => tag.name)
      expect(names).toContain('YasmiButt')
      expect(names).not.toContain('Anal Gape')
    } finally {
      sqlite.close()
    }
  })

  it('includes media linked to matching tags in global search', async () => {
    const { sqlite, db } = createSearchTestDb()

    try {
      const results = await searchGlobal(db, 'perform', 10)
      const drama = results.media.find((item) => item.name === 'Drama Night') as {
        matchSource?: string
        matchedTags?: Array<{id: number; name: string}>
      } | undefined
      expect(drama).toBeTruthy()
      expect(drama?.matchSource).toBe('tag')
      expect(drama?.matchedTags?.some((tag) => tag.name === 'Actor')).toBe(true)
      expect(results.tags.some((tag) => tag.name === 'Actor')).toBe(true)
    } finally {
      sqlite.close()
    }
  })

  it('finds media and tags with non-ascii names', async () => {
    const { sqlite, db } = createSearchTestDb()

    try {
      const media = await searchMediaByName(db, 'акт', 10) as Array<{ name?: string }>
      expect(media).toHaveLength(1)
      expect(media[0].name).toBe('Актер дня')

      const tags = await searchTagsByName(db, 'реж', 10) as Array<{ name?: string }>
      expect(tags.some((tag) => tag.name === 'Режиссёр')).toBe(true)
    } finally {
      sqlite.close()
    }
  })

  it('finds media by bookmark notes', async () => {
    const { sqlite, db } = createSearchTestDb()

    try {
      const results = await searchMediaByBookmark(db, 'vacation', 10) as Array<{
        name?: string
        matchSource?: string
        matchedBookmark?: string
      }>
      expect(results).toHaveLength(1)
      expect(results[0].name).toBe('Quiet Film')
      expect(results[0].matchSource).toBe('bookmark')
      expect(results[0].matchedBookmark).toBe('watched on vacation trip')
    } finally {
      sqlite.close()
    }
  })

  it('finds tags by bookmark notes', async () => {
    const { sqlite, db } = createSearchTestDb()

    try {
      const results = await searchTagsByBookmark(db, 'vacation', 10)
      expect(results).toHaveLength(1)
      expect(results[0].name).toBe('Director')
      expect(results[0].matchSource).toBe('bookmark')
      expect(results[0].matchedBookmark).toBe('vacation notes here')
    } finally {
      sqlite.close()
    }
  })

  it('includes bookmark matches in global search and merges with name hits', async () => {
    const { sqlite, db } = createSearchTestDb()

    try {
      const byBookmark = await searchGlobal(db, 'vacation', 10)
      expect(byBookmark.media.some((item) => (item as {name?: string}).name === 'Quiet Film')).toBe(true)
      expect(byBookmark.tags.some((tag) => tag.name === 'Director')).toBe(true)

      const quiet = byBookmark.media.find((item) => (item as {name?: string}).name === 'Quiet Film') as {
        matchSource?: string
        matchedBookmark?: string
      }
      expect(quiet?.matchSource).toBe('bookmark')
      expect(quiet?.matchedBookmark).toContain('vacation')

      const byBoth = await searchGlobal(db, 'favorite', 10)
      const action = byBoth.media.find((item) => (item as {name?: string}).name === 'Action Hero') as {
        matchSource?: string
        matchedBookmark?: string
      }
      expect(action?.matchSource).toBe('bookmark')
      expect(action?.matchedBookmark).toBe('favorite scene notes')

      const byNameAndBookmark = await searchGlobal(db, 'action', 10)
      const actionByName = byNameAndBookmark.media.find((item) => (item as {name?: string}).name === 'Action Hero') as {
        matchSource?: string
        matchedBookmark?: string
      }
      // "action" matches name; bookmark "favorite scene notes" does not match "action"
      expect(actionByName?.matchSource).toBe('name')
    } finally {
      sqlite.close()
    }
  })

  it('reports both when media name and bookmark match the same query', async () => {
    const { sqlite, db } = createSearchTestDb()

    try {
      sqlite.prepare(`UPDATE media SET bookmark = 'action notes' WHERE name = 'Action Hero'`).run()
      ensureSearchFtsIndex(sqlite)

      const results = await searchGlobal(db, 'action', 10)
      const action = results.media.find((item) => (item as {name?: string}).name === 'Action Hero') as {
        matchSource?: string
        matchedBookmark?: string
      }
      expect(action?.matchSource).toBe('both')
      expect(action?.matchedBookmark).toBe('action notes')
    } finally {
      sqlite.close()
    }
  })
})
