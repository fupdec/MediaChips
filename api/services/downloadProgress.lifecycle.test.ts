/** @vitest-environment node */
import {afterEach, describe, expect, it, vi} from 'vitest'
import {iterateTrackedHttpDownload} from './downloadProgress'
import {downloadHttpFile} from './httpFileDownload'

vi.mock('./httpFileDownload', () => ({downloadHttpFile: vi.fn(), downloadHttpFileWithRetries: vi.fn()}))
afterEach(() => vi.resetAllMocks())

describe('download progress iterator lifecycle', () => {
  it.each(['return', 'throw'] as const)('cancels the download when the consumer calls %s', async action => {
    let finish!: () => void
    vi.mocked(downloadHttpFile).mockReturnValue(new Promise<void>(resolve => { finish = resolve }))
    const iterator = iterateTrackedHttpDownload({
      url: 'https://example.invalid/model', destination: '/unused',
      expectedBytes: 100, errorLabel: 'model', label: 'Model',
    })
    await iterator.next()
    await iterator.next()
    const signal = vi.mocked(downloadHttpFile).mock.calls[0][2]!.signal!
    if (action === 'return') await iterator.return(undefined)
    else await expect(iterator.throw(new Error('consumer stopped'))).rejects.toThrow('consumer stopped')
    finish()
    expect(signal.aborted).toBe(true)
  })
})
