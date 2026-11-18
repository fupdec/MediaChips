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

function getResetFlagPath(dataDir: string): string {
  return path.join(dataDir, RESET_PASSWORD_FLAG)
}

function createPasswordResetWatcher(options: {db: ApiDb; dataDir: string; onReset: () => void; now?: () => number}) {
  const {db, dataDir, onReset, now = Date.now} = options
  const flagPath = getResetFlagPath(dataDir)
  const CHECK_INTERVAL_MS = 1000

  let lastCheckAt = 0
  // If the flag cannot be deleted (read-only mount), do not reset again for the
  // same file — otherwise the lock would turn itself off after every new password.
  let handledMtimeMs: number | null = null

  /** Returns true when a reset was applied on this call. */
  function applyPendingReset(force = false): boolean {
    const current = now()
    if (!force && current - lastCheckAt < CHECK_INTERVAL_MS) return false
    lastCheckAt = current

    let mtimeMs: number
    try {
      mtimeMs = fs.statSync(flagPath).mtimeMs
    } catch {
      handledMtimeMs = null
      return false
    }
    if (handledMtimeMs === mtimeMs) return false

    try {
      const repo = createSettingsRepository(db.drizzle)
      repo.upsertByOption('phrase', '')
      repo.upsertByOption('passwordProtection', '0')
    } catch (error) {
      console.error('Password reset failed, flag file kept:', error)
      return false
    }

    handledMtimeMs = mtimeMs
    try {
      fs.unlinkSync(flagPath)
      handledMtimeMs = null
    } catch (error) {
      console.error(`Password was reset, but ${flagPath} could not be deleted — remove it manually:`, error)
    }

    onReset()
    console.warn(`[security] Password of the active library was reset via ${RESET_PASSWORD_FLAG}`)
    return true
  }

  return {flagPath, applyPendingReset}
}

export { RESET_PASSWORD_FLAG, getResetFlagPath, createPasswordResetWatcher }
