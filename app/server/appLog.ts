import fs from 'fs'
import os from 'os'
import path from 'path'
import util from 'util'

/** Log files live in `<dataDir>/logs`; `main` is written by the Electron shell, `server` by the API. */
export type LogSource = 'server' | 'main'
export const LOG_SOURCES: readonly LogSource[] = ['server', 'main']

export const LOG_MAX_FILE_BYTES = 2 * 1024 * 1024
export const LOG_KEEP_ROTATED = 2
const PENDING_LIMIT = 1000
const FLUSH_DELAY_MS = 250
const CONSOLE_LEVELS = ['log', 'info', 'warn', 'error', 'debug'] as const

const ANSI_PATTERN = /\x1b\[[0-9;]*[A-Za-z]/g

export function isLogSource(value: unknown): value is LogSource {
  return typeof value === 'string' && (LOG_SOURCES as readonly string[]).includes(value)
}

export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, '')
}

/** Keeps credentials out of files that users are likely to paste into bug reports. */
export function redactSecrets(text: string): string {
  return text
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
    .replace(
      /((?:access_token|refresh_token|id_token|client_secret|token|password|api_?key)=)[^&\s"']+/gi,
      '$1[redacted]',
    )
    .replace(
      /(["']?(?:access_token|refresh_token|id_token|client_secret|password|api_?key|authorization)["']?\s*:\s*["'])[^"']*/gi,
      '$1[redacted]',
    )
}

/** Replaces the user's home folder with `~` so shared logs don't leak the account name. */
export function redactHomeDir(text: string, homeDir: string = os.homedir()): string {
  const home = String(homeDir || '').replace(/[\\/]+$/, '')
  if (home.length < 3) return text
  let out = text.split(home).join('~')
  const slashed = home.replace(/\\/g, '/')
  if (slashed !== home) out = out.split(slashed).join('~')
  return out
}

export function sanitizeLogText(text: string, homeDir?: string): string {
  return redactHomeDir(redactSecrets(stripAnsi(text)), homeDir)
}

export function formatLogLine(level: string, message: string, now: Date = new Date(), homeDir?: string): string {
  return `${now.toISOString()} [${level}] ${sanitizeLogText(message, homeDir)}\n`
}

export function logFilePath(dir: string, source: LogSource, rotation = 0): string {
  return path.join(dir, rotation === 0 ? `${source}.log` : `${source}.${rotation}.log`)
}

export class RotatingLogFile {
  private buffer: string[] = []
  private timer: NodeJS.Timeout | null = null
  private size = 0

  constructor(
    private readonly dir: string,
    private readonly source: LogSource,
    private readonly maxBytes = LOG_MAX_FILE_BYTES,
    private readonly keep = LOG_KEEP_ROTATED,
  ) {
    fs.mkdirSync(dir, {recursive: true})
    try {
      this.size = fs.statSync(logFilePath(dir, source)).size
    } catch {
      this.size = 0
    }
  }

  write(line: string): void {
    this.buffer.push(line)
    if (this.timer) return
    this.timer = setTimeout(() => this.flush(), FLUSH_DELAY_MS)
    this.timer.unref?.()
  }

  /** Synchronous so it is also safe from `process.on('exit')`. Never throws. */
  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (!this.buffer.length) return
    const chunk = this.buffer.join('')
    this.buffer = []
    try {
      if (this.size > 0 && this.size + Buffer.byteLength(chunk) > this.maxBytes) this.rotate()
      fs.appendFileSync(logFilePath(this.dir, this.source), chunk)
      this.size += Buffer.byteLength(chunk)
    } catch {
      // Logging must never take the app down.
    }
  }

  private rotate(): void {
    try {
      for (let i = this.keep; i >= 1; i--) {
        const from = logFilePath(this.dir, this.source, i - 1)
        const to = logFilePath(this.dir, this.source, i)
        if (!fs.existsSync(from)) continue
        if (i === this.keep) fs.rmSync(to, {force: true})
        fs.renameSync(from, to)
      }
    } catch {
      // Keep appending to the current file if rotation fails.
    }
    this.size = 0
  }
}

export type LogTail = {
  lines: string[]
  sizeBytes: number
  available: boolean
}

function readFileTail(file: string, maxBytes: number): string {
  let fd: number | null = null
  try {
    fd = fs.openSync(file, 'r')
    const {size} = fs.fstatSync(fd)
    const start = Math.max(0, size - maxBytes)
    const buf = Buffer.alloc(size - start)
    fs.readSync(fd, buf, 0, buf.length, start)
    let text = buf.toString('utf8')
    // Drop a partial first line when the read started mid-file.
    if (start > 0) text = text.slice(text.indexOf('\n') + 1)
    return text
  } catch {
    return ''
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd) } catch { /* ignore */ }
    }
  }
}

function splitLines(text: string): string[] {
  return text.split('\n').filter((line, index, all) => line !== '' || index < all.length - 1)
}

export function readLogTail(
  dir: string,
  source: LogSource,
  options: {maxLines?: number; maxBytes?: number} = {},
): LogTail {
  const maxLines = Math.min(Math.max(Math.floor(options.maxLines ?? 500), 1), 5000)
  const maxBytes = options.maxBytes ?? 512 * 1024
  const current = logFilePath(dir, source)
  if (!fs.existsSync(current)) return {lines: [], sizeBytes: 0, available: false}

  let sizeBytes = 0
  try { sizeBytes = fs.statSync(current).size } catch { /* ignore */ }

  let lines = splitLines(readFileTail(current, maxBytes))
  for (let i = 1; lines.length < maxLines && i <= LOG_KEEP_ROTATED; i++) {
    const rotated = logFilePath(dir, source, i)
    if (!fs.existsSync(rotated)) break
    lines = [...splitLines(readFileTail(rotated, maxBytes)), ...lines]
  }
  return {lines: lines.slice(-maxLines), sizeBytes, available: true}
}

/** Whole retained history for `source`, oldest first, for the "download" button. */
export function readLogHistory(dir: string, source: LogSource): string {
  const parts: string[] = []
  for (let i = LOG_KEEP_ROTATED; i >= 0; i--) {
    const file = logFilePath(dir, source, i)
    if (!fs.existsSync(file)) continue
    try {
      parts.push(fs.readFileSync(file, 'utf8'))
    } catch {
      // skip unreadable file
    }
  }
  return parts.join('')
}

/** Only environment facts that help with display-server / GPU bug reports — never the full env. */
export function describeRuntime(source: LogSource, appVersion?: string): string {
  const env = process.env
  const facts: Record<string, string | number | undefined> = {
    app: appVersion,
    source,
    pid: process.pid,
    platform: `${process.platform}/${process.arch}`,
    os: `${os.type()} ${os.release()}`,
    node: process.versions.node,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  }
  if (process.platform === 'linux') {
    facts.session = env.XDG_SESSION_TYPE
    facts.desktop = env.XDG_CURRENT_DESKTOP
    facts.waylandDisplay = env.WAYLAND_DISPLAY ? 'set' : 'unset'
    facts.x11Display = env.DISPLAY ? 'set' : 'unset'
    facts.appImage = env.APPIMAGE ? 'yes' : 'no'
    facts.disableGpuEnv = env.MEDIA_CHIPS_DISABLE_GPU
  }
  return Object.entries(facts)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${key}=${value}`)
    .join(' ')
}

type LogState = {
  source: LogSource
  writer: RotatingLogFile | null
  pending: string[]
  dir: string | null
  appVersion?: string
}

const CAPTURE_FLAG = Symbol.for('mediaChips.appLog.installed')
let state: LogState | null = null

function emit(level: string, message: string) {
  if (!state) return
  const line = formatLogLine(level, message)
  if (state.writer) {
    state.writer.write(line)
    return
  }
  state.pending.push(line)
  if (state.pending.length > PENDING_LIMIT) state.pending.shift()
}

/** Writes one line to the log without printing it to the console. */
export function writeLog(level: string, message: string): void {
  emit(level, message)
}

/**
 * Starts mirroring `console.*` into memory immediately; call `attachLogDir` once the data folder is known.
 * Console behaviour is unchanged — output still reaches stdout/stderr exactly as before.
 */
export function initAppLog(source: LogSource, appVersion?: string): void {
  if (state) return
  state = {source, writer: null, pending: [], dir: null, appVersion}

  const target = console as unknown as Record<symbol, unknown>
  if (!target[CAPTURE_FLAG]) {
    target[CAPTURE_FLAG] = true
    for (const level of CONSOLE_LEVELS) {
      const original = console[level].bind(console) as (...args: unknown[]) => void
      console[level] = (...args: unknown[]) => {
        try {
          emit(level === 'log' ? 'info' : level, util.format(...args))
        } catch {
          // never let logging break the caller
        }
        original(...args)
      }
    }
  }

  process.on('uncaughtExceptionMonitor', (error, origin) => {
    emit('fatal', `${origin}: ${error?.stack || error}`)
    state?.writer?.flush()
  })
  process.on('exit', (code) => {
    emit('info', `process exit code=${code}`)
    state?.writer?.flush()
  })
}

export function attachLogDir(dir: string): void {
  if (!state || state.writer) return
  try {
    const writer = new RotatingLogFile(dir, state.source)
    state.writer = writer
    state.dir = dir
    writer.write(formatLogLine('info', `==== started ${describeRuntime(state.source, state.appVersion)} ====`))
    for (const line of state.pending) writer.write(line)
    state.pending = []
  } catch {
    // Read-only data folder etc.: keep running without a file.
  }
}

export function getLogDir(): string | null {
  return state?.dir ?? null
}

export function resetAppLogForTests(): void {
  state = null
}
