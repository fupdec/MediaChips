// @vitest-environment node
import {PassThrough, Readable} from 'stream'
import {describe, expect, it, vi} from 'vitest'
import type {NasTransport} from '../nas/transport'
import {createMockDriveTransport, MOCK_FILE_SIZE} from '../cloudDrive/mockTransport'
import {createNasSourceAdapter} from './nasAdapter'
import {createDriveSourceAdapter} from './driveAdapter'
import type {SourceReadAdapter} from './adapter'

const nasTransport = (): NasTransport => ({
  list: vi.fn(async () => [{name: 'sample.mp4', path: 'sample.mp4', size: MOCK_FILE_SIZE, modifiedAt: 1000, isDirectory: false}]),
  stat: vi.fn(async () => ({size: MOCK_FILE_SIZE, modifiedAt: 1000, isDirectory: false})),
  read: vi.fn(async (_key, start, end) => Readable.from([Buffer.alloc(end - start + 1)])),
  close: vi.fn(),
})

describe.each(['nas', 'gdrive'] as const)('%s common reading contract', provider => {
  const setup = (): {adapter: SourceReadAdapter; key: string} => provider === 'nas'
    ? {adapter: createNasSourceAdapter(nasTransport()), key: 'sample.mp4'}
    : {adapter: createDriveSourceAdapter(createMockDriveTransport()), key: 'mock-video-sample'}

  it('lists and stats the same object and reports implemented actions', async () => {
    const {adapter, key} = setup()
    expect(adapter.provider).toBe(provider)
    expect(adapter.capabilities).toEqual({view: true, seek: true, download: true, move: false, delete: false})
    const page = await adapter.list(provider === 'nas' ? '' : 'root')
    const listed = page.entries.find(entry => entry.resourceKey === key)!
    const file = await adapter.stat(key)
    expect(file).toMatchObject({resourceKey: key, size: MOCK_FILE_SIZE, isDirectory: false, contentType: 'video/mp4'})
    expect(file.version).toBe(listed.version)
    adapter.close()
  })

  it('reads an exact byte range through the same interface', async () => {
    const {adapter, key} = setup()
    const result = await adapter.read(key, 'bytes=7-12')
    expect(result.status).toBe(206)
    expect(result.headers['content-range']).toBe(`bytes 7-12/${MOCK_FILE_SIZE}`)
    const chunks: Buffer[] = []
    if (Buffer.isBuffer(result.body)) chunks.push(result.body)
    else for await (const chunk of result.body) chunks.push(Buffer.from(chunk))
    expect(Buffer.concat(chunks)).toEqual(Buffer.alloc(6))
    adapter.close()
  })

  it('rejects cancelled operations before contacting the source', async () => {
    const {adapter, key} = setup()
    const controller = new AbortController()
    controller.abort()
    for (const action of [() => adapter.list('', undefined, controller.signal), () => adapter.stat(key, controller.signal),
      () => adapter.read(key, undefined, controller.signal)]) {
      await expect(action()).rejects.toMatchObject({name: 'AbortError'})
    }
    adapter.close()
  })
})

it('continues NAS listings and passes Drive continuation tokens to the provider', async () => {
  const transport = nasTransport()
  transport.list = vi.fn(async () => Array.from({length: 5001}, (_, n) => ({name: `${n}.mp4`, path: `${n}.mp4`, size: 1, isDirectory: false})))
  const nas = createNasSourceAdapter(transport)
  const first = await nas.list('')
  const second = await nas.list('', first.nextPageToken)
  expect(first.entries).toHaveLength(5000)
  expect(second.entries).toHaveLength(1)
  expect(new Set([...first.entries, ...second.entries].map(entry => entry.resourceKey)).size).toBe(5001)
  expect(second.nextPageToken).toBeUndefined()
  const drive = createMockDriveTransport()
  const list = vi.spyOn(drive, 'listFolder').mockResolvedValue({folderId: 'root', files: [], mock: true, nextPageToken: 'next-page'})
  expect((await createDriveSourceAdapter(drive).list('root', 'previous-page')).nextPageToken).toBe('next-page')
  expect(list).toHaveBeenCalledWith('root', 'previous-page', undefined)
})

it.each(['nas', 'gdrive'] as const)('cancels an active %s byte stream', async provider => {
  const body = new PassThrough()
  const controller = new AbortController()
  let adapter: SourceReadAdapter
  const transport = nasTransport()
  if (provider === 'nas') {
    transport.read = vi.fn(async () => body)
    adapter = createNasSourceAdapter(transport)
  } else {
    const drive = createMockDriveTransport()
    drive.downloadFile = vi.fn(async () => ({status: 200, headers: {}, body}))
    adapter = createDriveSourceAdapter(drive)
  }
  const result = await adapter.read(provider === 'nas' ? 'sample.mp4' : 'mock-video-sample', undefined, controller.signal)
  expect(result.body).toBe(body)
  controller.abort()
  expect(body.destroyed).toBe(true)
  adapter.close()
})

it.each(['nas', 'gdrive'] as const)('cancels a pending %s stat without waiting for the source', async provider => {
  const controller = new AbortController()
  const transport = nasTransport()
  let adapter: SourceReadAdapter
  let started = false
  let finish!: () => void
  const pending = new Promise<void>(resolve => { finish = resolve })
  if (provider === 'nas') {
    transport.stat = vi.fn(async () => { started = true; await pending; return {size: 1, isDirectory: false} })
    adapter = createNasSourceAdapter(transport)
  } else {
    const drive = createMockDriveTransport()
    drive.getFileMeta = vi.fn(async (_key, signal) => {
      expect(signal).toBe(controller.signal)
      started = true; await pending
      return {id: 'sample', name: 'sample.mp4', size: 1, mimeType: 'video/mp4'}
    })
    adapter = createDriveSourceAdapter(drive)
  }
  const request = adapter.stat('sample', controller.signal)
  await vi.waitFor(() => expect(started).toBe(true))
  controller.abort()
  await expect(request).rejects.toMatchObject({name: 'AbortError'})
  if (provider === 'nas') expect(transport.close).toHaveBeenCalled()
  finish()
  adapter.close()
})
