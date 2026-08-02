import {describe, expect, it, vi} from 'vitest'
import path from 'path'
import os from 'os'
import fs from 'fs'

vi.mock('../db/repositories/settings', () => ({
  createSettingsRepository: () => ({
    findByOption: (option: string) => {
      if (option === 'localAi.enabled') return {value: '0'}
      return undefined
    },
    upsertByOption: vi.fn(),
  }),
}))

import {getLocalAiStatus, LOCAL_AI_MODEL_ID} from './localLlm'

describe('localLlm status', () => {
  it('reports disabled when setting is off', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-local-ai-'))
    const status = getLocalAiStatus({
      path_databases: tmp,
      drizzle: {} as never,
      sqlite: {} as never,
    })
    expect(status.status).toBe('disabled')
    expect(status.model).toBe(LOCAL_AI_MODEL_ID)
    expect(status.enabled).toBe(false)
  })
})
