import {mkdtemp, writeFile, rm} from 'fs/promises'
import {tmpdir} from 'os'
import path from 'path'
import {afterEach, expect, it, vi} from 'vitest'
import {createFileProbeCache} from './fileProbeCache'

const directories: string[] = []
afterEach(async () => {
  vi.useRealTimers()
  await Promise.all(directories.splice(0).map(dir => rm(dir, {recursive: true, force: true})))
})
async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), 'probe-cache-'))
  directories.push(dir)
  const file = path.join(dir, 'video.mp4')
  await writeFile(file, 'video')
  return file
}
it('coalesces concurrent requests and isolates returned payloads', async () => {
  const file = await fixture()
  const probe = vi.fn(async () => ({format: {duration: 42}}))
  const cached = createFileProbeCache(probe)
  const [a, b] = await Promise.all([cached(file), cached(file)])
  a.format.duration = 0
  expect(b.format.duration).toBe(42)
  expect((await cached(file)).format.duration).toBe(42)
  expect(probe).toHaveBeenCalledTimes(1)
})
it('invalidates a replaced file', async () => {
  const file = await fixture()
  const probe = vi.fn(async () => ({duration: 42}))
  const cached = createFileProbeCache(probe)
  await cached(file)
  await writeFile(file, 'changed video')
  await cached(file)
  expect(probe).toHaveBeenCalledTimes(2)
})
it('retries failed probes', async () => {
  const file = await fixture()
  const probe = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({duration: 42})
  const cached = createFileProbeCache(probe)
  await expect(cached(file)).rejects.toThrow('offline')
  await expect(cached(file)).resolves.toEqual({duration: 42})
  expect(probe).toHaveBeenCalledTimes(2)
})
it('expires results and bounds the number of cached files', async () => {
  const a = await fixture()
  const b = await fixture()
  const probe = vi.fn(async () => ({duration: 42}))
  const cached = createFileProbeCache(probe, {ttlMs: 100, maxEntries: 1})
  vi.useFakeTimers({toFake: ['Date']})
  await cached(a)
  vi.advanceTimersByTime(101)
  await cached(a)
  await cached(b)
  await cached(a)
  expect(probe).toHaveBeenCalledTimes(4)
})
