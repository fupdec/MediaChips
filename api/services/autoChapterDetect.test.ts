import {describe, expect, it} from 'vitest'
import {
  AUTO_CHAPTER_TYPE,
  autoChapterLabel,
  buildSceneDetectVideoFilter,
  buildSilenceDetectAudioFilter,
  DEFAULT_SCENE_THRESHOLD,
  formatChapterClock,
  isAutoChapterMark,
  parseFfmpegClockToSeconds,
  parseFfmpegProgressTimeSeconds,
  parseScenePtsTimes,
  parseSilenceEndTimes,
  pickEvenlySpacedChapterTimes,
  refineSceneTimestamps,
  resolveAutoChapterSpacing,
  SCENE_DETECT_FPS,
  SCENE_DETECT_WIDTH,
  SILENCE_DETECT_SAMPLE_RATE,
  snapSceneCutsToSilence,
} from './autoChapterDetect'

describe('autoChapterDetect', () => {
  it('builds a fast subsampled scene-detect filter', () => {
    expect(buildSceneDetectVideoFilter(DEFAULT_SCENE_THRESHOLD)).toBe(
      `fps=${SCENE_DETECT_FPS},scale=${SCENE_DETECT_WIDTH}:-2,select='gt(scene\\,${DEFAULT_SCENE_THRESHOLD})',showinfo`,
    )
    expect(buildSilenceDetectAudioFilter(-35, 0.8)).toContain(`aresample=${SILENCE_DETECT_SAMPLE_RATE}`)
    expect(buildSilenceDetectAudioFilter(-35, 0.8)).toContain('silencedetect=noise=-35dB:d=0.8')
  })

  it('parses ffmpeg progress clocks', () => {
    expect(parseFfmpegClockToSeconds('01:02:03.5')).toBeCloseTo(3723.5)
    expect(parseFfmpegClockToSeconds('12:34.5')).toBeCloseTo(754.5)
    expect(parseFfmpegProgressTimeSeconds('frame= 10 fps=3 time=00:01:20.50 bitrate=N/A')).toBeCloseTo(80.5)
    expect(parseFfmpegProgressTimeSeconds('no time here')).toBeNull()
  })

  it('parses pts_time values from ffmpeg showinfo logs', () => {
    const log = `
[Parsed_showinfo_1 @ 0x] n:0 pts:123 pts_time:12.345
[Parsed_showinfo_1 @ 0x] n:1 pts:456 pts_time:45.6
junk pts_time:0.0 more
pts_time=90.25
`
    expect(parseScenePtsTimes(log)).toEqual([12.345, 45.6, 0, 90.25])
  })

  it('parses silence_end times from silencedetect logs', () => {
    const log = `
[silencedetect @ 0x] silence_start: 1.0
[silencedetect @ 0x] silence_end: 2.5 | silence_duration: 1.5
[silencedetect @ 0x] silence_end: 40.0
`
    expect(parseSilenceEndTimes(log)).toEqual([2.5, 40])
  })

  it('snaps scene cuts to nearby silence without adding every silence end', () => {
    expect(snapSceneCutsToSilence([12, 40, 90], [11.5, 41, 200], 2.5)).toEqual([11.5, 41, 90])
  })

  it('budgets fewer, more spaced chapters for long videos', () => {
    const spacing = resolveAutoChapterSpacing(47 * 60)
    expect(spacing.maxChapters).toBeLessThanOrEqual(16)
    expect(spacing.minGapSec).toBeGreaterThanOrEqual(30)
    expect(spacing.minGapSec).toBeLessThanOrEqual(75)
  })

  it('spreads chapters across the timeline instead of packing the opening', () => {
    const denseOpening = Array.from({length: 40}, (_, i) => 10 + i * 10)
    const laterCuts = [600, 900, 1200, 1500, 1800, 2100, 2400, 2700]
    const refined = refineSceneTimestamps([...denseOpening, ...laterCuts], 2800)
    expect(refined[0]).toBe(0)
    expect(refined.length).toBeLessThanOrEqual(16)
    expect(refined.length).toBeGreaterThan(4)
    // Must not keep only the packed opening — later candidates should survive.
    expect(refined[refined.length - 1]).toBeGreaterThan(600)
    const earlyPacked = refined.filter((t) => t > 0 && t < 400).length
    expect(earlyPacked).toBeLessThan(refined.length - 1)
  })

  it('refines timestamps with explicit min gap and chapter cap', () => {
    const refined = refineSceneTimestamps(
      [0.2, 3, 12, 15, 40, 41, 70, 85],
      100,
      {minGapSec: 10, maxChapters: 4},
    )
    expect(refined[0]).toBe(0)
    expect(refined.length).toBeLessThanOrEqual(4)
    expect(pickEvenlySpacedChapterTimes([0, 12, 40, 70, 85], 3, 100, 10)).toEqual([0, 40, 85])
  })

  it('labels auto chapters with clocks and treats chapter-icon bookmarks as replaceable', () => {
    expect(formatChapterClock(65)).toBe('1:05')
    expect(autoChapterLabel(1, 0)).toBe('0:00')
    expect(autoChapterLabel(2, 125)).toBe('2:05')
    expect(isAutoChapterMark({
      type: AUTO_CHAPTER_TYPE,
      icon: 'movie-open-outline',
      text: 'Chapter 2',
      tagId: null,
    })).toBe(true)
    expect(isAutoChapterMark({
      type: AUTO_CHAPTER_TYPE,
      icon: 'movie-open-outline',
      text: '1:05',
      tagId: null,
    })).toBe(true)
    expect(isAutoChapterMark({
      type: AUTO_CHAPTER_TYPE,
      icon: 'movie-open-outline',
      text: 'Opening · Neon',
      tagId: null,
    })).toBe(true)
    expect(isAutoChapterMark({
      type: AUTO_CHAPTER_TYPE,
      icon: 'movie-open-outline',
      text: null,
      tagId: null,
    })).toBe(true)
    expect(isAutoChapterMark({type: 'bookmark', icon: 'bookmark', text: 'Chapter 1', tagId: null})).toBe(false)
    expect(isAutoChapterMark({type: 'scene', text: 'Legacy', tagId: null})).toBe(true)
    expect(isAutoChapterMark({
      type: AUTO_CHAPTER_TYPE,
      icon: 'movie-open-outline',
      text: 'Fight',
      tagId: 9,
    })).toBe(false)
  })
})
