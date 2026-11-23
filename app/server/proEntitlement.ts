import fs from 'fs'
import path from 'path'

/**
 * Pro access state kept in a file next to config.json.
 *
 * config.json is routinely rewritten, restored from a backup or rebuilt by database discovery. If the
 * "already settled / grandfathered / trial started" decision lived only there, losing the file would make
 * the next launch look like an existing install with media (grandfathered forever) or a fresh one
 * (a new trial). The sidecar is the source of truth; config.json mirrors it for the SPA.
 */
export const PRO_ENTITLEMENT_KEYS = [
  'proAccessSettled',
  'proFeaturesGrandfathered',
  'proTrialStartedAt',
  'proTrialLastSeenAt',
  'proTrialEndNoticeShown',
] as const

export type ProEntitlementKey = typeof PRO_ENTITLEMENT_KEYS[number]
export type ProEntitlement = Partial<Record<ProEntitlementKey, string>>

/** The last-seen clock only advances this often, so ordinary requests do not rewrite the file. */
export const LAST_SEEN_STEP_MS = 60 * 60 * 1000

export function proEntitlementPath(configPath: string): string {
  return path.join(path.dirname(configPath), 'pro-access.json')
}

function time(value: unknown): number | null {
  if (typeof value !== 'string' || !value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function pick(source: Record<string, unknown> | null | undefined): ProEntitlement {
  const picked: ProEntitlement = {}
  for (const key of PRO_ENTITLEMENT_KEYS) {
    const value = source?.[key]
    if (typeof value === 'string') picked[key] = value
  }
  return picked
}

export function readProEntitlement(filePath: string): ProEntitlement | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? pick(parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

/**
 * Combine what is stored with what a client sent. Once settled, who is grandfathered and when the trial
 * started can no longer change; the last-seen clock and the "trial ended" notice only move forward.
 */
export function mergeProEntitlement(stored: ProEntitlement | null, incoming: ProEntitlement, now: number): ProEntitlement {
  const base = stored ?? {}
  const locked = base.proAccessSettled === '1'
  const merged: ProEntitlement = {}

  const settled = locked ? base : incoming
  if (settled.proAccessSettled) merged.proAccessSettled = settled.proAccessSettled
  if (settled.proFeaturesGrandfathered !== undefined) merged.proFeaturesGrandfathered = settled.proFeaturesGrandfathered
  if (settled.proTrialStartedAt !== undefined) merged.proTrialStartedAt = settled.proTrialStartedAt

  // Only meaningful while a trial exists; without one there is nothing to protect from a clock rollback.
  if (merged.proTrialStartedAt) {
    const known = Math.max(time(base.proTrialLastSeenAt) ?? 0, time(incoming.proTrialLastSeenAt) ?? 0)
    const next = Math.max(known, now)
    merged.proTrialLastSeenAt = new Date(next - known >= LAST_SEEN_STEP_MS || !known ? next : known).toISOString()
  }

  if (base.proTrialEndNoticeShown === '1' || incoming.proTrialEndNoticeShown === '1') merged.proTrialEndNoticeShown = '1'
  else if (settled.proAccessSettled) merged.proTrialEndNoticeShown = '0'
  return merged
}

function writeProEntitlement(filePath: string, value: ProEntitlement) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true})
  const tempPath = `${filePath}.tmp`
  const payload = JSON.stringify(value, null, 2)
  fs.writeFileSync(tempPath, payload, 'utf8')
  try {
    fs.renameSync(tempPath, filePath)
  } catch {
    // Bind-mounted files (Docker/Synology) can reject rename; fall back to an in-place write.
    fs.writeFileSync(filePath, payload, 'utf8')
    try { fs.unlinkSync(tempPath) } catch { /* ignore cleanup failures */ }
  }
}

/**
 * Reconcile the in-memory config with the sidecar and persist any change.
 * Nothing is written until some Pro state exists, so a fresh install stays untouched until it settles.
 * Never throws: access state must not break config loading or saving.
 */
export function syncProEntitlement(config: Record<string, unknown>, filePath: string, now: number = Date.now()): void {
  try {
    const stored = readProEntitlement(filePath)
    const incoming = pick(config)
    if (!stored && !incoming.proAccessSettled) return
    const merged = mergeProEntitlement(stored, incoming, now)
    Object.assign(config, merged)
    if (JSON.stringify(stored) !== JSON.stringify(merged)) writeProEntitlement(filePath, merged)
  } catch (error) {
    console.warn('Pro access state sync failed:', error)
  }
}
