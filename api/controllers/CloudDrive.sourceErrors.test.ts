// @vitest-environment node
import {beforeEach, describe, expect, it, vi} from 'vitest'
import type {Request, Response} from 'express'
import type {ApiDb} from '../types/db'
const mocks = vi.hoisted(() => ({list: vi.fn()}))
vi.mock('../services/cloudDrive', () => ({getCloudDriveService: () => ({}), resetCloudDriveService: vi.fn()}))
vi.mock('../services/cloudDrive/library', () => ({listDriveFolder: mocks.list}))
import createCloudDriveController from './CloudDrive.controller'
beforeEach(() => vi.resetAllMocks())
describe('Drive folder failure responses', () => {
  it.each([
    [{code: 'ENOTFOUND'}, 502, 'network_error'],
    [{response: {status: 401}}, 409, 'auth_required'],
    [{response: {status: 403}}, 403, 'permission_denied'],
    [{response: {status: 400, data: {error: 'invalid_grant'}}}, 409, 'auth_required'],
    [{code: 'auth_required', status: 409}, 409, 'auth_required'],
  ])('keeps errors actionable and does not expose upstream request secrets (%s)', async (error, status, code) => {
    mocks.list.mockRejectedValue(Object.assign(new Error('secret-token-do-not-expose'), error))
    const res = {status: vi.fn().mockReturnThis(), json: vi.fn()}
    await createCloudDriveController({} as ApiDb).listFolder({params: {folderId: 'root'}, query: {}} as unknown as Request, res as unknown as Response)
    expect(res.status).toHaveBeenCalledWith(status)
    expect(res.json).toHaveBeenCalledWith({code, message: expect.not.stringContaining('secret-token')})
  })
})
