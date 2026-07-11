/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'

import {
  buildTagPathIndex,
  exactMatchPath,
  extractPathPhrases,
  matchPathToTags,
  matchPathToTagsFromPhrases,
  matchPathToTagsFromPhrasesWithIndex,
  matchPathsToTagsBatch,
} from '../../shared/pathParser/core'

type TestTag = {
  id: number
  metaId: number
  name: string
  synonyms?: string | null
}

const performerMeta = 1
const websiteMeta = 2

function tag(id: number, name: string, metaId = performerMeta, synonyms?: string): TestTag {
  return { id, metaId, name, synonyms }
}

function matchNames(
  filePath: string,
  tags: TestTag[],
  metaId = performerMeta,
  options: { matchPrecision?: number } = {},
) {
  return matchPathToTags(filePath, 1, tags, {
    preferLongestMatch: true,
    matchPrecision: options.matchPrecision ?? 0.5,
  })
    .filter((match) => Number(match.metaId) === metaId)
    .map((match) => tags.find((item) => item.id === match.tagId)?.name)
    .filter(Boolean)
}

describe('extractPathPhrases', () => {
  it('splits comma-separated performers inside parentheses', () => {
    const parsed = extractPathPhrases('/library/(Tina Black, China Rogers)/scene.mp4')
    const phraseTokens = parsed.phrases.map((phrase) => phrase.tokens.join(' '))

    expect(phraseTokens).toContain('tina black')
    expect(phraseTokens).toContain('china rogers')
  })

  it('keeps hash-number tokens distinct from shorter numbers', () => {
    const parsed = extractPathPhrases('/library/Series Name #100/scene.mp4')
    const tokens = parsed.phrases.flatMap((phrase) => phrase.tokens)

    expect(tokens).toContain('100')
    expect(tokens).not.toContain('10')
  })
})

describe('path tag matching', () => {
  it('T01: prefers Usha White over Usha on multi-word path', () => {
    const tags = [
      tag(1, 'Usha'),
      tag(2, 'Usha White'),
    ]

    expect(matchNames('/videos/Usha White/scene.mp4', tags)).toEqual(['Usha White'])
  })

  it('T02: does not match Usha on Lusha path', () => {
    const tags = [tag(1, 'Usha')]

    expect(matchNames('/videos/Lusha/scene.mp4', tags)).toEqual([])
  })

  it('T03: does not match Black China from comma-separated performers', () => {
    const tags = [tag(1, 'Black China')]

    expect(matchNames('/videos/(Tina Black, China Rogers)/scene.mp4', tags)).toEqual([])
  })

  it('T04: matches comma-separated performers individually', () => {
    const tags = [
      tag(1, 'Tina Black'),
      tag(2, 'China Rogers'),
    ]

    expect(matchNames('/videos/(Tina Black, China Rogers)/scene.mp4', tags)).toEqual([
      'Tina Black',
      'China Rogers',
    ])
  })

  it('T05: matches Series 100 but not Series 10 for #100 folder', () => {
    const tags = [
      tag(1, 'Series 10'),
      tag(2, 'Series 100'),
    ]

    expect(matchNames('/library/Series Name #100/scene.mp4', tags)).toEqual(['Series 100'])
  })

  it('T06: matches mononym with trailing dot in folder name', () => {
    const tags = [tag(1, 'Usha')]

    expect(matchNames('/videos/Usha./scene.mp4', tags)).toEqual(['Usha'])
  })

  it('T07: matches Isa Bella but not Isabella on Isa Bella path', () => {
    const tags = [
      tag(1, 'Isabella'),
      tag(2, 'Isa Bella'),
    ]

    expect(matchNames('/videos/Isa Bella/scene.mp4', tags)).toEqual(['Isa Bella'])
  })

  it('T08: matches Isabella but not Isa Bella on Isabella path', () => {
    const tags = [
      tag(1, 'Isabella'),
      tag(2, 'Isa Bella'),
    ]

    expect(matchNames('/videos/Isabella/scene.mp4', tags)).toEqual(['Isabella'])
  })

  it('T09: matches performer from parenthetical filename', () => {
    const tags = [tag(1, 'Actor')]

    expect(matchNames('/library/scenes/(Actor)/2024-01-01 clip.mp4', tags)).toEqual(['Actor'])
  })

  it('T10: matches website folder name', () => {
    const tags = [
      tag(1, 'Brazzers', websiteMeta),
    ]

    expect(matchNames('/library/Brazzers/unrelated.mp4', tags, websiteMeta)).toEqual(['Brazzers'])
  })

  it('applies longest match for website tags too', () => {
    const tags = [
      tag(1, 'Brazzers', websiteMeta),
      tag(2, 'Brazzers Exxtra', websiteMeta),
    ]

    expect(matchNames('/library/Brazzers Exxtra/scene.mp4', tags, websiteMeta)).toEqual(['Brazzers Exxtra'])
  })

  it('tokenizes path once when matching multiple tags', () => {
    const tags = [
      tag(1, 'Usha'),
      tag(2, 'Usha White'),
      tag(3, 'Tina Black'),
    ]
    const parsed = extractPathPhrases('/videos/Usha White/(Tina Black, Other)/scene.mp4')
    const matches = matchPathToTags('/videos/Usha White/(Tina Black, Other)/scene.mp4', 1, tags, {
      preferLongestMatch: true,
    })

    expect(parsed.phrases.length).toBeGreaterThan(0)
    expect(matches.map((match) => match.tagId)).toEqual([2, 3])
  })

  it('supports exactMatchPath helper', () => {
    expect(exactMatchPath('/videos/Isa Bella/scene.mp4', tag(1, 'Isa Bella'))).toBe(true)
    expect(exactMatchPath('/videos/Isa Bella/scene.mp4', tag(1, 'Isabella'))).toBe(false)
  })

  it('index lookup returns the same matches as phrase scan', () => {
    const tags = [
      tag(1, 'Usha'),
      tag(2, 'Usha White'),
      tag(3, 'Tina Black'),
      tag(4, 'Brazzers Exxtra', websiteMeta),
    ]
    const filePath = '/videos/Usha White/(Tina Black, Other)/Brazzers Exxtra/scene.mp4'
    const parsed = extractPathPhrases(filePath)
    const index = buildTagPathIndex(tags)

    const indexed = matchPathToTagsFromPhrasesWithIndex(parsed, 1, index, {
      preferLongestMatch: true,
    })
    const scanned = matchPathToTagsFromPhrases(parsed, 1, tags, {
      preferLongestMatch: true,
    })

    expect(indexed.map((match) => match.tagId).sort()).toEqual(scanned.map((match) => match.tagId).sort())
  })

  it('T11: does not match InSex from unrelated sex token in filename', () => {
    const tags = [tag(1, 'InSex', websiteMeta)]

    expect(matchNames(
      '/Volumes/pron/Abbey Brooks/lethalhardcore/female-sex-surrogate-scene1_1080p.mp4',
      tags,
      websiteMeta,
    )).toEqual([])
  })

  it('T12: does not match Avi Love from unrelated love token in filename', () => {
    const tags = [tag(1, 'Avi Love')]

    expect(matchNames('/Volumes/pron/Gianna Michaels/onlyfans/Sending love.mp4', tags)).toEqual([])
  })

  it('T13: does not match V Monroe from monroe token without V prefix', () => {
    const tags = [tag(1, 'V Monroe')]

    expect(matchNames('/library/Monroe/scene.mp4', tags)).toEqual([])
  })

  it('T11b: matches InSex from dedicated folder segment', () => {
    const tags = [tag(1, 'InSex', websiteMeta)]

    expect(matchNames('/library/InSex/scene.mp4', tags, websiteMeta)).toEqual(['InSex'])
  })

  it('T12b: matches Avi Love from dedicated folder segment', () => {
    const tags = [tag(1, 'Avi Love')]

    expect(matchNames('/library/Avi Love/scene.mp4', tags)).toEqual(['Avi Love'])
  })

  it('T13b: matches V Monroe from dedicated folder segment', () => {
    const tags = [tag(1, 'V Monroe')]

    expect(matchNames('/library/V Monroe/scene.mp4', tags)).toEqual(['V Monroe'])
  })

  it('T14: strict precision ignores single-word tag from filename subphrase', () => {
    const tags = [tag(1, 'Love')]

    expect(matchNames('/library/onlyfans/Sending love.mp4', tags, performerMeta, {
      matchPrecision: 0,
    })).toEqual([])
  })

  it('T15: permissive precision allows single-word tag from filename subphrase', () => {
    const tags = [tag(1, 'Love')]

    expect(matchNames('/library/onlyfans/Sending love.mp4', tags, performerMeta, {
      matchPrecision: 1,
    })).toEqual(['Love'])
  })

  it('batch matching matches per-path matching', () => {
    const tags = [
      tag(1, 'Usha White'),
      tag(2, 'Tina Black'),
    ]
    const paths = [
      { path: '/videos/Usha White/scene.mp4', mediaId: 10 },
      { path: '/videos/(Tina Black)/scene.mp4', mediaId: 11 },
    ]

    const batchMatches = matchPathsToTagsBatch(paths, tags, { preferLongestMatch: true })
    const singleMatches = paths.flatMap((item) =>
      matchPathToTags(item.path, item.mediaId, tags, { preferLongestMatch: true }),
    )

    expect(batchMatches.map((match) => `${match.mediaId}:${match.tagId}`).sort())
      .toEqual(singleMatches.map((match) => `${match.mediaId}:${match.tagId}`).sort())
  })
})
