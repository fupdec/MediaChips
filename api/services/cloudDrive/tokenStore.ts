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
  fs.mkdirSync(path.dirname(filePath), {recursive: true, mode: 0o700})
  fs.writeFileSync(filePath, JSON.stringify(tokens, null, 2), {encoding: 'utf8', mode: 0o600})
  fs.chmodSync(filePath, 0o600)
}

function clearTokenFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch {
    // ignore
  }
}

/**
 * Private host-local token store (API/Electron process only).
 */
function createTokenStore(filePath: string) {
  let memory: DriveOAuthTokens | null = readTokenFile(filePath)

  return {
    get(): DriveOAuthTokens | null {
      return memory
    },
    set(tokens: DriveOAuthTokens): void {
      writeTokenFile(filePath, tokens)
      memory = tokens
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
