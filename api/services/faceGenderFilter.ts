/** Pure gender filter / softmax helpers (no ORT). */

export type FaceGender = 'female' | 'male'
export type FaceGenderFilter = 'both' | FaceGender

/** Below this softmax confidence, treat gender as unknown and keep the face. */
export const GENDER_MIN_CONFIDENCE = 0.6

export function normalizeGenderFilter(value: unknown): FaceGenderFilter {
  const raw = String(value ?? 'both').trim().toLowerCase()
  if (raw === 'female' || raw === 'male') return raw
  return 'both'
}

export function passesGenderFilter(
  gender: FaceGender | null | undefined,
  filter: FaceGenderFilter,
  confidence?: number | null,
): boolean {
  if (filter === 'both') return true
  // Keep the face when gender is unknown/uncertain so a model blip does not wipe detections.
  if (!gender) return true
  if (confidence != null && Number.isFinite(confidence) && confidence < GENDER_MIN_CONFIDENCE) {
    return true
  }
  return gender === filter
}

export function softmax2(a: number, b: number): [number, number] {
  const max = Math.max(a, b)
  const ea = Math.exp(a - max)
  const eb = Math.exp(b - max)
  const sum = ea + eb
  return [ea / sum, eb / sum]
}
