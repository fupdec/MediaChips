import fs from 'fs'
import path from 'path'
import {createNasCredentialStore} from '../nas/credentials'
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
  const vault = createNasCredentialStore(`${filePath}.vault`)
  const id = 'df489adc-cdd5-41ea-8b86-b77600682914'
  const read = (): DriveOAuthTokens | null => {
    if (vault.has(id)) {
      try { return JSON.parse(vault.get(id).password || 'null') } catch { return null }
    }
    const legacy = readTokenFile(filePath)
    if (legacy) { vault.set(id, {password: JSON.stringify(legacy)}); clearTokenFile(filePath) }
    return legacy
  }
  let memory: DriveOAuthTokens | null = read()

  return {
    get(): DriveOAuthTokens | null {
      return memory
    },
    set(tokens: DriveOAuthTokens): void {
      vault.set(id, {password: JSON.stringify(tokens)})
      memory = tokens
    },
    clear(): void {
      memory = null
      vault.delete(id)
      clearTokenFile(filePath)
    },
    /** Test helper: reload from disk without process restart. */
    reload(): DriveOAuthTokens | null {
      memory = read()
      return memory
    },
  }
}

export type DriveTokenStore = ReturnType<typeof createTokenStore>

export {createTokenStore, readTokenFile, writeTokenFile, clearTokenFile}
