import fs from 'fs'
import os from 'os'
import path from 'path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const upsertByOption = vi.fn()
const findAll = vi.fn(() => [] as Array<{option: string; value: string}>)

vi.mock('../../api/db/repositories/settings', () => ({
  createSettingsRepository: () => ({upsertByOption, findAll}),
}))

import {RESET_PASSWORD_FLAG, createPasswordResetWatcher, getResetFlagPath} from './passwordReset'
import {createAuthService} from './auth'

const db = {drizzle: {}} as never
let dataDir = ''

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-reset-'))
  upsertByOption.mockReset()
  findAll.mockReset()
  findAll.mockReturnValue([])
})

afterEach(() => {
  fs.rmSync(dataDir, {recursive: true, force: true})
})

describe('password reset flag file', () => {
  it('does nothing without the flag file', () => {
    const onReset = vi.fn()
    const watcher = createPasswordResetWatcher({db, dataDir, onReset})

    expect(watcher.applyPendingReset(true)).toBe(false)
    expect(upsertByOption).not.toHaveBeenCalled()
    expect(onReset).not.toHaveBeenCalled()
  })

  it('clears the password, turns the lock off and deletes the flag', () => {
    const flag = getResetFlagPath(dataDir)
    fs.writeFileSync(flag, '')
    const onReset = vi.fn()
    const watcher = createPasswordResetWatcher({db, dataDir, onReset})

    expect(watcher.applyPendingReset(true)).toBe(true)
    expect(upsertByOption).toHaveBeenCalledWith('phrase', '')
    expect(upsertByOption).toHaveBeenCalledWith('passwordProtection', '0')
    expect(fs.existsSync(flag)).toBe(false)
    expect(onReset).toHaveBeenCalledTimes(1)
    expect(path.basename(flag)).toBe(RESET_PASSWORD_FLAG)

    // The flag is gone, so a second check is a no-op.
    expect(watcher.applyPendingReset(true)).toBe(false)
    expect(upsertByOption).toHaveBeenCalledTimes(2)
  })

  it('keeps the flag when the database write fails, so it can retry', () => {
    const flag = getResetFlagPath(dataDir)
    fs.writeFileSync(flag, '')
    upsertByOption.mockImplementationOnce(() => {
      throw new Error('db locked')
    })
    const onReset = vi.fn()
    const watcher = createPasswordResetWatcher({db, dataDir, onReset})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(watcher.applyPendingReset(true)).toBe(false)
    expect(fs.existsSync(flag)).toBe(true)
    expect(onReset).not.toHaveBeenCalled()

    expect(watcher.applyPendingReset(true)).toBe(true)
    expect(fs.existsSync(flag)).toBe(false)
    error.mockRestore()
  })

  it('does not reset again for the same file when it cannot be deleted', () => {
    const flag = getResetFlagPath(dataDir)
    fs.writeFileSync(flag, '')
    const unlink = vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {
      throw new Error('read-only')
    })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const watcher = createPasswordResetWatcher({db, dataDir, onReset: vi.fn()})

    expect(watcher.applyPendingReset(true)).toBe(true)
    expect(watcher.applyPendingReset(true)).toBe(false)
    expect(upsertByOption).toHaveBeenCalledTimes(2)

    unlink.mockRestore()
    error.mockRestore()
  })

  it('throttles file checks between calls', () => {
    let clock = 10_000
    const watcher = createPasswordResetWatcher({db, dataDir, onReset: vi.fn(), now: () => clock})

    expect(watcher.applyPendingReset()).toBe(false)
    fs.writeFileSync(getResetFlagPath(dataDir), '')
    clock += 200
    expect(watcher.applyPendingReset()).toBe(false)
    clock += 1000
    expect(watcher.applyPendingReset()).toBe(true)
  })
})

describe('auth service with a reset flag', () => {
  it('drops the lock and every session once the flag appears', async () => {
    findAll.mockReturnValue([
      {option: 'passwordProtection', value: '1'},
      {option: 'phrase', value: 'scrypt$16384$8$1$c2FsdA==$aGFzaA=='},
    ])
    const service = createAuthService(db, {dataDir})
    const token = service.createSession()

    expect(await service.isAuthRequired()).toBe(true)
    expect(service.validateToken(token)).toBe(true)

    findAll.mockReturnValue([
      {option: 'passwordProtection', value: '0'},
      {option: 'phrase', value: ''},
    ])
    fs.writeFileSync(getResetFlagPath(dataDir), '')

    expect(service.applyPendingPasswordReset(true)).toBe(true)
    expect(await service.isAuthRequired()).toBe(false)
    expect(service.validateToken(token)).toBe(false)
    expect(service.resetFlagPath).toBe(getResetFlagPath(dataDir))
  })

  it('has no reset path unless a data folder is configured', async () => {
    const service = createAuthService(db)

    expect(service.resetFlagPath).toBeNull()
    expect(service.applyPendingPasswordReset(true)).toBe(false)
  })
})
