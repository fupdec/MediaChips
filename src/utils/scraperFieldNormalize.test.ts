import { describe, expect, it } from 'vitest'
import {
  extractScraperDigits,
  extractScraperLetters,
  normalizeScraperExtras,
} from '@/utils/scraperFieldNormalize'

describe('scraperFieldNormalize', () => {
  it('splits combined bra size into band digits and cup letters', () => {
    const values: Record<string, unknown> = { cupsize: '38DD' }

    normalizeScraperExtras(values)

    expect(values.bra).toBe('38')
    expect(values.cupsize).toBe('DD')
  })

  it('does not put letters into bra when band size is missing', () => {
    const values: Record<string, unknown> = { cupsize: 'NN' }

    normalizeScraperExtras(values)

    expect(values.bra).toBeNull()
    expect(values.cupsize).toBe('NN')
  })

  it('keeps only digits for numeric body fields', () => {
    const values: Record<string, unknown> = {
      height: '175 cm',
      weight: '75kg',
    }

    normalizeScraperExtras(values)

    expect(values.height).toBe('175')
    expect(values.weight).toBe('75')
  })
})

describe('extractScraperDigits', () => {
  it('returns null when there are no digits', () => {
    expect(extractScraperDigits('NN')).toBeNull()
  })
})

describe('extractScraperLetters', () => {
  it('returns null when there are no letters', () => {
    expect(extractScraperLetters('38')).toBeNull()
  })
})
