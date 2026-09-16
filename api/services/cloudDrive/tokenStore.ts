import fs from 'fs'
import path from 'path'
import type {DriveOAuthTokens} from './types'

function readTokenFile(filePath: string): DriveOAuthTokens | null {
  try {
    if (!fs.existsSync(filePath)) return null
    const raw = fs.readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(raw) as DriveOAuthTokens
    if (!parsed?.accessToken) return null
    return parsed
  } catch {
    return null
  }
}

function writeTokenFile(filePath: string, tokens: DriveOAuthTokens): void {
  fs.mkdirSync(path.dirname(filePath), {recursive: true})
  fs.writeFileSync(filePath, JSON.stringify(tokens, null, 2), 'utf8')
}

function clearTokenFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch {
    // ignore
  }
}

/**
 * Tiny file-backed token store for the spike (API/Electron process only).
 * Not encrypted — Phase 2 should move to OS keychain / safer storage.
 */
function createTokenStore(filePath: string) {
  let memory: DriveOAuthTokens | null = readTokenFile(filePath)

  return {
    get(): DriveOAuthTokens | null {
      return memory
    },
    set(tokens: DriveOAuthTokens): void {
      memory = tokens
      writeTokenFile(filePath, tokens)
    },
    clear(): void {
      memory = null
      clearTokenFile(filePath)
    },
    /** Test helper: reload from disk without process restart. */
    reload(): DriveOAuthTokens | null {
      memory = readTokenFile(filePath)
      return memory
    },
  }
}

export type DriveTokenStore = ReturnType<typeof createTokenStore>

export {createTokenStore, readTokenFile, writeTokenFile, clearTokenFile}
