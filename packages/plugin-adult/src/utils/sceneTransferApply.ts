import type { ScraperTransferField } from '../types/scraper'

function cloneTransferValue(value: unknown): unknown {
  if (Array.isArray(value)) return [...value]
  if (value && typeof value === 'object') return {...value as Record<string, unknown>}
  return value
}

function normalizeNameList(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  return value
    .map((entry) => String(entry ?? '').trim())
    .filter(Boolean)
}

function areNameListsEqual(current: unknown, reserved: unknown): boolean {
  const currentNames = normalizeNameList(current)
  const reservedNames = normalizeNameList(reserved)

  if (currentNames.length !== reservedNames.length) return false

  const reservedSet = new Set(reservedNames.map((name) => name.toLowerCase()))
  return currentNames.every((name) => reservedSet.has(name.toLowerCase()))
}

function syncArrayValueFromTags(item: ScraperTransferField) {
  if (!item.scrapedTags?.length) return

  const reservedNames = normalizeNameList(item.valueReserved)
  const reservedLower = new Set(reservedNames.map((name) => name.toLowerCase()))
  const merged = [...reservedNames]

  for (const tag of item.scrapedTags) {
    if (!tag.selected || tag.alreadyAssigned) continue

    const normalized = tag.name.toLowerCase()
    if (reservedLower.has(normalized)) continue

    merged.push(tag.name)
    reservedLower.add(normalized)
  }

  item.valueCurrent = merged
  item.isTransfered = !areNameListsEqual(merged, item.valueReserved)
}

function transferField(item: ScraperTransferField) {
  if (item.isTransfered || item.isAlreadyContain) return

  if (item.dataType === 'array' && item.scrapedTags?.length) {
    for (const tag of item.scrapedTags) {
      if (!tag.alreadyAssigned) {
        tag.selected = true
      }
    }
    syncArrayValueFromTags(item)
    return
  }

  if (item.dataType === 'bookmark' || item.dataType === 'mediaName') {
    item.valueCurrent = item.valueScraper
  } else {
    item.valueCurrent = item.valueScraper
  }

  item.isTransfered = true
}

export function applyTransferAllToFields(fields: ScraperTransferField[]): ScraperTransferField[] {
  for (const item of fields) {
    if (!item.isAlreadyContain) {
      transferField(item)
    }
  }

  return fields
}
