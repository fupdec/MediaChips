import {describe, expect, it} from 'vitest'
import {countBulkScrapeStatuses} from './bulkScrapeStatusCounts'

describe('countBulkScrapeStatuses', () => {
  it('counts statuses and cancelled items separately', () => {
    expect(countBulkScrapeStatuses([
      {status: 'pending'},
      {status: 'searching'},
      {status: 'done'},
      {status: 'not_found'},
      {status: 'error'},
      {status: 'error', error: 'cancelled'},
    ])).toEqual({
      total: 6,
      pending: 1,
      searching: 1,
      done: 1,
      notFound: 1,
      error: 1,
      cancelled: 1,
    })
  })
})
