import {beforeEach, describe, expect, it, vi} from 'vitest'

const mocks = vi.hoisted(() => ({
  embedText: vi.fn(),
  banList: {value: ''},
  tags: [] as Array<{name: string}>,
}))

vi.mock('./embeddingModel', () => ({
  embedText: mocks.embedText,
  cosineSimilarity: (a: number[], b: number[]) => {
    const dot = a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0)
    const norm = (v: number[]) => Math.sqrt(v.reduce((sum, value) => sum + value * value, 0))
    return dot / (norm(a) * norm(b) || 1)
  },
}))
vi.mock('../db/repositories/settings', () => ({
  createSettingsRepository: () => ({
    findByOption: () => (mocks.banList.value ? {value: mocks.banList.value} : undefined),
  }),
}))
vi.mock('../db/repositories/tags', () => ({
  createTagsRepository: () => ({findAllLookup: () => mocks.tags}),
}))

import {suggestTagsFromMedia} from './tagSuggester'

const db = {drizzle: {}, sqlite: {}} as never
const media = (...paths: string[]) => paths.map((path) => ({path})) as never

beforeEach(() => {
  mocks.embedText.mockReset()
  mocks.banList.value = ''
  mocks.tags = []
})

describe('suggestTagsFromMedia without ML', () => {
  it('suggests recurring path words and counts the files they appear in', async () => {
    const result = await suggestTagsFromMedia(db, media(
      '/Movies/Alice/a.mp4', '/Movies/Alice/b.mp4', '/Movies/Bob/c.mp4',
    ), {maxWords: 1})
    const alice = result.find((item) => item.word === 'alice')
    const bob = result.find((item) => item.word === 'bob')
    expect(alice?.docs).toBe(2)
    expect(bob?.docs).toBe(1)
    expect(result.indexOf(alice!)).toBeLessThan(result.indexOf(bob!))
    expect(mocks.embedText).not.toHaveBeenCalled()
  })

  it('leaves out tags that already exist, matched case-insensitively', async () => {
    mocks.tags = [{name: 'ALICE'}]
    const result = await suggestTagsFromMedia(db, media('/Movies/Alice/a.mp4'), {maxWords: 1})
    expect(result.map((item) => item.word)).not.toContain('alice')
  })

  it('keeps existing tags when excludeExisting is false', async () => {
    mocks.tags = [{name: 'alice'}]
    const result = await suggestTagsFromMedia(db, media('/Movies/Alice/a.mp4'), {maxWords: 1, excludeExisting: false})
    expect(result.map((item) => item.word)).toContain('alice')
  })

  it('uses tags passed in settings instead of reading them from the database', async () => {
    mocks.tags = [{name: 'alice'}]
    const result = await suggestTagsFromMedia(db, media('/Movies/Alice/a.mp4'), {maxWords: 1, tags: [{name: 'other'}]})
    expect(result.map((item) => item.word)).toContain('alice')
  })

  it('ignores a ban list that is not a valid JSON array', async () => {
    const files = media('/Movies/Alice/a.mp4')
    expect((await suggestTagsFromMedia(db, files, {maxWords: 1, banListRaw: 'alice'})).map((item) => item.word)).toContain('alice')
    expect((await suggestTagsFromMedia(db, files, {maxWords: 1, banListRaw: '{"a":1}'})).map((item) => item.word)).toContain('alice')
  })

  it('drops words from the ban list in settings or from the saved option', async () => {
    const files = media('/Movies/Alice/a.mp4', '/Movies/Bob/b.mp4')
    const bySettings = await suggestTagsFromMedia(db, files, {maxWords: 1, banListRaw: JSON.stringify(['Alice'])})
    expect(bySettings.map((item) => item.word)).not.toContain('alice')
    expect(bySettings.map((item) => item.word)).toContain('bob')

    mocks.banList.value = JSON.stringify(['bob'])
    const byOption = await suggestTagsFromMedia(db, files, {maxWords: 1})
    expect(byOption.map((item) => item.word)).not.toContain('bob')
  })

  it('honours the limit and never goes below one result', async () => {
    const files = media('/M/Alice/a.mp4', '/M/Bob/b.mp4', '/M/Carol/c.mp4')
    expect((await suggestTagsFromMedia(db, files, {maxWords: 1, limit: 2})).length).toBeLessThanOrEqual(2)
    expect((await suggestTagsFromMedia(db, files, {maxWords: 1, limit: -5})).length).toBe(1)
  })

  it('treats a zero or missing limit as the default of 1000', async () => {
    const files = media('/M/Alice/a.mp4', '/M/Bob/b.mp4', '/M/Carol/c.mp4')
    expect((await suggestTagsFromMedia(db, files, {maxWords: 1, limit: 0})).length).toBe(3)
  })

  it('returns nothing for an empty library', async () => {
    expect(await suggestTagsFromMedia(db, [], {})).toEqual([])
  })
})

describe('suggestTagsFromMedia with ML clustering', () => {
  it('merges similar single words and keeps the more frequent spelling', async () => {
    mocks.embedText.mockImplementation(async (_db: unknown, word: string) => {
      if (word === 'alice' || word === 'alicia') return [1, 0]
      return [0, 1]
    })
    const result = await suggestTagsFromMedia(db, media(
      '/M/Alice/a.mp4', '/M/Alice/b.mp4', '/M/Alice/c.mp4', '/M/Alicia/d.mp4', '/M/Bob/e.mp4',
    ), {maxWords: 1, useML: true, clusterThreshold: 0.9})
    const merged = result.find((item) => item.word === 'alice')
    expect(merged?.cluster).toEqual(expect.arrayContaining(['alice', 'alicia']))
    expect(result.find((item) => item.word === 'alicia')).toBeUndefined()
    expect(result.find((item) => item.word === 'bob')?.cluster).toEqual(['bob'])
  })

  it('does not merge multi-word phrases, so their word order survives', async () => {
    mocks.embedText.mockResolvedValue([1, 0])
    const result = await suggestTagsFromMedia(db, media(
      '/M/Cheryl Blossom/a.mp4', '/M/Cheryl Blossom/b.mp4', '/M/Blossom Cheryl/c.mp4',
    ), {maxWords: 2, useML: true, clusterThreshold: 0.5})
    const phrases = result.filter((item) => item.words === 2).map((item) => item.word)
    expect(phrases).toContain('cheryl blossom')
    expect(phrases).toContain('blossom cheryl')
  })

  it('keeps unrelated words separate', async () => {
    mocks.embedText.mockImplementation(async (_db: unknown, word: string) => (word === 'alice' ? [1, 0] : [0, 1]))
    const result = await suggestTagsFromMedia(db, media('/M/Alice/a.mp4', '/M/Bob/b.mp4'), {maxWords: 1, useML: true})
    expect(result.find((item) => item.word === 'alice')?.cluster).toEqual(['alice'])
    expect(result.find((item) => item.word === 'bob')?.cluster).toEqual(['bob'])
  })
})
