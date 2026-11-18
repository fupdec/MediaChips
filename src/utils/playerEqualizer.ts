/** Centre frequencies (Hz) of the 10 equalizer bands, the usual octave spacing. */
export const PLAYER_EQ_BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const
export const PLAYER_EQ_GAIN_MIN = -12
export const PLAYER_EQ_GAIN_MAX = 12
export const PLAYER_EQ_GAIN_STEP = 0.5

export const PLAYER_EQ_PRESETS = ['flat', 'bass', 'treble', 'vocal', 'rock', 'pop', 'classical'] as const
export type PlayerEqPreset = typeof PLAYER_EQ_PRESETS[number]

export const PLAYER_EQ_PRESET_GAINS: Readonly<Record<PlayerEqPreset, readonly number[]>> = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bass: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  treble: [0, 0, 0, 0, 0, 1, 2, 4, 5, 6],
  vocal: [-3, -2, -1, 1, 3, 4, 3, 1, 0, -1],
  rock: [5, 4, 2, -1, -2, -1, 2, 4, 5, 5],
  pop: [-1, 1, 3, 4, 3, 0, -1, -1, 1, 2],
  classical: [4, 3, 2, 1, -1, -1, 0, 2, 3, 4],
}

export function createFlatEqualizer(): number[] {
  return PLAYER_EQ_BANDS.map(() => 0)
}

export function clampEqGain(value: number): number {
  if (!Number.isFinite(value)) return 0
  const rounded = Math.round(value / PLAYER_EQ_GAIN_STEP) * PLAYER_EQ_GAIN_STEP
  // "+ 0" turns -0 into 0.
  return Math.min(PLAYER_EQ_GAIN_MAX, Math.max(PLAYER_EQ_GAIN_MIN, rounded)) + 0
}

/** Stored or foreign data → a valid list of exactly one gain per band. */
export function normalizeEqGains(value: unknown): number[] {
  if (!Array.isArray(value)) return createFlatEqualizer()
  return PLAYER_EQ_BANDS.map((_, index) => clampEqGain(Number(value[index])))
}

export function isFlatEqualizer(gains: readonly number[]): boolean {
  return gains.every(gain => gain === 0)
}

/** The preset the gains match exactly, or null for a custom curve. */
export function matchEqPreset(gains: readonly number[]): PlayerEqPreset | null {
  return PLAYER_EQ_PRESETS.find(name => PLAYER_EQ_PRESET_GAINS[name].every((gain, i) => gain === gains[i])) ?? null
}

export function formatEqBand(frequency: number): string {
  return frequency >= 1000 ? `${frequency / 1000}k` : String(frequency)
}

export function formatEqGain(gain: number): string {
  return `${gain > 0 ? '+' : ''}${gain}`
}
