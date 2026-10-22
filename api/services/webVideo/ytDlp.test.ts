// @vitest-environment node
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import axios from 'axios'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import {createHash} from 'crypto'
import {execFile} from 'child_process'
import type {ApiDb} from '../../types/db'
import {extractWebVideo, getYtDlpPath, updateYtDlp, ytDlpAssetName} from './ytDlp'

vi.mock('axios', () => ({default: {get: vi.fn()}}))
vi.mock('child_process', () => {
  const execFile = vi.fn()
  Object.assign(execFile, {[Symbol.for('nodejs.util.promisify.custom')]: (...args: unknown[]) => new Promise((resolve, reject) => {
    execFile(...args, (error: Error | null, stdout: string, stderr: string) => error ? reject(error) : resolve({stdout, stderr}))
  })})
  return {execFile}
})
vi.mock('./network', () => ({publicHttpsAgent: {}, startExtractionProxy: vi.fn(async () => ({url: 'http://127.0.0.1:12345', close: vi.fn()}))}))

describe('managed yt-dlp installation', () => {
  let directory = ''
  let previousFolder: string | undefined
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.stubEnv('MEDIA_CHIPS_YTDLP_PATH', '')
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-ytdlp-'))
    previousFolder = process.app_folder
    process.app_folder = directory
  })
  afterEach(async () => {
    process.app_folder = previousFolder
    vi.unstubAllEnvs()
    await fs.rm(directory, {recursive: true, force: true})
  })

  it('writes a verified official executable atomically and reuses it', async () => {
    const bytes = Buffer.from('verified-test-executable')
    const name = ytDlpAssetName()
    vi.mocked(axios.get).mockResolvedValueOnce({data: {assets: [{name,
      digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      browser_download_url: `https://github.com/yt-dlp/yt-dlp/releases/download/test/${name}`,
    }]}}).mockResolvedValueOnce({data: bytes})
    const binary = await getYtDlpPath({} as ApiDb)
    expect(await fs.readFile(binary)).toEqual(bytes)
    expect(await getYtDlpPath({} as ApiDb)).toBe(binary)
    expect(axios.get).toHaveBeenCalledTimes(2)
    expect(await fs.readdir(path.dirname(binary))).toEqual([name, `${name}.checked`])
  })

  it('never installs a binary with a mismatched checksum', async () => {
    const name = ytDlpAssetName()
    vi.mocked(axios.get).mockResolvedValueOnce({data: {assets: [{name,
      digest: `sha256:${'0'.repeat(64)}`,
      browser_download_url: `https://github.com/yt-dlp/yt-dlp/releases/download/test/${name}`,
    }]}}).mockResolvedValueOnce({data: Buffer.from('wrong')})
    await expect(updateYtDlp({} as ApiDb)).rejects.toThrow('checksum')
    await expect(fs.access(path.join(directory, 'tools', 'yt-dlp', name))).rejects.toThrow()
  })

  it('rejects release metadata pointing outside the official project', async () => {
    const name = ytDlpAssetName()
    vi.mocked(axios.get).mockResolvedValueOnce({data: {assets: [{name,
      digest: `sha256:${'0'.repeat(64)}`, browser_download_url: `https://evil.test/${name}`,
    }]}})
    await expect(updateYtDlp({} as ApiDb)).rejects.toThrow('Invalid yt-dlp release URL')
    expect(axios.get).toHaveBeenCalledTimes(1)
  })

  it('coalesces updates and preserves the working binary on verification failure', async () => {
    const destination = path.join(directory, 'tools', 'yt-dlp', ytDlpAssetName())
    await fs.mkdir(path.dirname(destination), {recursive: true})
    await fs.writeFile(destination, 'working')
    const name = ytDlpAssetName()
    vi.mocked(axios.get).mockResolvedValueOnce({data: {assets: [{name,
      digest: `sha256:${'0'.repeat(64)}`,
      browser_download_url: `https://github.com/yt-dlp/yt-dlp/releases/download/test/${name}`,
    }]}}).mockResolvedValueOnce({data: Buffer.from('bad')})
    const results = await Promise.allSettled([updateYtDlp({} as ApiDb), updateYtDlp({} as ApiDb)])
    expect(results.map(result => result.status)).toEqual(['rejected', 'rejected'])
    expect(axios.get).toHaveBeenCalledTimes(2)
    expect(await fs.readFile(destination, 'utf8')).toBe('working')
    expect(await fs.readdir(path.dirname(destination))).toEqual([name])
  })

  it('replaces an old executable and leaves no temporary file or lock', async () => {
    const name = ytDlpAssetName()
    const destination = path.join(directory, 'tools', 'yt-dlp', name)
    await fs.mkdir(path.dirname(destination), {recursive: true})
    await fs.writeFile(destination, 'old')
    const bytes = Buffer.from('new verified executable')
    vi.mocked(axios.get).mockResolvedValueOnce({data: {assets: [{name,
      digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      browser_download_url: `https://github.com/yt-dlp/yt-dlp/releases/download/test/${name}`,
    }]}}).mockResolvedValueOnce({data: bytes})
    expect(await updateYtDlp({} as ApiDb)).toBe(destination)
    expect(await fs.readFile(destination)).toEqual(bytes)
    expect(await fs.readdir(path.dirname(destination))).toEqual([name, `${name}.checked`])
    expect(await getYtDlpPath({} as ApiDb)).toBe(destination)
    expect(axios.get).toHaveBeenCalledTimes(2)
  })

  it('keeps the old executable and cleans up if atomic replacement fails', async () => {
    const name = ytDlpAssetName()
    const destination = path.join(directory, 'tools', 'yt-dlp', name)
    await fs.mkdir(path.dirname(destination), {recursive: true})
    await fs.writeFile(destination, 'working')
    const bytes = Buffer.from('new')
    vi.mocked(axios.get).mockResolvedValueOnce({data: {assets: [{name,
      digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      browser_download_url: `https://github.com/yt-dlp/yt-dlp/releases/download/test/${name}`,
    }]}}).mockResolvedValueOnce({data: bytes})
    const rename = vi.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('file busy'))
    try {
      await expect(updateYtDlp({} as ApiDb)).rejects.toThrow('file busy')
      expect(await fs.readFile(destination, 'utf8')).toBe('working')
      expect(await fs.readdir(path.dirname(destination))).toEqual([name])
    } finally { rename.mockRestore() }
  })

  it('respects another process lock and keeps extraction available after a failed update', async () => {
    const destination = path.join(directory, 'tools', 'yt-dlp', ytDlpAssetName())
    await fs.mkdir(path.dirname(destination), {recursive: true})
    await fs.writeFile(destination, 'working')
    await fs.writeFile(`${destination}.lock`, '')
    expect(await updateYtDlp({} as ApiDb)).toBe(destination)
    expect(axios.get).not.toHaveBeenCalled()
    await fs.rm(`${destination}.lock`)
    vi.mocked(axios.get).mockRejectedValue(new Error('offline secret'))
    expect(await getYtDlpPath({} as ApiDb)).toBe(destination)
    expect(await fs.readFile(destination, 'utf8')).toBe('working')
  })

  it('rejects download redirects outside the official HTTPS asset hosts', async () => {
    const name = ytDlpAssetName()
    vi.mocked(axios.get).mockResolvedValueOnce({data: {assets: [{name,
      digest: `sha256:${'0'.repeat(64)}`,
      browser_download_url: `https://github.com/yt-dlp/yt-dlp/releases/download/test/${name}`,
    }]}}).mockImplementationOnce(async (_url, options) => {
      options?.beforeRedirect?.({protocol: 'http:', hostname: '127.0.0.1'} as never, {} as never, {} as never)
      throw new Error('unexpected')
    })
    await expect(updateYtDlp({} as ApiDb)).rejects.toThrow('Invalid yt-dlp download redirect')
  })

  it('supports desktop platforms and a configured external binary', async () => {
    expect(ytDlpAssetName('darwin', 'arm64')).toBe('yt-dlp_macos')
    expect(ytDlpAssetName('linux', 'arm64')).toBe('yt-dlp_linux_aarch64')
    expect(ytDlpAssetName('win32', 'x64')).toBe('yt-dlp.exe')
    expect(() => ytDlpAssetName('linux', 'arm')).toThrow('MEDIA_CHIPS_YTDLP_PATH')
    vi.stubEnv('MEDIA_CHIPS_YTDLP_PATH', '/custom/yt-dlp')
    expect(await getYtDlpPath({} as ApiDb)).toBe('/custom/yt-dlp')
    expect(axios.get).not.toHaveBeenCalled()
  })

  it('uses all site extractors, a guarded proxy and one combined format', async () => {
    vi.stubEnv('MEDIA_CHIPS_YTDLP_PATH', '/custom/yt-dlp')
    vi.mocked(execFile).mockImplementationOnce((...args: unknown[]) => {
      const callback = args[3] as (error: null, stdout: string, stderr: string) => void
      callback(null, JSON.stringify({title: 'Example', formats: []}), '')
      return {} as ReturnType<typeof execFile>
    })
    await expect(extractWebVideo({} as ApiDb, 'https://example.com/watch?v=123')).resolves.toMatchObject({title: 'Example'})
    const args = vi.mocked(execFile).mock.calls[0] as unknown[]
    expect(args[1]).toEqual(expect.arrayContaining(['--ignore-config', '--no-plugin-dirs', '--no-playlist', '--skip-download', '--proxy', 'http://127.0.0.1:12345']))
    expect(args[1]).not.toContain('--use-extractors')
    expect((args[1] as string[]).slice(-2)).toEqual(['--', 'https://example.com/watch?v=123'])
  })

  it('imports a static player without installing or starting yt-dlp', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({status: 200, headers: {'content-type': 'text/html'},
      data: '<html><head><title>Public video</title></head><body><video src="https://cdn.example.com/video.mp4"></video></body></html>'})
    await expect(extractWebVideo({} as ApiDb, 'https://example.com/watch')).resolves.toMatchObject({title: 'Public video'})
    expect(execFile).not.toHaveBeenCalled()
    expect(axios.get).toHaveBeenCalledTimes(1)
  })

  it('explains a site challenge without leaking signed URLs or stderr', async () => {
    vi.stubEnv('MEDIA_CHIPS_YTDLP_PATH', '/custom/yt-dlp')
    vi.mocked(execFile).mockImplementationOnce((...args: unknown[]) => {
      const callback = args[3] as (error: Error) => void
      callback(Object.assign(new Error('secret'), {stderr: 'ERROR: Cloudflare anti-bot challenge https://cdn.example.com/?token=secret'}))
      return {} as ReturnType<typeof execFile>
    })
    await expect(extractWebVideo({} as ApiDb, 'https://example.com/watch')).rejects.toThrow('The site blocked video extraction.')
    expect(execFile).toHaveBeenCalledTimes(1)
  })

  it('passes cancellation to the extraction process and preserves the abort result', async () => {
    vi.stubEnv('MEDIA_CHIPS_YTDLP_PATH', '/custom/yt-dlp')
    vi.mocked(execFile).mockImplementationOnce((...args: unknown[]) => {
      const options = args[2] as {signal: AbortSignal}
      const callback = args[3] as (error: Error) => void
      options.signal.addEventListener('abort', () => callback(options.signal.reason), {once: true})
      return {} as ReturnType<typeof execFile>
    })
    const controller = new AbortController()
    const pending = extractWebVideo({} as ApiDb, 'https://xhamster.com/videos/test-xhAb12', controller.signal)
    const rejection = expect(pending).rejects.toMatchObject({name: 'AbortError'})
    await vi.waitFor(() => expect(execFile).toHaveBeenCalled())
    controller.abort()
    await rejection
  })
})
