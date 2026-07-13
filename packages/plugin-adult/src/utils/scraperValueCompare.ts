function normalizeText(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function normalizeArray(values: unknown[]): string {
  return values
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .sort()
    .join('|')
}

function areScalarValuesEqual(current: unknown, scraper: unknown): boolean {
  const currentText = normalizeText(current)
  const scraperText = normalizeText(scraper)

  if (currentText === scraperText) return true
  if (!currentText || !scraperText) return false

  const currentNumber = Number(current)
  const scraperNumber = Number(scraper)
  if (!Number.isNaN(currentNumber) && !Number.isNaN(scraperNumber)) {
    return currentNumber === scraperNumber
  }

  return false
}

export function areScraperValuesEqual(
  current: unknown,
  scraper: unknown,
  dataType?: string,
): boolean {
  if (scraper == null || scraper === '') return false

  if (dataType === 'country') {
    const countries = Array.isArray(current) ? current : []
    const foundCountry = Array.isArray(scraper) ? scraper[0] : scraper
    if (foundCountry == null || foundCountry === '') return false
    return countries.some(
      (country) => normalizeText(country) === normalizeText(foundCountry),
    )
  }

  if (dataType === 'array') {
    const currentValues = Array.isArray(current) ? current : []
    if (!currentValues.length) return false
    return currentValues.some(
      (value) => normalizeText(value) === normalizeText(scraper),
    )
  }

  if (Array.isArray(current) && Array.isArray(scraper)) {
    return normalizeArray(current) === normalizeArray(scraper)
  }

  if (Array.isArray(current)) {
    if (current.length === 1) {
      return areScalarValuesEqual(current[0], scraper)
    }
    return false
  }

  return areScalarValuesEqual(current, scraper)
}
