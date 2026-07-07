import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ApiRequest, ApiResponse } from '../types/http'

const {
  findAll,
  findByOption,
  upsertByOption,
  loadSecuritySettings,
  sanitizeSettingRows,
  sanitizeSettingRow,
  isRequestAuthenticated,
  invalidateSettingsCache,
  isLanAccessEnvLocked,
  applyLanAccessChange,
} = vi.hoisted(() => ({
  findAll: vi.fn(),
  findByOption: vi.fn(),
  upsertByOption: vi.fn(),
  loadSecuritySettings: vi.fn(),
  sanitizeSettingRows: vi.fn(),
  sanitizeSettingRow: vi.fn(),
  isRequestAuthenticated: vi.fn(),
  invalidateSettingsCache: vi.fn(),
  isLanAccessEnvLocked: vi.fn(),
  applyLanAccessChange: vi.fn(),
}))

vi.mock('../db/repositories/settings', () => ({
  createSettingsRepository: () => ({
    findAll,
    findByOption,
    upsertByOption,
  }),
}))

vi.mock('../../app/server/authRegistry', () => ({
  getAuthService: () => ({
    loadSecuritySettings,
    sanitizeSettingRows,
    sanitizeSettingRow,
    isRequestAuthenticated,
    invalidateSettingsCache,
  }),
}))

vi.mock('../../app/server/lanAccess', () => ({
  isLanAccessEnvLocked,
  applyLanAccessChange,
}))

import createSettingController from './Setting.controller'

function createResponse() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code
      return res
    },
    send(payload: unknown) {
      res.body = payload
      return res
    },
    sendStatus(code: number) {
      res.statusCode = code
      return res
    },
  }

  return res as ApiResponse & {statusCode: number; body: unknown}
}

describe('Setting.controller', () => {
  const controller = createSettingController({drizzle: {}} as never)

  beforeEach(() => {
    vi.clearAllMocks()
    loadSecuritySettings.mockResolvedValue({passwordProtection: false})
    isRequestAuthenticated.mockReturnValue(true)
    isLanAccessEnvLocked.mockReturnValue(false)
    applyLanAccessChange.mockResolvedValue(undefined)
  })

  it('returns sanitized settings rows', async () => {
    findAll.mockReturnValue([{option: 'theme', value: 'dark'}])
    sanitizeSettingRows.mockReturnValue([{option: 'theme', value: 'dark'}])

    const req = {} as ApiRequest
    const res = createResponse()

    await controller.findAll(req, res)

    expect(sanitizeSettingRows).toHaveBeenCalled()
    expect(res.statusCode).toBe(201)
    expect(res.body).toEqual([{option: 'theme', value: 'dark'}])
  })

  it('returns a sanitized single setting', async () => {
    findByOption.mockReturnValue({option: 'theme', value: 'dark'})
    sanitizeSettingRow.mockReturnValue({option: 'theme', value: 'dark'})

    const req = {params: {option: 'theme'}} as unknown as ApiRequest
    const res = createResponse()

    await controller.findOne(req, res)

    expect(findByOption).toHaveBeenCalledWith('theme')
    expect(res.statusCode).toBe(201)
    expect(res.body).toEqual({option: 'theme', value: 'dark'})
  })

  it('rejects updates without a body', async () => {
    const req = {} as ApiRequest
    const res = createResponse()

    await controller.update(req, res)

    expect(res.statusCode).toBe(400)
    expect(upsertByOption).not.toHaveBeenCalled()
  })

  it('updates a setting and invalidates auth cache for password options', async () => {
    const req = {
      params: {option: 'passwordProtection'},
      body: {value: '1'},
    } as unknown as ApiRequest
    const res = createResponse()

    await controller.update(req, res)

    expect(upsertByOption).toHaveBeenCalledWith('passwordProtection', '1')
    expect(invalidateSettingsCache).toHaveBeenCalled()
    expect(res.statusCode).toBe(201)
    expect(res.body).toEqual([1])
  })

  it('blocks LAN access updates when controlled by environment', async () => {
    isLanAccessEnvLocked.mockReturnValue(true)

    const req = {
      params: {option: 'allowLanAccess'},
      body: {value: '1'},
    } as unknown as ApiRequest
    const res = createResponse()

    await controller.update(req, res)

    expect(res.statusCode).toBe(409)
    expect(res.body).toEqual({
      message: 'LAN access is controlled by MEDIA_CHIPS_ALLOW_LAN environment variable',
    })
    expect(applyLanAccessChange).not.toHaveBeenCalled()
  })

  it('clears migrated global settings in the database without changing LAN access', async () => {
    const req = {
      params: {option: 'allowLanAccess'},
      body: {value: ''},
    } as unknown as ApiRequest
    const res = createResponse()

    await controller.update(req, res)

    expect(upsertByOption).toHaveBeenCalledWith('allowLanAccess', '')
    expect(applyLanAccessChange).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(201)
    expect(res.body).toEqual([1])
  })
})
