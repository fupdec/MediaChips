import {describe, expect, it} from 'vitest'
import {mapWithConcurrency} from './mapWithConcurrency'

describe('mapWithConcurrency', () => {
  it('maps empty input', async () => {
    expect(await mapWithConcurrency([], 2, async (x) => x)).toEqual([])
  })

  it('preserves order with limited workers', async () => {
    const started: number[] = []
    const result = await mapWithConcurrency([1, 2, 3, 4], 2, async (item, index) => {
      started.push(index)
      await new Promise((resolve) => setTimeout(resolve, item === 1 ? 20 : 1))
      return item * 10
    })
    expect(result).toEqual([10, 20, 30, 40])
    expect(started).toHaveLength(4)
  })
})
