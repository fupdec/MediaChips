import {beforeEach, describe, expect, it, vi} from 'vitest'

const {updateConfig, getMediaStats} = vi.hoisted(() => ({
  updateConfig: vi.fn().mockResolvedValue(undefined),
  getMediaStats: vi.fn().mockResolvedValue({data: {total: 0}}),
}))

const appConfig = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
}))

const registrationState = vi.hoisted(() => ({
  libraryCount: 0,
}))

vi.mock('@/services/configService', () => ({
  updateConfig,
}))

vi.mock('@/services/typedApi', () => ({
  typedApi: {
    getMediaStats,
  },
}))

vi.mock('@/stores/app', () => ({
  useAppStore: () => ({
    get config() {
      return appConfig.value
    },
    set config(next: Record<string, unknown>) {
      appConfig.value = next
    },
  }),
}))

vi.mock('@/stores/registration', () => ({
  useRegistrationStore: () => registrationState,
}))

describe('freeLibraryCapConfig', () => {
  beforeEach(() => {
    appConfig.value = {}
    registrationState.libraryCount = 0
    updateConfig.mockClear()
    getMediaStats.mockReset()
    getMediaStats.mockResolvedValue({data: {total: 0}})
  })

  it('settles without grandfathering a small library', async () => {
    const {settleFreeLibraryCapIfNeeded, isFreeLibraryGrandfathered, isFreeLibraryCapSettled} = await import(
      './freeLibraryCapConfig'
    )
    getMediaStats.mockResolvedValue({data: {total: 40}})

    await settleFreeLibraryCapIfNeeded()

    expect(updateConfig).toHaveBeenCalledWith({
      freeLibraryCapSettled: '1',
      freeLibraryGrandfathered: '0',
    })
    expect(isFreeLibraryCapSettled()).toBe(true)
    expect(isFreeLibraryGrandfathered()).toBe(false)
  })

  it('grandfathers a library already over the free cap', async () => {
    const {settleFreeLibraryCapIfNeeded, isFreeLibraryGrandfathered} = await import(
      './freeLibraryCapConfig'
    )
    getMediaStats.mockResolvedValue({data: {total: 250}})

    await settleFreeLibraryCapIfNeeded()

    expect(updateConfig).toHaveBeenCalledWith({
      freeLibraryCapSettled: '1',
      freeLibraryGrandfathered: '1',
    })
    expect(isFreeLibraryGrandfathered()).toBe(true)
  })

  it('does not re-run after settle even if library grows via backup', async () => {
    appConfig.value = {
      freeLibraryCapSettled: '1',
      freeLibraryGrandfathered: '0',
    }
    const {settleFreeLibraryCapIfNeeded, isFreeLibraryGrandfathered} = await import(
      './freeLibraryCapConfig'
    )
    getMediaStats.mockResolvedValue({data: {total: 5000}})

    await settleFreeLibraryCapIfNeeded()

    expect(updateConfig).not.toHaveBeenCalled()
    expect(getMediaStats).not.toHaveBeenCalled()
    expect(isFreeLibraryGrandfathered()).toBe(false)
  })

  it('defers settle when media stats fail', async () => {
    const {settleFreeLibraryCapIfNeeded, isFreeLibraryCapSettled} = await import(
      './freeLibraryCapConfig'
    )
    getMediaStats.mockRejectedValue(new Error('offline'))

    await settleFreeLibraryCapIfNeeded()

    expect(updateConfig).not.toHaveBeenCalled()
    expect(isFreeLibraryCapSettled()).toBe(false)
  })
})
