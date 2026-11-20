import type { Express } from 'express'
import type { ApiRequest, ApiResponse } from '../../api/types/http'
import {
  getLogDir,
  isLogSource,
  logFilePath,
  readLogHistory,
  readLogTail,
  redactHomeDir,
  sanitizeLogText,
  type LogSource,
} from './appLog'

const DEFAULT_LINES = 500
const MAX_LINES = 2000

function queryString(value: unknown): string {
  return Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '')
}

function resolveSource(req: ApiRequest): LogSource | null {
  const raw = queryString(req.query?.source) || 'server'
  return isLogSource(raw) ? raw : null
}

/**
 * Read-only diagnostics. Registered after the auth middleware, so with a password set
 * these are not reachable without a session. Files are already scrubbed at write time;
 * lines are scrubbed again on read in case an older build wrote them.
 */
export function registerLogRoutes(app: Express, resolveDir: () => string | null = getLogDir) {
  app.get('/api/logs', (req: ApiRequest, res: ApiResponse) => {
    const source = resolveSource(req)
    if (!source) {
      res.status(400).json({error: 'Unknown log source'})
      return
    }
    const dir = resolveDir()
    if (!dir) {
      res.json({source, available: false, lines: [], sizeBytes: 0, path: null})
      return
    }
    const requested = Number.parseInt(queryString(req.query?.lines), 10)
    const maxLines = Number.isFinite(requested)
      ? Math.min(Math.max(requested, 1), MAX_LINES)
      : DEFAULT_LINES
    const tail = readLogTail(dir, source, {maxLines})
    res.json({
      source,
      available: tail.available,
      sizeBytes: tail.sizeBytes,
      path: redactHomeDir(logFilePath(dir, source)),
      lines: tail.lines.map(line => sanitizeLogText(line)),
    })
  })

  app.get('/api/logs/download', (req: ApiRequest, res: ApiResponse) => {
    const source = resolveSource(req)
    const dir = resolveDir()
    if (!source || !dir) {
      res.status(source ? 404 : 400).json({error: source ? 'Log is not available' : 'Unknown log source'})
      return
    }
    const text = sanitizeLogText(readLogHistory(dir, source))
    if (!text) {
      res.status(404).json({error: 'Log is empty'})
      return
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="mediachips-${source}.log.txt"`)
    res.send(text)
  })
}
