import { describe, expect, it } from 'vitest'
import { applyTransferAllToFields } from './sceneTransferApply'
import type { ScraperTransferField } from '../types/scraper'

describe('sceneTransferApply', () => {
  it('transfers all non-contained fields', () => {
    const fields: ScraperTransferField[] = [
      {
        dataType: 'bookmark',
        valueCurrent: '',
        valueReserved: '',
        valueScraper: 'Details text',
        key: 'details',
        meta: { id: 0, icon: 'bookmark', name: 'bookmark' },
        isTransfered: false,
        isAlreadyContain: false,
      },
      {
        dataType: 'string',
        valueCurrent: 'old',
        valueReserved: 'old',
        valueScraper: 'old',
        key: 'release_date',
        meta: { id: 1, icon: 'calendar', name: 'date', type: 'date' },
        isTransfered: false,
        isAlreadyContain: true,
      },
    ]

    const result = applyTransferAllToFields(fields)

    expect(result[0].isTransfered).toBe(true)
    expect(result[0].valueCurrent).toBe('Details text')
    expect(result[1].isTransfered).toBe(false)
  })
})
