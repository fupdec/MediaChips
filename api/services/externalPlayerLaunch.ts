import { access, writeFile } from 'fs/promises'
import { constants } from 'fs'
import os from 'os'
import path from 'path'
import { spawn, execFile } from 'child_process'
import { promisify } from 'util'
import type { PlayerChapter } from './markChaptersForPath'
import { buildFfmetadataChapters } from './ffmetadataChapters'

const execFileAsync = promisify(execFile)

export type ExternalPlayerKind = 'mpv' | 'iina'

export class ExternalPlayerError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = 'ExternalPlayerError'
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function which(command: string): Promise<string | null> {
  try {
    const binary = process.platform === 'win32' ? 'where' : 'which'
    const {stdout} = await execFileAsync(binary, [command], {timeout: 3000})
    const first = String(stdout || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean)
    return first || null
  } catch {
    return null
  }
}

async function firstExisting(candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    if (!candidate) continue
    if (await pathExists(candidate)) return candidate
  }
  return null
}

export async function resolveMpvBinary(): Promise<string | null> {
  const fromPath = await which('mpv')
  if (fromPath) return fromPath

  if (process.platform === 'darwin') {
    return firstExisting([
      '/opt/homebrew/bin/mpv',
      '/usr/local/bin/mpv',
      '/Applications/mpv.app/Contents/MacOS/mpv',
    ])
  }

  if (process.platform === 'win32') {
    return firstExisting([
      path.join(process.env.LOCALAPPDATA || '', 'mpv', 'mpv.exe'),
      path.join(process.env.ProgramFiles || '', 'mpv', 'mpv.exe'),
    ])
  }

  return firstExisting(['/usr/bin/mpv', '/usr/local/bin/mpv'])
}

export async function resolveIinaCli(): Promise<string | null> {
  if (process.platform !== 'darwin') return null

  const home = os.homedir()
  return firstExisting([
    '/Applications/IINA.app/Contents/MacOS/iina-cli',
    path.join(home, 'Applications/IINA.app/Contents/MacOS/iina-cli'),
  ])
}

async function writeChaptersFile(chapters: PlayerChapter[]): Promise<string | null> {
  if (!chapters.length) return null

  const filePath = path.join(
    os.tmpdir(),
    `mediachips-chapters-${Date.now()}-${Math.random().toString(16).slice(2)}.ffmetadata`,
  )
  await writeFile(filePath, buildFfmetadataChapters(chapters), 'utf8')
  return filePath
}

function spawnDetached(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })

    let settled = false
    child.once('error', (error) => {
      if (settled) return
      settled = true
      reject(error)
    })

    setImmediate(() => {
      if (settled) return
      settled = true
      child.unref()
      resolve()
    })
  })
}

export async function launchExternalPlayer(options: {
  player: ExternalPlayerKind
  mediaPath: string
  chapters?: PlayerChapter[]
}): Promise<{player: ExternalPlayerKind; chapters: number}> {
  const mediaPath = String(options.mediaPath || '').trim()
  if (!mediaPath) {
    throw new ExternalPlayerError('NO_PATH', 'Media path is required')
  }

  if (!(await pathExists(mediaPath))) {
    throw new ExternalPlayerError('FILE_NOT_FOUND', `File not found: ${mediaPath}`)
  }

  if (options.player === 'iina' && process.platform !== 'darwin') {
    throw new ExternalPlayerError('UNSUPPORTED_PLATFORM', 'IINA is only available on macOS')
  }

  const chapters = options.chapters || []
  const chaptersFile = await writeChaptersFile(chapters)

  if (options.player === 'mpv') {
    const binary = await resolveMpvBinary()
    if (!binary) {
      throw new ExternalPlayerError('PLAYER_NOT_FOUND', 'mpv was not found on this system')
    }

    const args = chaptersFile
      ? [`--chapters-file=${chaptersFile}`, mediaPath]
      : [mediaPath]
    await spawnDetached(binary, args)
    return {player: 'mpv', chapters: chapters.length}
  }

  const iinaCli = await resolveIinaCli()
  if (!iinaCli) {
    throw new ExternalPlayerError('PLAYER_NOT_FOUND', 'IINA was not found in /Applications')
  }

  // iina-cli mis-detects ignored/null stdin as a pipe and shows
  // "Cannot open file or stream!" unless --no-stdin is set.
  const args = ['--no-stdin']
  if (chaptersFile) {
    args.push(`--mpv-chapters-file=${chaptersFile}`)
  }
  args.push(mediaPath)
  await spawnDetached(iinaCli, args)
  return {player: 'iina', chapters: chapters.length}
}
