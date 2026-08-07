import {describe, expect, it} from 'vitest'
import {
  buildHeuristicChapterTitles,
  chapterTitleStem,
  parseChapterTitlesResponse,
} from './autoChapterTitles'

describe('autoChapterTitles', () => {
  it('stems filenames for titles', () => {
    expect(chapterTitleStem('/Media/Neon_Nights.mp4')).toBe('Neon Nights')
  })

  it('builds positional heuristic titles with clocks', () => {
    const titles = buildHeuristicChapterTitles({
      filePathOrName: 'Neon_Nights.mp4',
      times: [0, 40, 90],
    })
    expect(titles[0]).toContain('Opening')
    expect(titles[0]).toContain('0:00')
    expect(titles[1]).toContain('Scene 2')
    expect(titles[2]).toContain('Ending')
    expect(titles[2]).toContain('1:30')
  })

  it('parses LLM title JSON strictly by count', () => {
    expect(parseChapterTitlesResponse({titles: ['A', 'B']}, 3)).toBeNull()
    expect(parseChapterTitlesResponse({titles: ['A', 'B', 'C']}, 3)).toEqual(['A', 'B', 'C'])
  })
})
