/** Form-facing face detect/match clamps (keep ranges aligned with api/faceSettingsParse). */

export function clampFaceDetectMinScoreForm(value: unknown, fallback = 0.5): number {
  const minScoreRaw = Number(value ?? fallback)
  if (!Number.isFinite(minScoreRaw)) return fallback
  return Math.min(Math.max(minScoreRaw, 0.5), 0.75)
}

export function clampFaceDetectFramesPerVideoForm(value: unknown, fallback = 6): number {
  const framesRaw = Number(value ?? fallback)
  if (!Number.isFinite(framesRaw)) return fallback
  return Math.min(Math.max(Math.round(framesRaw), 1), 99)
}

export function clampFaceMatchCandidateLimitForm(value: unknown, fallback = 10): number {
  const raw = Number(value ?? fallback)
  if (!Number.isFinite(raw)) return fallback
  return Math.min(20, Math.max(3, Math.round(raw)))
}

export function clampFaceMatchConfidenceForm(value: unknown, fallback = 0.55): number {
  const minConfidence = Number(value ?? fallback)
  if (!Number.isFinite(minConfidence)) return fallback
  return Math.min(Math.max(minConfidence, 0.2), 0.95)
}

export function normalizeFaceGenderFilterForm(value: unknown): 'both' | 'female' | 'male' {
  const raw = String(value ?? 'both').trim().toLowerCase()
  if (raw === 'female' || raw === 'male') return raw
  return 'both'
}

export function parseFaceMatchModeForm(value: unknown): 'auto' | 'suggest' {
  return String(value || 'auto') === 'suggest' ? 'suggest' : 'auto'
}

export function parseMatchAfterDetectForm(value: unknown, fallback = true): boolean {
  if (value == null || value === '') return fallback
  const normalized = String(value).toLowerCase()
  return normalized === 'true' || normalized === '1'
}
