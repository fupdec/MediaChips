import axios from 'axios'
import {execFile} from 'child_process'
import {promisify} from 'util'
import fs from 'fs/promises'
import path from 'path'
import {createHash, randomUUID} from 'crypto'
import type {ApiDb} from '../../types/db'
import {projectPath} from '../../../shared/projectRoot'
import {normalizeWebVideoUrl} from '../../../shared/webVideo'
import {startExtractionProxy} from './network'
import {extractHtml5Video} from './html5'

const run = promisify(execFile)
const installing = new Map<string, Promise<string>>()
const UPDATE_INTERVAL = 24 * 60 * 60 * 1000

export function ytDlpAssetName(platform = process.platform, arch = process.arch): string {
  if (platform === 'darwin' && (arch === 'x64' || arch === 'arm64')) return 'yt-dlp_macos'
  if (platform === 'win32' && arch === 'x64') return 'yt-dlp.exe'
  if (platform === 'linux' && arch === 'x64') return 'yt-dlp_linux'
  if (platform === 'linux' && arch === 'arm64') return 'yt-dlp_linux_aarch64'
  throw new Error('Set MEDIA_CHIPS_YTDLP_PATH to a yt-dlp executable for this platform.')
}

function managedPath(db: ApiDb): string {
  const base = process.app_folder || db.path_databases || projectPath('app_storage')
  return path.join(base, 'tools', 'yt-dlp', ytDlpAssetName())
}

function officialDownload(value: string): URL {
  const url = new URL(value)
  if (url.origin !== 'https://github.com' || url.username || url.password || url.search || url.hash
    || !/^\/yt-dlp\/yt-dlp\/releases\/download\/[^/]+\/[^/]+$/.test(url.pathname)) {
    throw new Error('Invalid yt-dlp release URL.')
  }
  return url
}

/** Install only the official executable and verify its release SHA-256 before executing it. */
async function install(db: ApiDb): Promise<string> {
  const name = ytDlpAssetName()
  const destination = managedPath(db)
  const {data: release} = await axios.get('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest', {
    timeout: 20_000, maxRedirects: 0, proxy: false,
    maxContentLength: 2 * 1024 * 1024,
    headers: {'User-Agent': 'MediaChips', Accept: 'application/vnd.github+json'},
  })
  const asset = release.assets?.find((item: {name: string}) => item.name === name)
  if (!asset || !/^sha256:[a-f0-9]{64}$/.test(asset.digest || '')) {
    throw new Error('The official yt-dlp release has no verified executable for this platform.')
  }
  const assetUrl = officialDownload(asset.browser_download_url)
  if (assetUrl.pathname.split('/').pop() !== name) throw new Error('Invalid yt-dlp release asset.')
  const {data} = await axios.get<ArrayBuffer>(assetUrl.href, {
    responseType: 'arraybuffer', timeout: 120_000, maxContentLength: 100 * 1024 * 1024,
    proxy: false, maxRedirects: 3,
    beforeRedirect: options => {
      // GitHub serves release bytes through its dedicated asset CDN.
      if (options.protocol !== 'https:' || options.auth || !['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(options.hostname || '')) {
        throw new Error('Invalid yt-dlp download redirect.')
      }
    },
  })
  const bytes = Buffer.from(data)
  if (`sha256:${createHash('sha256').update(bytes).digest('hex')}` !== asset.digest) {
    throw new Error('yt-dlp checksum verification failed.')
  }
  await fs.mkdir(path.dirname(destination), {recursive: true})
  const temporary = `${destination}.${randomUUID()}.tmp`
  try {
    await fs.writeFile(temporary, bytes, {mode: 0o755, flag: 'wx'})
    await fs.rename(temporary, destination)
  } finally {
    await fs.rm(temporary, {force: true})
  }
  return destination
}

/** External executables are owned by the user and are never replaced. */
export async function updateYtDlp(db: ApiDb): Promise<string> {
  const configured = process.env.MEDIA_CHIPS_YTDLP_PATH?.trim()
  if (configured) return configured
  const destination = managedPath(db)
  const pending = installing.get(destination)
  if (pending) return pending
  const task = (async () => {
    await fs.mkdir(path.dirname(destination), {recursive: true})
    // Exclusive on disk as well as in memory: multiple app/server processes may share tools.
    const lockPath = `${destination}.lock`
    let lock
    try {
      lock = await fs.open(lockPath, 'wx', 0o600)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      // An active (or interrupted) updater must never be overwritten by another process.
      await fs.access(destination)
      return destination
    }
    try {
      const binary = await install(db)
      await fs.writeFile(`${destination}.checked`, String(Date.now()), {mode: 0o600})
      return binary
    } finally {
      await lock.close()
      await fs.rm(lockPath, {force: true})
    }
  })().finally(() => { installing.delete(destination) })
  installing.set(destination, task)
  return task
}

export async function getYtDlpPath(db: ApiDb): Promise<string> {
  const configured = process.env.MEDIA_CHIPS_YTDLP_PATH?.trim()
  if (configured) return configured
  const destination = managedPath(db)
  let exists = false
  try { await fs.access(destination); exists = true } catch {}
  if (exists) {
    try {
      const checked = Number(await fs.readFile(`${destination}.checked`, 'utf8'))
      if (Number.isFinite(checked) && checked > Date.now() - UPDATE_INTERVAL) return destination
    } catch {}
  }
  try { return await updateYtDlp(db) } catch {
    // Download, verification or rename failures leave the previous executable intact.
    if (exists) return destination
    throw new Error('Unable to install verified yt-dlp. Check the connection or configure MEDIA_CHIPS_YTDLP_PATH.')
  }
}

export async function extractWebVideo(db: ApiDb, input: string, signal?: AbortSignal): Promise<unknown> {
  signal?.throwIfAborted()
  const url = normalizeWebVideoUrl(input)
  if (!url) throw new Error('Invalid public HTTPS video page URL.')
  try {
    // Static players need no site adapter. Node's HTTP/TLS stack also avoids the
    // intermittent Cloudflare challenge sent to the Python generic extractor.
    const html5 = await extractHtml5Video(url, signal)
    if (html5) return html5
  } catch {
    // Dynamic pages and unavailable HTML still use the full site extractor.
    signal?.throwIfAborted()
  }
  const binary = await getYtDlpPath(db)
  signal?.throwIfAborted()
  const proxy = await startExtractionProxy()
  try {
    signal?.throwIfAborted()
    const {stdout} = await run(binary, [
      '--ignore-config', '--no-plugin-dirs', '--no-cache-dir', '--no-playlist', '--skip-download',
      '--proxy', proxy.url, '--playlist-items', '1,2',
      '--format', 'best[ext=mp4]/best',
      '--dump-single-json', '--no-warnings', '--socket-timeout', '15',
      '--retries', '1', '--extractor-retries', '1', '--', url,
    ], {timeout: 60_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true, signal,
      env: {...process.env, NO_PROXY: '', no_proxy: ''}})
    return JSON.parse(stdout)
  } catch (error) {
    signal?.throwIfAborted()
    // Never expose stderr: it can contain signed URLs, tokens and page contents.
    const failure = error as {killed?: boolean; code?: string; stderr?: string}
    const blocked = /Cloudflare anti-bot challenge|HTTP Error (?:401|403)/i.test(failure.stderr || '')
    const message = failure.killed || failure.code === 'ETIMEDOUT' || /timed?\s*out|timeout/i.test(failure.stderr || '')
      ? 'The video request timed out. Check the connection and try opening the original page.'
      : blocked ? 'The site blocked video extraction. Open the original page to check its access requirements.'
      : 'Unable to extract this video. The site may be unsupported, unavailable, restricted, or require an updated yt-dlp adapter.'
    throw Object.assign(new Error(message), {code: /HTTP Error 429/i.test(failure.stderr || '') ? 'rate_limited' : failure.killed || failure.code === 'ETIMEDOUT' || /timed?\s*out|timeout/i.test(failure.stderr || '') ? 'network_error' : blocked ? 'permission_denied' : 'extraction_failed'})
  } finally {
    proxy.close()
  }
}
