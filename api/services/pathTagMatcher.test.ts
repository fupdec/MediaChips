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

  it('recombines dotted First.Last performer names in filenames', () => {
    const parsed = extractPathPhrases(
      '/Volumes/pron/#!torrents/2026.01.23/MomsTeachSex.26.01.03.Koda.Monroe.1080p.mp4',
    )
    const phraseTokens = parsed.phrases.map((phrase) => phrase.tokens.join(' '))

    expect(phraseTokens).toContain('koda monroe')
    expect(phraseTokens).toContain('moms teach sex')
  })

  it('treats zip gallery paths as folders without a zip token', () => {
    const parsed = extractPathPhrases('/media/Nature/album.zip!/nested/DSC_001.jpg')
    expect(parsed.folders).toEqual(['media', 'Nature', 'album', 'nested'])
    const tokens = parsed.phrases.flatMap((phrase) => phrase.tokens)
    expect(tokens).toContain('nature')
    expect(tokens).toContain('album')
    expect(tokens).not.toContain('zip')
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

  it('matches performer from zip basename on virtual zip paths under # folders', () => {
    const tags = [
      tag(1, 'Allie Foster'),
      tag(2, 'Interracial', websiteMeta, 'DogFart'),
    ]
    const path = '/Volumes/pron/_photo/#DogFart/allie_foster.zip!/001.jpg'
    expect(matchNames(path, tags)).toEqual(['Allie Foster'])
    expect(matchNames(path, tags, websiteMeta)).toEqual(['Interracial'])
    const batch = matchPathsToTagsBatch(
      [
        { path, mediaId: 10 },
        { path: '/Volumes/pron/_photo/#DogFart/allie_foster.zip!/002.jpg', mediaId: 11 },
      ],
      tags,
      { preferLongestMatch: true, minTokenLength: 2 },
    )
    expect(batch.filter((m) => m.tagId === 1).map((m) => m.mediaId).sort()).toEqual([10, 11])
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

  it('T16: matches multi-word performer inside longer folder name', () => {
    const tags = [
      tag(1, 'Silvia Saint'),
      tag(2, 'QTGMC', websiteMeta),
    ]

    expect(matchNames(
      '/Volumes/pron/#!torrents/Silvia Saint QTGMC/Silvia Saint and Nikita Denise - 100 Percent Silvia Scene 1.mkv',
      tags,
    )).toEqual(['Silvia Saint'])
    expect(matchNames(
      '/Volumes/pron/#!torrents/Silvia Saint QTGMC/Silvia Saint and Nikita Denise - 100 Percent Silvia Scene 1.mkv',
      tags,
      websiteMeta,
    )).toEqual(['QTGMC'])
  })

  it('T17: matches both performers joined by and in filename', () => {
    const tags = [
      tag(1, 'Silvia Saint'),
      tag(2, 'Nikita Denise'),
    ]

    expect(matchNames(
      '/library/Silvia Saint and Nikita Denise - Scene 1.mkv',
      tags,
    )).toEqual(['Silvia Saint', 'Nikita Denise'])
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

  it('T18: matches dotted First.Last performer in adult release filename', () => {
    const tags = [
      tag(1, 'Koda Monroe'),
      tag(2, 'Arianny Koda'),
      tag(3, 'Moms Teach Sex', websiteMeta),
    ]

    expect(matchNames(
      '/Volumes/pron/#!torrents/2026.01.23/MomsTeachSex.26.01.03.Koda.Monroe.1080p.mp4',
      tags,
    )).toEqual(['Koda Monroe'])
    expect(matchNames(
      '/Volumes/pron/#!torrents/2026.01.23/MomsTeachSex.26.01.03.Koda.Monroe.1080p.mp4',
      tags,
      websiteMeta,
    )).toEqual(['Moms Teach Sex'])
  })

  it('T19: matches hyphen and underscore First-Last / First_Last names', () => {
    const tags = [tag(1, 'Koda Monroe')]

    expect(matchNames('/library/Koda-Monroe.1080p.mp4', tags)).toEqual(['Koda Monroe'])
    expect(matchNames('/library/Koda_Monroe_1080p.mp4', tags)).toEqual(['Koda Monroe'])
  })

  it('matches glued FirstLast filename to spaced tag name', () => {
    const tags = [tag(1, 'Jadynn Stone')]

    expect(matchNames("/downloads/Jadynnstone vs Jmac's.mp4", tags)).toEqual(['Jadynn Stone'])
  })

  it('matches First+Last path parts to spaced tag name', () => {
    const tags = [tag(1, 'Dilyla Bloom')]

    expect(matchNames('/downloads/Dilyla+Bloom+09.mp4', tags)).toEqual(['Dilyla Bloom'])
  })

  it('matches spaced synonym against glued path token', () => {
    const tags = [tag(1, 'Kelly Melons', performerMeta, 'Kelly Tea')]

    expect(matchNames('/downloads/KellyTea_scene.mp4', tags)).toEqual(['Kelly Melons'])
  })

  it('does not let compact Isa Bella steal Isabella paths', () => {
    const tags = [
      tag(1, 'Isabella'),
      tag(2, 'Isa Bella'),
    ]

    expect(matchNames('/videos/Isabella/scene.mp4', tags)).toEqual(['Isabella'])
    expect(matchNames('/videos/Isa Bella/scene.mp4', tags)).toEqual(['Isa Bella'])
  })

  it('strips non-letters from path tokens before matching', () => {
    const tags = [tag(1, "Jmac")]

    expect(matchNames("/downloads/Jmac's-scene_01.mp4", tags)).toEqual(['Jmac'])
    expect(matchNames('/downloads/Jmac.1080p.mp4', tags)).toEqual(['Jmac'])
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
