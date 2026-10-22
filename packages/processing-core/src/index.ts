import {spawn, execFile} from 'child_process'
import fs from 'fs'
import path from 'path'

export type ProcessingLimits = {concurrency: number; maxQueued: number; threads: number; timeoutMs: number; maxInputBytes: number; maxOutputBytes: number; maxAllocationBytes: number; maxMemoryBytes: number}
export const DEFAULT_PROCESSING_LIMITS: ProcessingLimits = {concurrency: 1, maxQueued: 16, threads: 2, timeoutMs: 10 * 60_000,
  maxInputBytes: 2 * 1024 ** 3, maxOutputBytes: 512 * 1024 ** 2, maxAllocationBytes: 128 * 1024 ** 2, maxMemoryBytes: 768 * 1024 ** 2}
export function validateLimits(limits: ProcessingLimits) {
  const maximum: ProcessingLimits = {concurrency: 4, maxQueued: 100, threads: 8, timeoutMs: 3_600_000, maxInputBytes: 16 * 1024 ** 3, maxOutputBytes: 4 * 1024 ** 3, maxAllocationBytes: 512 * 1024 ** 2, maxMemoryBytes: 4 * 1024 ** 3}
  for (const key of Object.keys(maximum) as (keyof ProcessingLimits)[]) if (!Number.isSafeInteger(limits[key]) || limits[key] < 1 || limits[key] > maximum[key]) throw new Error(`Invalid processing limit: ${key}`)
  return Object.freeze({...limits})
}
export function createProcessingQueue(raw: ProcessingLimits = DEFAULT_PROCESSING_LIMITS) {
  const limits = validateLimits(raw)
  let active = 0
  const queued: Array<() => void> = []
  return {limits, run<T>(action: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(signal.reason)
    if (active >= limits.concurrency && queued.length >= limits.maxQueued) return Promise.reject(new Error('processing_queue_full'))
    return new Promise<T>((resolve, reject) => {
      let started = false
      const cancel = () => { if (!started) { const index = queued.indexOf(start); if (index >= 0) queued.splice(index, 1); reject(signal?.reason || new Error('cancelled')) } }
      const start = () => {
        started = true; signal?.removeEventListener('abort', cancel); active++
        const controller = new AbortController(), abort = () => controller.abort(signal?.reason)
        signal?.addEventListener('abort', abort, {once: true})
        const timer = setTimeout(() => controller.abort(new Error('processing_timeout')), limits.timeoutMs)
        Promise.resolve().then(() => { controller.signal.throwIfAborted(); return action(controller.signal) }).then(resolve, reject).finally(() => {
          clearTimeout(timer); signal?.removeEventListener('abort', abort); active--; queued.shift()?.()
        })
      }
      signal?.addEventListener('abort', cancel, {once: true})
      if (active < limits.concurrency) start(); else queued.push(start)
    })
  }}
}
export type ProcessingContext = {input: string; directory: string; ffmpeg: string; limits: ProcessingLimits; signal: AbortSignal}
/** Only generated local filenames reach ffmpeg. Remote URLs and user argument strings are excluded. */
export async function runFfmpeg(context: ProcessingContext, args: string[], output: string) {
  const {signal, limits} = context
  signal.throwIfAborted()
  await new Promise<void>((resolve, reject) => {
    const child = spawn(context.ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-max_alloc', String(limits.maxAllocationBytes),
      '-protocol_whitelist', 'file,pipe', '-max_pixels', '16777216', '-threads', String(limits.threads), '-filter_threads', String(limits.threads), ...args,
      '-threads', String(limits.threads), '-fs', String(limits.maxOutputBytes), output], {stdio: 'ignore'})
    let limitExceeded = false, memoryExceeded = false, checkingMemory = false, closed = false
    let checks = 0
    const kill = () => child.kill('SIGKILL')
    const timer = setInterval(() => {
      try { if (fs.statSync(output).size >= limits.maxOutputBytes) { limitExceeded = true; kill() } } catch {}
      if (++checks % 5 === 0 && !checkingMemory && child.pid) {
        checkingMemory = true
        const windows = process.platform === 'win32'
        const program = windows ? 'powershell.exe' : '/bin/ps'
        const args = windows ? ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Id ${child.pid}).WorkingSet64`]
          : ['-o', 'rss=', '-p', String(child.pid)]
        execFile(program, args, {timeout: 2000, windowsHide: true}, (err, stdout) => {
          checkingMemory = false
          if (closed || err) return
          const bytes = Number(stdout.trim()) * (windows ? 1 : 1024)
          if (Number.isFinite(bytes) && bytes > limits.maxMemoryBytes) { memoryExceeded = true; kill() }
        })
      }
    }, 100)
    signal.addEventListener('abort', kill, {once: true})
    child.once('error', err => { closed = true; clearInterval(timer); signal.removeEventListener('abort', kill); reject(err) })
    child.once('close', code => {
      closed = true; clearInterval(timer); signal.removeEventListener('abort', kill)
      if (signal.aborted) reject(signal.reason)
      else if (memoryExceeded) reject(new Error('processing_memory_limit'))
      else if (limitExceeded || (fs.existsSync(output) && fs.statSync(output).size >= limits.maxOutputBytes)) reject(new Error('processing_output_limit'))
      else if (code !== 0) reject(new Error('processing_failed'))
      else if (!fs.existsSync(output) || fs.statSync(output).size === 0) reject(new Error('processing_empty_result'))
      else resolve()
    })
  })
  return path.resolve(output)
}
