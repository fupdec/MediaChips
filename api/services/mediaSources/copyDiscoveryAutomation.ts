import {runLibraryBackgroundTask} from '../libraryMaintenance'
import fs from 'fs'
import type {ApiDb} from '../../types/db'
import type {CopyDiscoveryTrigger, CopyDiscoveryInput} from '../../../shared/copyDiscovery'
import {pinSourceDb} from './context'
import {copyTriggerEnabled, requestAutomaticCopyDiscovery, rememberCopyDiscoveryRoot, type AutomaticRoot} from './copyDiscoveryTriggers'

type AutoRoot = {id: string; connectionId: string | null; key: string; excluded: string; origin: string; monitor: number; available: number | null; identity: string | null}
type AutoRequest = {rootId: string; reasons: string; generation: number; jobId: string | null; submittedGeneration: number | null; expanded: number}
const rootInput = (root: AutoRoot): AutomaticRoot => ({key: root.key, ...(root.connectionId ? {connectionId: root.connectionId} : {}),
  ...(JSON.parse(root.excluded).length ? {excluded: JSON.parse(root.excluded)} : {})})
const live = ['queued', 'discovering', 'verifying', 'paused']

/** Server-owned scheduler: durable coalescing plus metadata-only reconnect probes. */
export function createCopyDiscoveryAutomation(db: ApiDb, discovery: {
  create(input: CopyDiscoveryInput, triggers?: CopyDiscoveryTrigger[]): {id: string}
  appendToQueued?(input: CopyDiscoveryInput, triggers: CopyDiscoveryTrigger[]): string | null
}, options: {now?: () => number; probe?: (root: string) => Promise<{identity: string} | null>} = {}) {
  const now = options.now || Date.now
  let disposed = false, polling = false, lastPoll = -Infinity
  const seeded = new WeakSet<object>()
  const probes = new Map<string, Promise<{identity: string} | null>>()
  const probe = options.probe || (async (key: string) => {
    // Reuse a hanging filesystem request rather than issuing another one every poll.
    let pending = probes.get(key)
    if (!pending) {
      pending = fs.promises.lstat(key).then(info => info.isDirectory() || info.isFile() ? {identity: `${info.dev}:${info.ino}`} : null)
        .catch((err: NodeJS.ErrnoException) => {
          if (err.code === 'ENOENT' || err.code === 'ENOTDIR' || err.code === 'ENODEV' || err.code === 'ESTALE') return null
          throw err
        }).finally(() => probes.delete(key))
      probes.set(key, pending)
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    try { return await Promise.race([pending, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('probe_timeout')), 1500) })]) }
    finally { clearTimeout(timer) }
  })

  function configured(current: ApiDb) {
    if (!seeded.has(current.sqlite)) {
      for (const job of current.sqlite.prepare("SELECT roots FROM copyDiscoveryJobs WHERE triggers = '[]'").all() as {roots: string}[]) {
        for (const root of JSON.parse(job.roots) as AutomaticRoot[]) rememberCopyDiscoveryRoot(current, root, 'manual')
      }
      seeded.add(current.sqlite)
    }
    const selected = new Set<string>()
    for (const row of current.sqlite.prepare('SELECT path, excludedPaths FROM watchedFolders WHERE watch = 1 AND path IS NOT NULL').all() as {path: string; excludedPaths: string | null}[]) {
      const id = rememberCopyDiscoveryRoot(current, {key: row.path, excluded: row.excludedPaths ? JSON.parse(row.excludedPaths) : []}, 'watched')
      if (id) selected.add(id)
    }
    for (const row of current.sqlite.prepare('SELECT connectionId, rootKey FROM sourceCatalogRoots').all() as {connectionId: string; rootKey: string}[]) {
      const id = rememberCopyDiscoveryRoot(current, {connectionId: row.connectionId, key: row.rootKey}, 'catalog')
      if (id) selected.add(id)
    }
    for (const row of current.sqlite.prepare("SELECT id FROM copyDiscoveryAutoRoots WHERE origin IN ('watched','catalog')").all() as {id: string}[]) {
      if (!selected.has(row.id)) current.sqlite.prepare('DELETE FROM copyDiscoveryAutoRoots WHERE id = ?').run(row.id)
    }
  }
  function flush(current: ApiDb) {
    // An event received during a running check survives as a newer generation.
    for (const request of current.sqlite.prepare('SELECT * FROM copyDiscoveryAutoRequests WHERE jobId IS NOT NULL').all() as AutoRequest[]) {
      const job = current.sqlite.prepare('SELECT state FROM copyDiscoveryJobs WHERE id = ?').get(request.jobId) as {state: string} | undefined
      if (job && live.includes(job.state)) continue
      if (request.generation === request.submittedGeneration) {
        current.sqlite.prepare('DELETE FROM copyDiscoveryAutoRequests WHERE rootId = ?').run(request.rootId)
        current.sqlite.prepare('DELETE FROM copyDiscoveryAutoRoots WHERE id = ? AND monitor = 0').run(request.rootId)
      } else current.sqlite.prepare('UPDATE copyDiscoveryAutoRequests SET jobId = NULL, firstAt = ?, dueAt = ? WHERE rootId = ?').run(now(), now(), request.rootId)
    }
    const due = current.sqlite.prepare('SELECT * FROM copyDiscoveryAutoRequests WHERE jobId IS NULL AND expanded = 0 AND dueAt <= ? ORDER BY dueAt LIMIT 32').all(now()) as AutoRequest[]
    const expansionReasons = [...new Set(due.flatMap(request => (JSON.parse(request.reasons) as CopyDiscoveryTrigger[])
      .filter(reason => copyTriggerEnabled(current, reason))))]
    if (expansionReasons.length) {
      // A returned or changed reference can reveal copies in other selected folders.
      const known = current.sqlite.prepare('SELECT * FROM copyDiscoveryAutoRoots WHERE monitor = 1').all() as AutoRoot[]
      for (const reason of expansionReasons) requestAutomaticCopyDiscovery(current, known.map(rootInput), reason, {now: now() - 2000, expanded: true})
      for (const request of due) current.sqlite.prepare('UPDATE copyDiscoveryAutoRequests SET expanded = 1 WHERE rootId = ?').run(request.rootId)
    }
    // Refresh after expansion because another event may have incremented a generation.
    const ready = current.sqlite.prepare(`SELECT q.* FROM copyDiscoveryAutoRequests q JOIN copyDiscoveryAutoRoots r ON r.id = q.rootId
      WHERE q.jobId IS NULL AND q.dueAt <= ? AND NOT(r.connectionId IS NULL AND r.monitor = 1 AND COALESCE(r.available,0) = 0) ORDER BY q.dueAt LIMIT 32`).all(now()) as AutoRequest[]
    const batch: Array<{request: AutoRequest; root: AutoRoot; reasons: CopyDiscoveryTrigger[]}> = []
    for (const request of ready) {
      const reasons = (JSON.parse(request.reasons) as CopyDiscoveryTrigger[]).filter(reason => copyTriggerEnabled(current, reason))
      if (!reasons.length) {
        current.sqlite.prepare('DELETE FROM copyDiscoveryAutoRequests WHERE rootId = ?').run(request.rootId)
        current.sqlite.prepare('DELETE FROM copyDiscoveryAutoRoots WHERE id = ? AND monitor = 0').run(request.rootId)
        continue
      }
      const root = current.sqlite.prepare('SELECT * FROM copyDiscoveryAutoRoots WHERE id = ?').get(request.rootId) as AutoRoot
      if (root.connectionId && !current.sqlite.prepare('SELECT 1 FROM sourceConnections WHERE id = ?').get(root.connectionId)) {
        current.sqlite.prepare('DELETE FROM copyDiscoveryAutoRoots WHERE id = ?').run(root.id); continue
      }
      // A known disconnected local root waits for a positive reconnect observation.
      if (!root.connectionId && root.monitor && root.available === 0) continue
      batch.push({request, root, reasons})
    }
    if (!batch.length) return
    // Keep independent sources in separate jobs: an offline NAS must not spoil a local inventory.
    const groups = new Map<string, typeof batch>()
    for (const entry of batch.sort((a, b) => Number(!!a.root.connectionId) - Number(!!b.root.connectionId))) {
      const key = entry.root.connectionId || 'local'
      const group = groups.get(key) || []; group.push(entry); groups.set(key, group)
    }
    current.sqlite.transaction(() => {
      for (const group of groups.values()) {
        const input = {roots: group.map(entry => rootInput(entry.root))}
        const triggers = [...new Set(group.flatMap(entry => entry.reasons))]
        // Fold into a job still waiting in the queue so bursts do not pile up dozens of jobs.
        const queuedId = discovery.appendToQueued?.(input, triggers)
        const job = queuedId ? {id: queuedId} : discovery.create(input, triggers)
        for (const {request} of group) current.sqlite.prepare('UPDATE copyDiscoveryAutoRequests SET jobId = ?, submittedGeneration = ? WHERE rootId = ?')
          .run(job.id, request.generation, request.rootId)
      }
    })()
  }
  return {
    tick() {
      return runLibraryBackgroundTask(async () => {
        if (disposed) return
        const pinned = pinSourceDb(db), current = pinned.db
        configured(current); flush(current)
        if (polling || now() - lastPoll < 5000) return
        polling = true; lastPoll = now()
        try {
          const roots = current.sqlite.prepare('SELECT * FROM copyDiscoveryAutoRoots WHERE monitor = 1 AND connectionId IS NULL').all() as AutoRoot[]
          for (let offset = 0; offset < roots.length; offset += 8) {
            await Promise.all(roots.slice(offset, offset + 8).map(async root => {
              try {
                const observation = await probe(root.key)
                pinned.assertCurrent(); if (disposed) return
                // Skip a root whose configuration changed while its filesystem request was pending.
                const latest = current.sqlite.prepare('SELECT * FROM copyDiscoveryAutoRoots WHERE id = ?').get(root.id) as AutoRoot | undefined
                if (!latest || latest.excluded !== root.excluded || !latest.monitor) return
                current.sqlite.prepare('UPDATE copyDiscoveryAutoRoots SET available = ?, identity = ?, observedAt = ? WHERE id = ?')
                  .run(Number(!!observation), observation?.identity || null, now(), root.id)
                if (observation && (root.available !== 1 || root.identity !== observation.identity)) {
                  const alreadyChecking = root.available === null && (current.sqlite.prepare(
                    "SELECT roots FROM copyDiscoveryJobs WHERE mediaId IS NULL AND state IN ('queued','discovering','verifying','paused')"
                  ).all() as {roots: string}[]).some(job => (JSON.parse(job.roots) as AutomaticRoot[])
                    .some(selected => !selected.connectionId && selected.key === root.key))
                  if (!alreadyChecking) requestAutomaticCopyDiscovery(current, [rootInput(root)], 'reconnect', {now: now()})
                }
              } catch { /* A permission failure/timeout is not proof of disconnect; preserve the observation. */ }
            }))
            pinned.assertCurrent(); if (disposed) return
          }
        } finally { polling = false }
      })
    },
    dispose() { disposed = true },
  }
}
