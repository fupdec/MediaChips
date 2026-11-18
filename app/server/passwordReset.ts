import fs from 'fs'
import path from 'path'
import type { ApiDb } from '../../api/types/db'
import { createSettingsRepository } from '../../api/db/repositories/settings'

/**
 * Forgotten-password recovery. The owner proves access to the machine (or the
 * Docker volume) by creating an empty file next to `app_storage`; the server
 * then clears the password of the ACTIVE library, turns the lock off and
 * deletes the file. Nothing here is reachable over HTTP, so a LAN client that
 * does not know the password cannot trigger it.
 */
const RESET_PASSWORD_FLAG = 'RESET_PASSWORD'
// "New text document" on Windows/macOS produces a .txt; nothing else is accepted,
// so a stray file such as RESET_PASSWORD.ts is never picked up or deleted.
const RESET_PASSWORD_FLAG_NAMES = [RESET_PASSWORD_FLAG, `${RESET_PASSWORD_FLAG}.txt`]

function getResetFlagPath(dataDir: string): string {
  return path.join(dataDir, RESET_PASSWORD_FLAG)
}

function createPasswordResetWatcher(options: {db: ApiDb; dataDir: string; onReset: () => void; now?: () => number}) {
  const {db, dataDir, onReset, now = Date.now} = options
  const flagPath = getResetFlagPath(dataDir)
  const flagPaths = RESET_PASSWORD_FLAG_NAMES.map((name) => path.join(dataDir, name))
  const CHECK_INTERVAL_MS = 1000

  let lastCheckAt = 0
  // If a flag cannot be deleted (read-only mount), do not reset again for the
  // same file — otherwise the lock would turn itself off after every new password.
  let handledKey: string | null = null

  function findFlags(): Array<{file: string; mtimeMs: number}> {
    const found: Array<{file: string; mtimeMs: number}> = []
    for (const file of flagPaths) {
      try {
        found.push({file, mtimeMs: fs.statSync(file).mtimeMs})
      } catch {
        // not there
      }
    }
    return found
  }

  /** Returns true when a reset was applied on this call. */
  function applyPendingReset(force = false): boolean {
    const current = now()
    if (!force && current - lastCheckAt < CHECK_INTERVAL_MS) return false
    lastCheckAt = current

    const found = findFlags()
    if (found.length === 0) {
      handledKey = null
      return false
    }
    const key = found.map((entry) => `${entry.file}:${entry.mtimeMs}`).join('|')
    if (handledKey === key) return false

    try {
      const repo = createSettingsRepository(db.drizzle)
      repo.upsertByOption('phrase', '')
      repo.upsertByOption('passwordProtection', '0')
    } catch (error) {
      console.error('Password reset failed, flag file kept:', error)
      return false
    }

    handledKey = key
    let allRemoved = true
    for (const {file} of found) {
      try {
        fs.unlinkSync(file)
      } catch (error) {
        allRemoved = false
        console.error(`Password was reset, but ${file} could not be deleted — remove it manually:`, error)
      }
    }
    if (allRemoved) handledKey = null

    onReset()
    console.warn(`[security] Password of the active library was reset via ${RESET_PASSWORD_FLAG}`)
    return true
  }

  return {flagPath, applyPendingReset}
}

export { RESET_PASSWORD_FLAG, RESET_PASSWORD_FLAG_NAMES, getResetFlagPath, createPasswordResetWatcher }
