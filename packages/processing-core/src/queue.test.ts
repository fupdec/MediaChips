// @vitest-environment node
import {expect, it} from 'vitest'
import {createProcessingQueue, DEFAULT_PROCESSING_LIMITS} from './index'
it('bounds concurrency and queue length, cancels queued work and releases the slot', async () => {
  const queue = createProcessingQueue({...DEFAULT_PROCESSING_LIMITS, concurrency: 1, maxQueued: 1})
  let release!: () => void
  const first = queue.run(() => new Promise<void>(resolve => { release = resolve }))
  await Promise.resolve()
  const controller = new AbortController()
  let executed = false
  const second = queue.run(async () => { executed = true }, controller.signal)
  await expect(queue.run(async () => {})).rejects.toThrow('processing_queue_full')
  const cancelled = expect(second).rejects.toThrow()
  controller.abort(); await cancelled; release(); await first
  await queue.run(async () => {})
  expect(executed).toBe(false)
})
it('aborts a running job at its deadline and permits the next job', async () => {
  const queue = createProcessingQueue({...DEFAULT_PROCESSING_LIMITS, timeoutMs: 20})
  const first = queue.run(signal => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), {once: true})))
  const second = queue.run(async () => 42)
  await expect(first).rejects.toThrow('processing_timeout')
  expect(await second).toBe(42)
})
it('rejects invalid resource limits before executing a job', () => {
  expect(() => createProcessingQueue({...DEFAULT_PROCESSING_LIMITS, concurrency: 0})).toThrow('Invalid processing limit')
  expect(() => createProcessingQueue({...DEFAULT_PROCESSING_LIMITS, threads: 100})).toThrow('Invalid processing limit')
})
