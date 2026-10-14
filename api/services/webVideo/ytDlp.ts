import axios from 'axios'
import {execFile} from 'child_process'
import {promisify} from 'util'
import fs from 'fs/promises'
import path from 'path'
import {createHash, randomUUID} from 'crypto'
import type {ApiDb} from '../../types/db'
import {projectPath} from '../../../shared/projectRoot'
import {normalizeXHamsterUrl} from '../../../shared/webVideo'

const run = promisify(execFile)
let installing: Promise<string> | null = null

export function ytDlpAssetName(platform = process.platform, arch = process.arch): string {
  if (platform === 'darwin') return 'yt-dlp_macos'
  if (platform === 'win32' && arch === 'x64') return 'yt-dlp.exe'
  if (platform === 'linux' && arch === 'x64') return 'yt-dlp_linux'
  if (platform === 'linux' && arch === 'arm64') return 'yt-dlp_linux_aarch64'
  throw new Error('Set MEDIA_CHIPS_YTDLP_PATH to a yt-dlp executable for this platform.')
}

function managedPath(db: ApiDb): string {
  const base = process.app_folder || db.path_databases || projectPath('app_storage')
  return path.join(base, 'tools', 'yt-dlp', ytDlpAssetName())
}

/** Install only the official executable and verify its release SHA-256 before executing it. */
async function install(db: ApiDb): Promise<string> {
  const name = ytDlpAssetName()
  const destination = managedPath(db)
  const {data: release} = await axios.get('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest', {
    timeout: 20_000,
    maxContentLength: 2 * 1024 * 1024,
    headers: {'User-Agent': 'MediaChips', Accept: 'application/vnd.github+json'},
  })
  const asset = release.assets?.find((item: {name: string}) => item.name === name)
  if (!asset || !/^sha256:[a-f0-9]{64}$/.test(asset.digest || '')) {
    throw new Error('The official yt-dlp release has no verified executable for this platform.')
  }
  const assetUrl = new URL(asset.browser_download_url)
  if (assetUrl.origin !== 'https://github.com' || !assetUrl.pathname.startsWith('/yt-dlp/yt-dlp/releases/download/')) {
    throw new Error('Invalid yt-dlp release URL.')
  }
  const {data} = await axios.get<ArrayBuffer>(assetUrl.href, {
    responseType: 'arraybuffer', timeout: 120_000, maxContentLength: 100 * 1024 * 1024,
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

export async function getYtDlpPath(db: ApiDb): Promise<string> {
  const configured = process.env.MEDIA_CHIPS_YTDLP_PATH?.trim()
  if (configured) return configured
  const destination = managedPath(db)
  try {
    await fs.access(destination)
    return destination
  } catch {}
  if (!installing) installing = install(db).finally(() => { installing = null })
  return installing
}

export async function extractXHamster(db: ApiDb, input: string, signal?: AbortSignal): Promise<unknown> {
  signal?.throwIfAborted()
  const url = normalizeXHamsterUrl(input)
  if (!url) throw new Error('Invalid xHamster video URL.')
  const binary = await getYtDlpPath(db)
  signal?.throwIfAborted()
  try {
    const {stdout} = await run(binary, [
      '--ignore-config', '--no-plugin-dirs', '--no-cache-dir', '--no-playlist', '--skip-download',
      '--use-extractors', 'XHamster',
      '--dump-single-json', '--no-warnings', '--socket-timeout', '15',
      '--retries', '1', '--extractor-retries', '1', '--', url,
    ], {timeout: 60_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true, signal})
    return JSON.parse(stdout)
  } catch (error) {
    signal?.throwIfAborted()
    // Never expose stderr: it can contain signed URLs, tokens and page contents.
    const failure = error as {killed?: boolean; code?: string; stderr?: string}
    const message = failure.killed || failure.code === 'ETIMEDOUT' || /timed?\s*out|timeout/i.test(failure.stderr || '')
      ? 'The xHamster request timed out. Check the connection and try opening the page on xHamster.'
      : 'Unable to extract this xHamster video. It may be unavailable, restricted, or require an updated yt-dlp adapter.'
    // eslint-disable-next-line preserve-caught-error -- Retaining the cause would log signed URLs from subprocess stderr.
    throw new Error(message)
  }
}
