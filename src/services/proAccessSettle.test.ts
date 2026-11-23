import {beforeEach, describe, expect, it, vi} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'

const {getMediaStats} = vi.hoisted(() => ({getMediaStats: vi.fn()}))
vi.mock('@/services/typedApi', () => ({typedApi: {getMediaStats}}))
vi.mock('@/services/configService', () => ({updateConfig: vi.fn(async () => ({}))}))

import {settleProAccessWithRetry} from './proAccessConfig'
import {useAppStore} from '@/stores/app'

describe('settleProAccessWithRetry', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useAppStore().config = {} as never
    getMediaStats.mockReset()
  })

  it('retries after a failed stats read and settles', async () => {
    getMediaStats.mockRejectedValueOnce(new Error('starting')).mockResolvedValue({data: {total: 0}})
    const waits: number[] = []
    const settled = await settleProAccessWithRetry([10, 20], async ms => { waits.push(ms) })
    expect(settled).toBe(true)
    expect(waits).toEqual([10])
    expect(useAppStore().config).toMatchObject({proAccessSettled: '1', proFeaturesGrandfathered: '0'})
  })

  it('gives up after the last delay when stats stay unavailable', async () => {
    getMediaStats.mockRejectedValue(new Error('down'))
    const waits: number[] = []
    expect(await settleProAccessWithRetry([10, 20], async ms => { waits.push(ms) })).toBe(false)
    expect(waits).toEqual([10, 20])
    expect(getMediaStats).toHaveBeenCalledTimes(3)
  })
})
