const STORAGE_KEY = 'mediachips.player.volume'
const MUTED_KEY = 'mediachips.player.muted'

export type PlayerVolumePrefs = {
  volume: number
  muted: boolean
}

function clampVolume(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 1
  return Math.min(1, Math.max(0, n))
}

export function loadPlayerVolumePrefs(): PlayerVolumePrefs {
  try {
    const rawVolume = localStorage.getItem(STORAGE_KEY)
    const rawMuted = localStorage.getItem(MUTED_KEY)
    return {
      volume: rawVolume == null ? 1 : clampVolume(rawVolume),
      muted: rawMuted === '1' || rawMuted === 'true',
    }
  } catch {
    return {volume: 1, muted: false}
  }
}

export function persistPlayerVolume(volume: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(clampVolume(volume)))
  } catch {
    // ignore quota / private mode
  }
}

export function persistPlayerMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTED_KEY, muted ? '1' : '0')
  } catch {
    // ignore quota / private mode
  }
}
