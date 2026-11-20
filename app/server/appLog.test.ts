import fs from 'fs'
import os from 'os'
import path from 'path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {
  LOG_KEEP_ROTATED,
  RotatingLogFile,
  formatLogLine,
  isLogSource,
  logFilePath,
  readLogHistory,
  readLogTail,
  redactHomeDir,
  redactSecrets,
  stripAnsi,
} from './appLog'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-log-'))
})

afterEach(() => {
  fs.rmSync(dir, {recursive: true, force: true})
})

describe('log sanitizing', () => {
  it('strips ANSI colours', () => {
    expect(stripAnsi('\x1b[33m⚠️ warn\x1b[0m')).toBe('⚠️ warn')
  })

  it('redacts bearer tokens, query tokens and JSON credentials', () => {
    expect(redactSecrets('Authorization: Bearer abc.def-123')).not.toContain('abc.def')
    expect(redactSecrets('GET /cb?access_token=SECRET&x=1')).toBe('GET /cb?access_token=[redacted]&x=1')
    expect(redactSecrets('{"refresh_token":"SECRET","ok":true}')).not.toContain('SECRET')
    expect(redactSecrets('{"password": "hunter2"}')).not.toContain('hunter2')
  })

  it('keeps ordinary text readable', () => {
    expect(redactSecrets('code=ENOENT while reading /media/a.mp4')).toBe('code=ENOENT while reading /media/a.mp4')
  })

  it('replaces the home folder with ~', () => {
    expect(redactHomeDir('open /home/alice/Videos/a.mp4', '/home/alice')).toBe('open ~/Videos/a.mp4')
    expect(redactHomeDir('C:\\Users\\bob\\x', 'C:\\Users\\bob')).toBe('~\\x')
    expect(redactHomeDir('unchanged', '/')).toBe('unchanged')
  })

  it('formats a timestamped line', () => {
    const line = formatLogLine('warn', '\x1b[31mboom\x1b[0m', new Date('2026-11-19T10:00:00.000Z'), '/home/x')
    expect(line).toBe('2026-11-19T10:00:00.000Z [warn] boom\n')
  })

  it('accepts only known sources', () => {
    expect(isLogSource('server')).toBe(true)
    expect(isLogSource('main')).toBe(true)
    expect(isLogSource('../etc/passwd')).toBe(false)
    expect(isLogSource(undefined)).toBe(false)
  })
})

describe('RotatingLogFile', () => {
  it('writes and tails lines', () => {
    const log = new RotatingLogFile(dir, 'server')
    log.write('one\n')
    log.write('two\n')
    log.write('three\n')
    log.flush()
    const tail = readLogTail(dir, 'server', {maxLines: 2})
    expect(tail.available).toBe(true)
    expect(tail.lines).toEqual(['two', 'three'])
  })

  it('reports an unavailable log when no file exists', () => {
    expect(readLogTail(dir, 'main')).toEqual({lines: [], sizeBytes: 0, available: false})
  })

  it('rotates past the size limit and keeps a bounded history', () => {
    const log = new RotatingLogFile(dir, 'server', 40, LOG_KEEP_ROTATED)
    for (let i = 0; i < 12; i++) {
      log.write(`line-${String(i).padStart(2, '0')}-xxxxxxxxxx\n`)
      log.flush()
    }
    expect(fs.existsSync(logFilePath(dir, 'server', 1))).toBe(true)
    expect(fs.existsSync(logFilePath(dir, 'server', LOG_KEEP_ROTATED + 1))).toBe(false)
    const history = readLogHistory(dir, 'server')
    expect(history.endsWith('line-11-xxxxxxxxxx\n')).toBe(true)
    expect(history.indexOf('line-09')).toBeLessThan(history.indexOf('line-11'))
  })

  it('tails across rotated files when the current one is short', () => {
    const log = new RotatingLogFile(dir, 'server', 30, 2)
    for (let i = 0; i < 6; i++) {
      log.write(`entry-${i}-xxxxxxxx\n`)
      log.flush()
    }
    // 30 bytes fit one 17-byte line, so history is the current file plus two rotated ones.
    const tail = readLogTail(dir, 'server', {maxLines: 10})
    expect(tail.lines).toEqual(['entry-3-xxxxxxxx', 'entry-4-xxxxxxxx', 'entry-5-xxxxxxxx'])
  })
})
