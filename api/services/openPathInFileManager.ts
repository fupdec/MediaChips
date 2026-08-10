import {execFile} from 'child_process'
import path from 'path'
import {promisify} from 'util'

const execFileAsync = promisify(execFile)

export type OpenPathInFileManagerOptions = {
  /** Reveal the file/folder in its parent (Finder/Explorer) instead of opening it. */
  revealInFolder?: boolean
  platform?: NodeJS.Platform
  execFileImpl?: typeof execFileAsync
}

/**
 * True when this process is the Electron API child (ELECTRON_RUN_AS_NODE).
 * `import('electron').shell` is unreliable there — use OS commands instead.
 */
export function shouldUseOsOpenCommands(): boolean {
  return process.env.ELECTRON_RUN_AS_NODE === '1' || !process.versions.electron
}

/**
 * Windows `explorer.exe` often exits with a non-zero code even when it succeeds.
 * Treat those as success so callers do not surface "Command failed".
 */
export function isBenignWindowsExplorerExit(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = (error as {code?: unknown}).code
  return code === 1 || code === '1'
}

function buildWindowsArgs(targetPath: string, revealInFolder: boolean): string[] {
  if (revealInFolder) {
    // No extra quotes — execFile passes argv directly. Trailing slash breaks /select.
    const normalized = targetPath.replace(/[/\\]+$/, '')
    return [`/select,${normalized}`]
  }
  return [targetPath]
}

/**
 * Open a path with the OS file manager / default handler (HTTP/API fallback path).
 */
export async function openPathInFileManager(
  rawPath: string,
  options: OpenPathInFileManagerOptions = {},
): Promise<void> {
  const targetPath = path.normalize(String(rawPath || ''))
  if (!targetPath) throw new Error('Path is required')

  const revealInFolder = Boolean(options.revealInFolder)
  const platform = options.platform || process.platform
  const run = options.execFileImpl || execFileAsync

  if (platform === 'darwin') {
    const args = revealInFolder ? ['-R', targetPath] : [targetPath]
    await run('open', args)
    return
  }

  if (platform === 'win32') {
    try {
      await run('explorer.exe', buildWindowsArgs(targetPath, revealInFolder))
    } catch (error) {
      if (!isBenignWindowsExplorerExit(error)) throw error
    }
    return
  }

  // Linux / other: reveal ≈ open parent folder
  const openTarget = revealInFolder ? path.dirname(targetPath) : targetPath
  await run('xdg-open', [openTarget])
}
