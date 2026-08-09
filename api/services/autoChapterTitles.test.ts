import {describe, expect, it} from 'vitest'
import {
  buildHeuristicChapterTitles,
  buildTitlesFromVisionLabels,
  chapterTitleStem,
  parseChapterTitlesResponse,
} from './autoChapterTitles'

describe('autoChapterTitles', () => {
  it('stems filenames for context only', () => {
    expect(chapterTitleStem('/Media/Neon_Nights.mp4')).toBe('Neon Nights')
  })

  it('builds positional heuristic titles without the file name', () => {
    const titles = buildHeuristicChapterTitles({
      filePathOrName: 'Neon_Nights.mp4',
      times: [0, 40, 90],
    })
    expect(titles[0]).toBe('Opening · 0:00')
    expect(titles[1]).toBe('Chapter 2 · 0:40')
    expect(titles[2]).toBe('Ending · 1:30')
    expect(titles.join(' ')).not.toMatch(/Neon/i)
  })

  it('builds vision titles from CLIP labels and falls back positionally', () => {
    const titles = buildTitlesFromVisionLabels({
      times: [0, 40, 90],
      labels: [
        {label: 'kiss', score: 0.4},
        null,
        {label: 'outdoor, beach', score: 0.3},
      ],
    })
    expect(titles).toEqual([
      'kiss · 0:00',
      'Chapter 2 · 0:40',
      'outdoor, beach · 1:30',
    ])
    expect(buildTitlesFromVisionLabels({
      times: [0, 40],
      labels: [null, null],
    })).toBeNull()
  })

  it('parses LLM title JSON strictly by count', () => {
    expect(parseChapterTitlesResponse({titles: ['A', 'B']}, 3)).toBeNull()
    expect(parseChapterTitlesResponse({titles: ['A', 'B', 'C']}, 3)).toEqual(['A', 'B', 'C'])
  })
})
