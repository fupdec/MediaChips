import { describe, expect, it } from 'vitest'
import { parseScraperPerformerSearchResponse } from '@/schemas/scraper'

describe('scraper schemas', () => {
  it('parses performer search response', () => {
    const response = parseScraperPerformerSearchResponse({
      data: [{ slug: 'jane-doe', posters: [{ url: 'https://example.com/p.jpg' }] }],
    })

    expect(response.data?.[0]?.slug).toBe('jane-doe')
  })
})
