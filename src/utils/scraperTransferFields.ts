import Countries from '@/assets/Countries'
import { areScraperValuesEqual } from '@/utils/scraperValueCompare'
import { normalizeScraperExtras } from '@/utils/scraperFieldNormalize'
import type { Meta, Tag } from '@/types/stores'
import type {
  ScraperPinnedItem,
  ScraperSelectedResult,
  ScraperTransferField,
} from '@/types/scraper'

function cloneTransferValue(value: unknown): unknown {
  if (Array.isArray(value)) return [...value]
  if (value && typeof value === 'object') return {...value as Record<string, unknown>}
  return value
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
  const values = selected.extras
  if (!values) return []

  normalizeScraperExtras(values)

  const data: ScraperTransferField[] = []
  const metas = pinned.filter((item) => item.scraper)

  const birthplaceCode = values.birthplace_code
  const foundCountry = Countries.find((item) => item.code === birthplaceCode)
  if (foundCountry) {
    const currentCountry = (currentValues.country as string[]) || []
    data.push({
      dataType: 'country',
      valueCurrent: currentCountry,
      valueReserved: [...currentCountry],
      valueScraper: [foundCountry.name],
      isTagExists: false,
      key: 'country',
      meta: { id: 0, icon: 'flag' } satisfies Meta,
      isTransfered: false,
      isAlreadyContain: currentCountry.includes(foundCountry.name),
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
