import {describe, expect, it} from 'vitest'
import {chapterTitleFromMark} from './markChapterTitle'

describe('chapterTitleFromMark', () => {
  it('prefers tag names and strips html', () => {
    expect(chapterTitleFromMark({'tag.name': '<b>Ada</b>'})).toBe('Ada')
    expect(chapterTitleFromMark({type: 'favorite'})).toBe('Favorite')
    expect(chapterTitleFromMark({type: 'bookmark', text: '<i>Hi</i>'})).toBe('Hi')
    expect(chapterTitleFromMark({type: 'bookmark'})).toBe('Bookmark')
    expect(chapterTitleFromMark({text: 'Note'})).toBe('Note')
    expect(chapterTitleFromMark({type: 'meta'})).toBe('Mark')
    expect(chapterTitleFromMark({type: 'scene'})).toBe('Scene')
    expect(chapterTitleFromMark({})).toBe('Mark')
  })
})
