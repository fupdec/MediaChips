import {describe, expect, it} from 'vitest'
import {
  AUTO_CHAPTER_TYPE,
  autoChapterLabel,
  isAutoChapterMark,
  parseScenePtsTimes,
  refineSceneTimestamps,
} from './autoChapterDetect'

describe('autoChapterDetect', () => {
  it('parses pts_time values from ffmpeg showinfo logs', () => {
    const log = `
[Parsed_showinfo_1 @ 0x] n:0 pts:123 pts_time:12.345
[Parsed_showinfo_1 @ 0x] n:1 pts:456 pts_time:45.6
junk pts_time:0.0 more
pts_time=90.25
`
    expect(parseScenePtsTimes(log)).toEqual([12.345, 45.6, 0, 90.25])
  })

  it('refines timestamps with min gap, duration clamp, and chapter cap', () => {
    const refined = refineSceneTimestamps(
      [0.2, 3, 12, 15, 40, 41, 70, 85],
      100,
      {minGapSec: 10, maxChapters: 4},
    )
    expect(refined[0]).toBe(0)
    expect(refined).toEqual([0, 12, 40, 70])
  })

  it('labels auto chapters and recognizes replaceable marks only', () => {
    expect(autoChapterLabel(1)).toBe('Chapter 1')
    expect(isAutoChapterMark({type: AUTO_CHAPTER_TYPE, text: 'Chapter 2', tagId: null})).toBe(true)
    expect(isAutoChapterMark({type: AUTO_CHAPTER_TYPE, text: null, tagId: null})).toBe(true)
    expect(isAutoChapterMark({type: 'bookmark', text: 'Chapter 1', tagId: null})).toBe(false)
    expect(isAutoChapterMark({type: AUTO_CHAPTER_TYPE, text: 'Fight', tagId: null})).toBe(false)
    expect(isAutoChapterMark({type: AUTO_CHAPTER_TYPE, text: 'Chapter 1', tagId: 9})).toBe(false)
  })
})
