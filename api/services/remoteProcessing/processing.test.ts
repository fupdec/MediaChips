// @vitest-environment node
import fs from 'fs'
import path from 'path'
import os from 'os'
import {execFileSync} from 'child_process'
import {afterEach, beforeEach, it, expect, vi} from 'vitest'
import {createRemoteProcessing} from './index'
import {DEFAULT_PROCESSING_LIMITS} from '../../../packages/processing-core/src'
import {getFfmpegPath, getFfprobePath} from '../../utils/ffmpegPaths'
import {createTestDb, closeTestDb, type TestDb} from '../../db/testUtils/createTestDb'
import {createMediaTypesRepository} from '../../db/repositories/mediaTypes'
import {createMediaRepository} from '../../db/repositories/media'
import {sourceConnections, mediaLocations} from '../../db/schema'
import {cloudMediaPath} from '../../../shared/cloudAccounts'
import {READ_SOURCE_CAPABILITIES} from '../../../shared/mediaSources'
import type {ApiDb} from '../../types/db'
import type {SourceReadAdapter} from '../mediaSources/adapter'
import type {RemoteProcessingJob} from '../../../shared/remoteProcessing'
let fixture: TestDb, db: ApiDb, directory: string, mediaId: number, bytes: Buffer, adapter: SourceReadAdapter
const account = '11111111-1111-4111-8111-111111111111'
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-processing-test-'))
  fixture = createTestDb('processing'); db = {...fixture, path: directory}
  const source = path.join(directory, 'source.mp4')
  execFileSync(getFfmpegPath(), ['-nostdin', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=320x180:d=1:r=12', '-c:v', 'libx264', '-threads', '1', source])
  bytes = fs.readFileSync(source)
  const type = createMediaTypesRepository(db.drizzle).create({name: 'video', type: 'video'})
  mediaId = createMediaRepository(db.drizzle).create({path: cloudMediaPath('onedrive', account, 'movie'), mediaTypeId: type.id, filesize: bytes.length}).id
  db.drizzle.insert(sourceConnections).values({id: account, provider: 'onedrive', config: '{}', credentialRef: account, createdAt: '2026'}).run()
  db.drizzle.insert(mediaLocations).values({id: 'location', mediaId, connectionId: account, resourceKey: 'movie', version: 'v1'}).run()
  adapter = {provider: 'onedrive', capabilities: READ_SOURCE_CAPABILITIES, list: vi.fn(), stat: vi.fn(async () => ({resourceKey: 'movie', name: 'movie.mp4', size: bytes.length, isDirectory: false, contentType: 'video/mp4', version: 'v1'})), read: vi.fn(async () => ({status: 200, headers: {}, body: bytes})), close: vi.fn()}
})
afterEach(() => { closeTestDb(fixture); fs.rmSync(directory, {recursive: true, force: true}) })
async function finish(service: ReturnType<typeof createRemoteProcessing>, id: string): Promise<RemoteProcessingJob> {
  for (let i = 0; i < 200; i++) { const job = service.job(db, id); if (!['queued', 'running'].includes(job.state)) return job; await new Promise(resolve => setTimeout(resolve, 20)) }
  throw new Error('test processing timed out')
}
it.each(['frame', 'storyboard', 'transcode'] as const)('produces a real %s derivative and cleans staged originals', async kind => {
  const service = createRemoteProcessing({base: directory, open: async () => adapter})
  const job = service.submit(db, {mediaId, kind, seconds: 0.2, intervalSeconds: 1})
  const result = await finish(service, job.id)
  expect(result).toMatchObject({state: 'completed', resultUrl: expect.any(String)})
  const file = service.result(db, job.id)
  expect(fs.statSync(file).size).toBeGreaterThan(0)
  expect(fs.existsSync(path.join(path.dirname(file), 'input.media'))).toBe(false)
  const probe = JSON.parse(execFileSync(getFfprobePath(), ['-v', 'error', '-show_streams', '-of', 'json', file], {encoding: 'utf8'}))
  expect(probe.streams[0].codec_name).toBe(kind === 'transcode' ? 'h264' : 'mjpeg')
  expect(adapter.close).toHaveBeenCalledOnce()
  service.remove(db, job.id); expect(fs.existsSync(file)).toBe(false)
})
it('rejects an oversized original before downloading', async () => {
  const service = createRemoteProcessing({base: directory, limits: {...DEFAULT_PROCESSING_LIMITS, maxInputBytes: 1}, open: async () => adapter})
  const job = service.submit(db, {mediaId, kind: 'frame'})
  expect(await finish(service, job.id)).toMatchObject({state: 'failed', error: 'processing_input_limit'})
  expect(adapter.read).not.toHaveBeenCalled()
  expect(fs.readdirSync(directory).filter(v => v.startsWith('mc-processing-'))).toHaveLength(0)
})
it('rejects an input that changes during download and removes partial files', async () => {
  const original = await adapter.stat('movie')
  vi.mocked(adapter.stat).mockResolvedValueOnce(original).mockResolvedValue({...original, version: 'v2'})
  const service = createRemoteProcessing({base: directory, open: async () => adapter})
  const job = service.submit(db, {mediaId, kind: 'frame'})
  expect(await finish(service, job.id)).toMatchObject({state: 'failed', error: 'source_changed'})
  expect(fs.readdirSync(directory).filter(v => v.startsWith('mc-processing-'))).toHaveLength(0)
})
it('cannot serve a result after the original card changes', async () => {
  const service = createRemoteProcessing({base: directory, open: async () => adapter})
  const job = service.submit(db, {mediaId, kind: 'frame'})
  expect((await finish(service, job.id)).state).toBe('completed')
  createMediaRepository(db.drizzle).updateById(mediaId, {path: '/different/movie.mp4'})
  expect(() => service.result(db, job.id)).toThrow('source_changed')
})
it('fails an oversized result and deletes its staging directory', async () => {
  const service = createRemoteProcessing({base: directory, limits: {...DEFAULT_PROCESSING_LIMITS, maxOutputBytes: 100}, open: async () => adapter})
  const job = service.submit(db, {mediaId, kind: 'transcode'})
  expect(await finish(service, job.id)).toMatchObject({state: 'failed'})
  expect(fs.readdirSync(directory).filter(v => v.startsWith('mc-processing-'))).toHaveLength(0)
})
it('rejects frame times beyond the actual video duration', async () => {
  const service = createRemoteProcessing({base: directory, open: async () => adapter})
  const job = service.submit(db, {mediaId, kind: 'frame', seconds: 1000})
  expect(await finish(service, job.id)).toMatchObject({state: 'failed', error: 'processing_empty_result'})
  expect(() => service.result(db, job.id)).toThrow('processing_result_unavailable')
})
