/** Free-tier library size: registered / grandfathered users have no cap. */
export const FREE_LIBRARY_CAP = 100

/** Soft warning threshold as a fraction of the free cap (e.g. 0.8 → 80 items). */
export const FREE_LIBRARY_SOFT_RATIO = 0.8

export const BUY_ACTIVATION_KEY_URL = 'https://mediachips.app/buy/'

export function isFreeLibraryExempt(input: {
  registered: boolean
  grandfathered?: boolean
}): boolean {
  return Boolean(input.registered || input.grandfathered)
}

export function freeLibraryRemainingSlots(
  libraryCount: number,
  cap: number = FREE_LIBRARY_CAP,
): number {
  const count = Math.max(0, Number(libraryCount) || 0)
  return Math.max(0, cap - count)
}

export function isFreeLibraryAtCap(input: {
  registered: boolean
  grandfathered?: boolean
  libraryCount: number
  cap?: number
}): boolean {
  if (isFreeLibraryExempt(input)) return false
  const cap = input.cap ?? FREE_LIBRARY_CAP
  return (Number(input.libraryCount) || 0) >= cap
}

export function isFreeLibraryNearCap(input: {
  registered: boolean
  grandfathered?: boolean
  libraryCount: number
  cap?: number
  softRatio?: number
}): boolean {
  if (isFreeLibraryExempt(input)) return false
  const cap = input.cap ?? FREE_LIBRARY_CAP
  const softRatio = input.softRatio ?? FREE_LIBRARY_SOFT_RATIO
  const softFloor = Math.floor(cap * softRatio)
  const count = Number(input.libraryCount) || 0
  return count >= softFloor && count < cap
}

/** Block starting a new import when the free library is already full. */
export function shouldBlockFreeLibraryImport(input: {
  registered: boolean
  grandfathered?: boolean
  libraryCount: number
  cap?: number
}): boolean {
  return isFreeLibraryAtCap(input)
}

/**
 * One-time migration when the free-library cap ships.
 * If already settled, do nothing (backup restore must not re-grandfather).
 * If library already exceeds the free cap → grandfathered.
 */
export function decideFreeLibraryCapMigration(input: {
  settled: boolean
  libraryCount: number
  cap?: number
}): {run: false} | {run: true; grandfathered: boolean} {
  if (input.settled) return {run: false}
  const cap = input.cap ?? FREE_LIBRARY_CAP
  const count = Number(input.libraryCount) || 0
  return {
    run: true,
    grandfathered: count > cap,
  }
}
