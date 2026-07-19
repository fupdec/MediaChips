export function extractScraperDigits(value: unknown): string | null {
  if (value == null || value === '') return null

  const match = String(value).trim().match(/\d+/)
  return match?.[0] ?? null
}

export function extractScraperLetters(value: unknown): string | null {
  if (value == null || value === '') return null

  const match = String(value).trim().match(/[A-Za-z]+/)
  return match?.[0] ?? null
}

export function normalizeScraperExtras(values: Record<string, unknown>): void {
  const cupsizeRaw = values.cupsize

  values.bra = extractScraperDigits(cupsizeRaw)
  values.cupsize = extractScraperLetters(cupsizeRaw)

  if (values.height != null && values.height !== '') {
    values.height = extractScraperDigits(values.height)
  }

  if (values.weight != null && values.weight !== '') {
    values.weight = extractScraperDigits(values.weight)
  }

  if (values.waist != null && values.waist !== '') {
    values.waist = extractScraperDigits(values.waist)
  }

  if (values.hips != null && values.hips !== '') {
    values.hips = extractScraperDigits(values.hips)
  }

  if (values.fake_boobs || values.fake_boobs === false) {
    values.fake_boobs = values.fake_boobs ? 'Fake' : 'Real'
  }
}
