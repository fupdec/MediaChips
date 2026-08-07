const HEALTH_SNOOZE_KEY = 'mediachips.healthQueueSnooze'
const DEFAULT_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000

type SnoozeMap = Record<string, number>

function readSnoozeMap(): SnoozeMap {
  try {
    const raw = localStorage.getItem(HEALTH_SNOOZE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as SnoozeMap
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed
  } catch {
    return {}
  }
}

function writeSnoozeMap(map: SnoozeMap) {
  try {
    localStorage.setItem(HEALTH_SNOOZE_KEY, JSON.stringify(map))
  } catch {
    // ignore quota / private mode
  }
}

/** Drop expired entries and return active snoozes. */
export function getActiveHealthSnoozes(now = Date.now()): SnoozeMap {
  const map = readSnoozeMap()
  let changed = false
  for (const [id, expiresAt] of Object.entries(map)) {
    if (!Number.isFinite(expiresAt) || expiresAt <= now) {
      delete map[id]
      changed = true
    }
  }
  if (changed) writeSnoozeMap(map)
  return map
}

export function isHealthQueueItemSnoozed(id: string, now = Date.now()): boolean {
  const expiresAt = getActiveHealthSnoozes(now)[id]
  return Number.isFinite(expiresAt) && Number(expiresAt) > now
}

export function snoozeHealthQueueItem(
  id: string,
  durationMs = DEFAULT_SNOOZE_MS,
  now = Date.now(),
): number {
  const key = String(id || '').trim()
  if (!key) return 0
  const map = getActiveHealthSnoozes(now)
  const expiresAt = now + Math.max(1_000, durationMs)
  map[key] = expiresAt
  writeSnoozeMap(map)
  return expiresAt
}

export function clearHealthQueueSnooze(id: string) {
  const map = readSnoozeMap()
  if (!(id in map)) return
  delete map[id]
  writeSnoozeMap(map)
}
