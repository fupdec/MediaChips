import {describe, expect, it} from 'vitest'
import {
  PLAYER_EQ_BANDS,
  PLAYER_EQ_PRESET_GAINS,
  PLAYER_EQ_PRESETS,
  clampEqGain,
  createFlatEqualizer,
  formatEqBand,
  formatEqGain,
  isFlatEqualizer,
  matchEqPreset,
  normalizeEqGains,
} from './playerEqualizer'

describe('playerEqualizer', () => {
  it('has a preset curve for every band', () => {
    for (const name of PLAYER_EQ_PRESETS) expect(PLAYER_EQ_PRESET_GAINS[name]).toHaveLength(PLAYER_EQ_BANDS.length)
    expect(isFlatEqualizer(createFlatEqualizer())).toBe(true)
  })

  it('clamps and snaps gains to half a decibel', () => {
    expect(clampEqGain(20)).toBe(12)
    expect(clampEqGain(-20)).toBe(-12)
    expect(clampEqGain(1.3)).toBe(1.5)
    expect(clampEqGain(Number.NaN)).toBe(0)
    expect(Object.is(clampEqGain(-0.1), 0)).toBe(true)
  })

  it('repairs stored data of the wrong shape', () => {
    expect(normalizeEqGains(null)).toEqual(createFlatEqualizer())
    expect(normalizeEqGains([1, 'x', 99])).toEqual([1, 0, 12, 0, 0, 0, 0, 0, 0, 0])
  })

  it('recognises presets and custom curves', () => {
    expect(matchEqPreset([...PLAYER_EQ_PRESET_GAINS.rock])).toBe('rock')
    expect(matchEqPreset(createFlatEqualizer())).toBe('flat')
    expect(matchEqPreset([1, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toBeNull()
  })

  it('formats labels', () => {
    expect(formatEqBand(31)).toBe('31')
    expect(formatEqBand(16000)).toBe('16k')
    expect(formatEqBand(1000)).toBe('1k')
    expect(formatEqGain(3)).toBe('+3')
    expect(formatEqGain(-2.5)).toBe('-2.5')
    expect(formatEqGain(0)).toBe('0')
  })
})
