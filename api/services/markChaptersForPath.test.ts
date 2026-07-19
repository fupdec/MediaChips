import { describe, expect, it } from 'vitest'
import { chapterTitleFromMark, marksToChapters } from './markChaptersForPath'

describe('markChaptersForPath', () => {
  it('builds chapter titles from mark types', () => {
    expect(chapterTitleFromMark({type: 'favorite', time: 1})).toBe('Favorite')
    expect(chapterTitleFromMark({type: 'bookmark', time: 1})).toBe('Bookmark')
    expect(chapterTitleFromMark({type: 'bookmark', text: 'Note', time: 1})).toBe('Note')
    expect(chapterTitleFromMark({type: 'meta', 'tag.name': 'Intro', time: 1})).toBe('Intro')
    expect(chapterTitleFromMark({type: 'meta', tag: {name: 'Outro'}, time: 1})).toBe('Outro')
    expect(chapterTitleFromMark({type: 'bookmark', text: '<b>Hi</b>', time: 1})).toBe('Hi')
  })

  it('maps marks to sorted chapters and skips invalid times', () => {
    expect(marksToChapters([
      {type: 'favorite', time: 40},
      {type: 'bookmark', text: 'Start', time: 5},
      {type: 'meta', 'tag.name': 'Bad', time: Number.NaN},
      {type: 'meta', 'tag.name': 'Neg', time: -1},
    ])).toEqual([
      {title: 'Start', time: 5},
      {title: 'Favorite', time: 40},
    ])
  })
})
