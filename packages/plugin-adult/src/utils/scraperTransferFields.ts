import Countries from '@/assets/Countries'
import { areScraperValuesEqual } from './scraperValueCompare'
import { normalizeScraperExtras } from './scraperFieldNormalize'
import type { Meta, Tag } from '@/types/stores'
import type {
  ScraperPinnedItem,
  ScraperSelectedResult,
  ScraperTransferField,
} from '../types/scraper'

function cloneTransferValue(value: unknown): unknown {
  if (Array.isArray(value)) return [...value]
  if (value && typeof value === 'object') return {...value as Record<string, unknown>}
  return value
}

function parseSynonymValues(value: unknown): string[] {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function mergeSynonymValues(current: unknown, scraped: unknown): string {
  const merged = [...new Set([...parseSynonymValues(current), ...parseSynonymValues(scraped)])]
  return merged.join(', ')
}

function synonymsAlreadyContain(current: unknown, scraped: unknown): boolean {
  const currentSet = new Set(parseSynonymValues(current).map((name) => name.toLowerCase()))
  const scrapedList = parseSynonymValues(scraped)
  return scrapedList.length > 0
    && scrapedList.every((name) => currentSet.has(name.toLowerCase()))
}

function mergeBookmarkValues(current: unknown, scraped: unknown): string {
  const currentText = String(current || '').trim()
  const scrapedText = String(scraped || '').trim()
  if (!scrapedText) return currentText
  if (!currentText) return scrapedText
  if (currentText.includes(scrapedText)) return currentText
  return `${currentText}\n\n${scrapedText}`
}

function bookmarkAlreadyContains(current: unknown, scraped: unknown): boolean {
  const scrapedText = String(scraped || '').trim()
  if (!scrapedText) return true
  return String(current || '').trim().includes(scrapedText)
}

function formatScraperAliases(
  aliases: unknown,
  performerName?: string | null,
): string | null {
  if (!Array.isArray(aliases)) return null

  const names = aliases
    .map((entry) => String(entry ?? '').trim())
    .filter(Boolean)
    .filter((name) => !performerName || name.toLowerCase() !== performerName.toLowerCase())

  if (!names.length) return null
  return names.join(', ')
}

function findCountryByCode(code: unknown): string | null {
  const normalized = String(code || '').trim()
  if (!normalized) return null

  const byCode = Countries.find(
    (item) => item.code.toLowerCase() === normalized.toLowerCase(),
  )
  return byCode?.name || null
}

function findCountryByName(name: unknown): string | null {
  const normalized = String(name || '').trim()
  if (!normalized) return null

  const byName = Countries.find(
    (item) => item.name.toLowerCase() === normalized.toLowerCase(),
  )
  return byName?.name || normalized
}

function resolveCountryName(values: Record<string, unknown>): string | null {
  const byCode = findCountryByCode(values.birthplace_code ?? values.country)
  if (byCode) return byCode

  const birthplace = String(values.birthplace || '').trim()
  if (birthplace) {
    return findCountryByName(birthplace)
  }

  const nationality = String(values.nationality || '').trim()
  if (!nationality) return null

  return findCountryByName(nationality)
}

const PERFORMER_COUNTRY_KEYS = [
  'birthplace',
  'birthplace_code',
  'nationality',
  'country',
] as const

export function collectPerformerScraperValues(
  performer: Record<string, unknown>,
): Record<string, unknown> {
  const extras = (performer.extras && typeof performer.extras === 'object')
    ? {...performer.extras as Record<string, unknown>}
    : {}

  for (const key of PERFORMER_COUNTRY_KEYS) {
    const rootValue = performer[key]
    if ((extras[key] == null || extras[key] === '') && rootValue != null && rootValue !== '') {
      extras[key] = rootValue
    }
  }

  return extras
}

export function mergeCountryValues(current: unknown, scraped: unknown): string[] {
  const currentList = Array.isArray(current) ? [...current] : []
  const scrapedList = Array.isArray(scraped)
    ? scraped.map((entry) => String(entry)).filter(Boolean)
    : scraped
      ? [String(scraped)]
      : []

  for (const name of scrapedList) {
    if (name && !currentList.includes(name)) {
      currentList.push(name)
    }
  }

  return currentList
}

export function buildScraperTransferFields({
  selected,
  pinned,
  currentValues,
  tags,
}: {
  selected: ScraperSelectedResult
  pinned: ScraperPinnedItem[]
  currentValues: Record<string, unknown>
  tags: Tag[]
}): ScraperTransferField[] {
  const values = collectPerformerScraperValues(selected as Record<string, unknown>)
  normalizeScraperExtras(values)

  const data: ScraperTransferField[] = []
  const metas = pinned.filter((item) => item.scraper)

  const countryName = resolveCountryName(values)
  if (countryName) {
    const currentCountry = (currentValues.country as string[]) || []
    data.push({
      dataType: 'country',
      valueCurrent: currentCountry,
      valueReserved: [...currentCountry],
      valueScraper: [countryName],
      isTagExists: false,
      key: 'country',
      meta: { id: 0, icon: 'flag', name: 'Country' } satisfies Meta,
      isTransfered: false,
      isAlreadyContain: currentCountry.includes(countryName),
    })
  }

  const scrapedSynonyms = formatScraperAliases(selected.aliases, selected.name)
  if (scrapedSynonyms) {
    const currentSynonyms = String(currentValues.synonyms || '')
    data.push({
      dataType: 'synonyms',
      valueCurrent: currentSynonyms,
      valueReserved: currentSynonyms,
      valueScraper: scrapedSynonyms,
      isTagExists: false,
      key: 'synonyms',
      meta: { id: 0, icon: 'alphabetical', name: 'Synonyms' } satisfies Meta,
      isTransfered: false,
      isAlreadyContain: synonymsAlreadyContain(currentSynonyms, scrapedSynonyms),
    })
  }

  const scrapedBio = String(selected.bio || '').trim()
  if (scrapedBio) {
    const currentBookmark = String(currentValues.bookmark || '')
    data.push({
      dataType: 'bookmark',
      valueCurrent: currentBookmark,
      valueReserved: currentBookmark,
      valueScraper: scrapedBio,
      isTagExists: false,
      key: 'bio',
      meta: { id: 0, icon: 'bookmark', name: 'bookmark' } satisfies Meta,
      isTransfered: false,
      isAlreadyContain: bookmarkAlreadyContains(currentBookmark, scrapedBio),
    })
  }

  metas.forEach((metaItem) => {
    if (!metaItem.meta) return

    const valueScraper = values[metaItem.scraper as string]
    if (valueScraper == null || valueScraper === '') return

    const pinnedKey = metaItem.pinnedMetaId
    let val = pinnedKey != null ? currentValues[pinnedKey] : null
    let isTagExists = false

    if (metaItem.meta.type === 'array') {
      if (Array.isArray(val) && val.length) {
        val = val.map((id) => {
          const tag = tags.find((entry) => Number(entry.id) === Number(id))
          return tag ? tag.name : id
        })
      } else {
        val = []
      }

      isTagExists = tags
        .filter((tag) => tag.metaId === metaItem.meta?.id)
        .some((tag) => tag.name?.toLowerCase() === String(valueScraper).toLowerCase())
    }

    let isAlreadyContain = false
    if (Array.isArray(val) && val.length) {
      isAlreadyContain = val.includes(valueScraper)
    }
    if (!isAlreadyContain) {
      isAlreadyContain = areScraperValuesEqual(val, valueScraper, metaItem.meta.type)
    }

    data.push({
      dataType: metaItem.meta.type,
      valueCurrent: cloneTransferValue(val),
      valueReserved: cloneTransferValue(val),
      valueScraper,
      isTagExists,
      key: metaItem.scraper as string,
      meta: {...metaItem.meta},
      isTransfered: false,
      isAlreadyContain,
    })
  })

  return data
}

export {
  bookmarkAlreadyContains,
  findCountryByCode,
  findCountryByName,
  formatScraperAliases,
  mergeBookmarkValues,
  mergeSynonymValues,
  parseSynonymValues,
  resolveCountryName,
  synonymsAlreadyContain,
}
