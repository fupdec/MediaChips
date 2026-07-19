import ScraperFields from '../assets/ScraperFields'
import { parseMeasurementNumber } from '@shared/measurementUnits'

type ScraperFieldTemplate = {
  key: string
  type: string
  name?: string
}

const SCRAPER_FIELD_BY_KEY = new Map(
  (ScraperFields as ScraperFieldTemplate[]).map((field) => [field.key, field]),
)

export function getScraperFieldType(scraperKey: unknown): string | null {
  if (typeof scraperKey !== 'string' || !scraperKey) return null
  return SCRAPER_FIELD_BY_KEY.get(scraperKey)?.type ?? null
}

/**
 * Hard check: mapped meta type must equal the scraper field template type.
 */
export function isScraperMetaTypeCompatible(
  scraperKey: unknown,
  metaType: unknown,
): boolean {
  const expected = getScraperFieldType(scraperKey)
  if (!expected) return false
  return String(metaType || '') === expected
}

/**
 * Coerce a scraped value to the target meta type.
 * Returns null when the value cannot be safely represented as that type.
 */
export function coerceScraperValueToMetaType(
  value: unknown,
  metaType: unknown,
): unknown | null {
  if (value == null || value === '') return null

  switch (String(metaType || '')) {
    case 'number': {
      const num = parseMeasurementNumber(value)
      if (num == null || !Number.isFinite(num)) return null
      return String(Number.isInteger(num) ? num : Math.round(num))
    }
    case 'date': {
      const text = String(value).trim()
      // Keep ISO-like dates; reject clearly non-date blobs.
      if (!/^\d{4}([-/.])\d{1,2}\1\d{1,2}$/.test(text) && !/^\d{4}$/.test(text)) {
        return null
      }
      return text
    }
    case 'boolean': {
      const text = String(value).trim().toLowerCase()
      if (['1', 'true', 'yes'].includes(text)) return 'true'
      if (['0', 'false', 'no'].includes(text)) return 'false'
      return null
    }
    case 'array':
    case 'string':
      return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        ? value
        : String(value)
    default:
      return value
  }
}
