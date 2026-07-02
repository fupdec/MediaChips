import type { AxiosResponse } from 'axios'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { openLowDbMigrationIfNeeded } from './useLowDbMigration'
import { useOperationsStore } from '@/stores/operations'

vi.mock('@/services/typedApi', () => ({
  typedApi: {
    checkDataForMigrateFromLowDb: vi.fn(),
  },
}))

import { typedApi } from '@/services/typedApi'

describe('openLowDbMigrationIfNeeded', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(typedApi.checkDataForMigrateFromLowDb).mockReset()
  })

  it('skips player window', async () => {
    const opened = await openLowDbMigrationIfNeeded(true)
    expect(opened).toBe(false)
    expect(typedApi.checkDataForMigrateFromLowDb).not.toHaveBeenCalled()
  })

  it('opens dialog when legacy LowDB data exists', async () => {
    vi.mocked(typedApi.checkDataForMigrateFromLowDb).mockResolvedValue(
      { status: 201, data: null } as AxiosResponse,
    )

    const opened = await openLowDbMigrationIfNeeded(false)
    const store = useOperationsStore()

    expect(opened).toBe(true)
    expect(store.migrationLowDb.dialog).toBe(true)
  })

  it('does not open dialog when no legacy data', async () => {
    vi.mocked(typedApi.checkDataForMigrateFromLowDb).mockRejectedValue(new Error('not found'))

    const opened = await openLowDbMigrationIfNeeded(false)
    const store = useOperationsStore()

    expect(opened).toBe(false)
    expect(store.migrationLowDb.dialog).toBe(false)
  })
})
