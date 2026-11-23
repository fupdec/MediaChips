/**
 * Paid ("Pro") features and the 30-day trial.
 *
 * Library size is limited by `freeLibraryCap`; these features are limited separately. Everyone who
 * already had the app before this model shipped keeps the features (grandfathered), so nobody loses
 * something they were using. New installs get a full-featured trial.
 */
export const PRO_FEATURES = [
  'cloud_sources',
  'nas_sources',
  'media_servers',
  'ai_search',
  'ai_assistant',
  'faces',
  'duplicate_automerge',
  'multi_library',
] as const

export type ProFeature = typeof PRO_FEATURES[number]

export const PRO_TRIAL_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000

export function isProFeature(value: unknown): value is ProFeature {
  return typeof value === 'string' && (PRO_FEATURES as readonly string[]).includes(value)
}

/** Parse the stored trial start (ISO string); null when missing or invalid. */
export function parseProTrialStart(value: unknown): number | null {
  if (typeof value !== 'string' || !value) return null
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : null
}

/** Whole days left in the trial, 0 when over, null when no trial was started. */
export function proTrialDaysLeft(trialStartedAt: unknown, now: number = Date.now()): number | null {
  const start = parseProTrialStart(trialStartedAt)
  if (start == null) return null
  // A start in the future (clock changed) counts as "just started", never as extra time.
  const elapsed = Math.max(0, now - start)
  const left = PRO_TRIAL_DAYS - Math.floor(elapsed / DAY_MS)
  return Math.max(0, left)
}

export function isProTrialActive(trialStartedAt: unknown, now: number = Date.now()): boolean {
  const left = proTrialDaysLeft(trialStartedAt, now)
  return left != null && left > 0
}

export function hasProAccess(input: {
  registered: boolean
  grandfathered?: boolean
  trialStartedAt?: unknown
  now?: number
}): boolean {
  if (input.registered || input.grandfathered) return true
  return isProTrialActive(input.trialStartedAt, input.now)
}

/**
 * One-time decision at the first launch of the version that ships Pro features.
 * An install that already existed (cap migration ran earlier, or it already holds media) keeps
 * every feature; a brand-new empty install starts the trial. Once settled, never re-run, so a
 * backup restore cannot re-grandfather or restart the trial.
 */
export function decideProAccessMigration(input: {
  settled: boolean
  capWasSettled: boolean
  libraryCount: number
  now?: number
}): {run: false} | {run: true; grandfathered: boolean; trialStartedAt: string} {
  if (input.settled) return {run: false}
  const existingInstall = input.capWasSettled || (Number(input.libraryCount) || 0) > 0
  return {
    run: true,
    grandfathered: existingInstall,
    trialStartedAt: existingInstall ? '' : new Date(input.now ?? Date.now()).toISOString(),
  }
}
