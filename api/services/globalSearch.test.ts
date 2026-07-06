/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import type { ApiDb } from '../types/db'
import { ensureSearchFtsIndex } from '../db/searchFts'
import { searchMediaByName, searchTagsByName, searchGlobal } from './globalSearch'

function createSearchTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL,
      name TEXT,
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
      metaId INTEGER,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    INSERT INTO media (path, name, mediaTypeId, createdAt, updatedAt) VALUES
      ('/a.mp4', 'Action Hero', 1, '2024-01-01', '2024-01-01'),
      ('/b.mp4', 'Drama Night', 1, '2024-01-01', '2024-01-01'),
      ('/c.mp4', 'Актер дня', 1, '2024-01-01', '2024-01-01');

    INSERT INTO tags (name, synonyms, metaId, createdAt, updatedAt) VALUES
      ('Actor', 'Performer', 1, '2024-01-01', '2024-01-01'),
      ('Director', NULL, 1, '2024-01-01', '2024-01-01'),
      ('YasmiButt', 'anal, gape', 2, '2024-01-01', '2024-01-01'),
      ('Anal Gape', NULL, 3, '2024-01-01', '2024-01-01'),
      ('Lana Analise', NULL, 2, '2024-01-01', '2024-01-01'),
      ('Режиссёр', 'исполнитель', 1, '2024-01-01', '2024-01-01');
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
      expect(results.media).toHaveLength(1)
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
})
