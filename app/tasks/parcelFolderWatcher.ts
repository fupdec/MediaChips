import path from 'path'
import os from 'os'
import fs from 'fs'
import {createHash} from 'crypto'
import watcher from '@parcel/watcher'
import {isPathUnderExcluded} from '../../api/utils/watchedFolderExcludes'
import {normalizeMediaPath} from '../../api/utils/normalizeUserPath'
import {
  needsPollingForPath,
  stabilityThresholdMs,
} from '../../api/utils/watchPathHints'

export type FolderWatcherEvent = 'add' | 'unlink' | 'ready' | 'error'

type Listener = (...args: unknown[]) => void

export type WatchFoldersInput = {
  /** Absolute folder roots to watch (one subscription / poller each). */
  folderPaths: string[]
  /** Extensions per folder path (no leading dot), as built by the WS client. */
  extensionsByFolder: Record<string, string[]>
  excludedPaths?: string[]
}

/**
 * Thin EventEmitter-like wrapper around @parcel/watcher that mirrors the
 * chokidar surface used by watcherWsHandler: add / unlink / ready / error / close.
 *
 * - Folder roots only (chokidar ≥4 dropped globs).
 * - Extension + exclude + dotfile filtering in JS.
 * - awaitWriteFinish-style settle on create.
 * - Network /Volumes / UNC → snapshot polling via getEventsSince.
 */
export class ParcelFolderWatcher {
  private listeners = new Map<FolderWatcherEvent, Listener[]>()
  private subscriptions: Array<{unsubscribe: () => Promise<void>}> = []
  private pollTimers: ReturnType<typeof setInterval>[] = []
  private pendingCreates = new Map<string, ReturnType<typeof setTimeout>>()
  private closed = false
  private readyEmitted = false
  private readonly excluded: string[]
  private readonly extByFolder: Array<{root: string; rootKey: string; exts: Set<string>}>

  constructor(private readonly input: WatchFoldersInput) {
    this.excluded = (input.excludedPaths || [])
      .map((item) => normalizeMediaPath(item))
      .filter(Boolean)

    this.extByFolder = Object.entries(input.extensionsByFolder || {}).map(([root, exts]) => {
      const normalized = normalizeMediaPath(root) || root
      return {
        root: normalized,
        rootKey: normalized.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, ''),
        exts: new Set((exts || []).map((ext) => String(ext || '').replace(/^\./, '').toLowerCase())),
      }
    })
  }

  on(event: FolderWatcherEvent, listener: Listener): this {
    const list = this.listeners.get(event) || []
    list.push(listener)
    this.listeners.set(event, list)
    return this
  }

  private emit(event: FolderWatcherEvent, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) || []) {
      try {
        listener(...args)
      } catch (error) {
        console.error('ParcelFolderWatcher listener error:', error)
      }
    }
  }

  async start(): Promise<void> {
    const roots = [...new Set(
      (this.input.folderPaths.length
        ? this.input.folderPaths
        : Object.keys(this.input.extensionsByFolder || {})
      ).map((item) => normalizeMediaPath(item) || item).filter(Boolean),
    )]

    if (!roots.length) {
      this.emitReady()
      return
    }

    await Promise.all(roots.map((root) => this.watchRoot(root)))
    // Ready is emitted via notifyReady() after the handler attaches listeners.
  }

  /** Call after `.on('ready', …)` so the handler does not miss the event. */
  notifyReady(): void {
    this.emitReady()
  }

  private async watchRoot(root: string): Promise<void> {
    if (needsPollingForPath(root)) {
      await this.startPolling(root)
      return
    }

    try {
      const subscription = await watcher.subscribe(
        root,
        (err, events) => {
          if (this.closed) return
          if (err) {
            this.emit('error', err)
            return
          }
          this.handleNativeEvents(events || [], root)
        },
        {ignore: ['**/.*', '**/.*/**']},
      )
      this.subscriptions.push(subscription)
    } catch (error) {
      // Fall back to polling when native subscribe fails (some network mounts).
      console.warn('Parcel subscribe failed, falling back to polling:', root, error)
      await this.startPolling(root)
    }
  }

  private async startPolling(root: string): Promise<void> {
    const snapshotPath = snapshotFileFor(root)
    try {
      await watcher.writeSnapshot(root, snapshotPath)
    } catch (error) {
      this.emit('error', error)
      return
    }

    const intervalMs = 1000
    const timer = setInterval(() => {
      void this.pollOnce(root, snapshotPath)
    }, intervalMs)
    this.pollTimers.push(timer)
  }

  private async pollOnce(root: string, snapshotPath: string): Promise<void> {
    if (this.closed) return
    try {
      const events = await watcher.getEventsSince(root, snapshotPath)
      await watcher.writeSnapshot(root, snapshotPath)
      this.handleNativeEvents(events || [], root)
    } catch (error) {
      this.emit('error', error)
    }
  }

  private handleNativeEvents(
    events: Array<{type: string; path: string}>,
    root: string,
  ): void {
    const settleMs = stabilityThresholdMs(needsPollingForPath(root))

    for (const event of events) {
      const filePath = event.path
      if (!filePath || this.shouldIgnore(filePath)) continue
      if (!this.matchesWatchedExtension(filePath)) continue

      if (event.type === 'create') {
        this.queueCreate(filePath, settleMs)
      } else if (event.type === 'delete') {
        this.cancelCreate(filePath)
        this.emit('unlink', filePath)
      }
      // updates ignored — media watcher only cares about add/unlink
    }
  }

  private queueCreate(filePath: string, settleMs: number): void {
    this.cancelCreate(filePath)
    const timer = setTimeout(() => {
      this.pendingCreates.delete(filePath)
      if (this.closed) return
      // File may have been deleted during settle.
      try {
        if (!fs.existsSync(filePath)) return
      } catch {
        return
      }
      this.emit('add', filePath)
    }, settleMs)
    this.pendingCreates.set(filePath, timer)
  }

  private cancelCreate(filePath: string): void {
    const timer = this.pendingCreates.get(filePath)
    if (timer) {
      clearTimeout(timer)
      this.pendingCreates.delete(filePath)
    }
  }

  private shouldIgnore(filePath: string): boolean {
    if (/(^|[\/\\])\../.test(filePath)) return true
    return isPathUnderExcluded(filePath, this.excluded)
  }

  private matchesWatchedExtension(filePath: string): boolean {
    if (!this.extByFolder.length) return true

    const normalized = normalizeMediaPath(filePath) || filePath
    const key = normalized.replace(/\\/g, '/').toLowerCase()
    const ext = path.extname(normalized).replace(/^\./, '').toLowerCase()
    if (!ext) return false

    let best: {rootKey: string; exts: Set<string>} | null = null
    for (const entry of this.extByFolder) {
      if (key === entry.rootKey || key.startsWith(`${entry.rootKey}/`)) {
        if (!best || entry.rootKey.length > best.rootKey.length) {
          best = entry
        }
      }
    }
    if (!best) return false
    return best.exts.has(ext)
  }

  private emitReady(): void {
    if (this.readyEmitted || this.closed) return
    this.readyEmitted = true
    this.emit('ready')
  }

  async close(): Promise<void> {
    this.closed = true
    for (const timer of this.pendingCreates.values()) clearTimeout(timer)
    this.pendingCreates.clear()
    for (const timer of this.pollTimers) clearInterval(timer)
    this.pollTimers = []

    await Promise.all(this.subscriptions.map(async (sub) => {
      try {
        await sub.unsubscribe()
      } catch {
        // ignore
      }
    }))
    this.subscriptions = []
  }
}

export async function watchFolders(input: WatchFoldersInput): Promise<ParcelFolderWatcher> {
  const instance = new ParcelFolderWatcher(input)
  await instance.start()
  return instance
}

function snapshotFileFor(root: string): string {
  const hash = createHash('sha1').update(root).digest('hex').slice(0, 16)
  return path.join(os.tmpdir(), `mediachips-watch-${hash}.txt`)
}
