export const MEASUREMENT_LENGTH_UNITS = ['cm', 'in', 'ft_in'] as const
export const MEASUREMENT_WEIGHT_UNITS = ['kg', 'lbs'] as const
export const MEASUREMENT_UNITS = [...MEASUREMENT_LENGTH_UNITS, ...MEASUREMENT_WEIGHT_UNITS] as const

export type MeasurementLengthUnit = (typeof MEASUREMENT_LENGTH_UNITS)[number]
export type MeasurementWeightUnit = (typeof MEASUREMENT_WEIGHT_UNITS)[number]
export type MeasurementUnit = (typeof MEASUREMENT_UNITS)[number]
export type MeasurementKind = 'length' | 'weight'

export const MEASUREMENT_SCRAPER_KEYS = ['height', 'weight', 'waist', 'hips', 'bra'] as const
export type MeasurementScraperKey = (typeof MEASUREMENT_SCRAPER_KEYS)[number]

/** Known TPDB extras units when the string has no explicit suffix. */
export const TPDB_SOURCE_UNITS: Record<MeasurementScraperKey, MeasurementUnit> = {
  height: 'cm',
  weight: 'kg',
  waist: 'in',
  hips: 'in',
  bra: 'in',
}

export const MEASUREMENT_SCRAPER_KINDS: Record<MeasurementScraperKey, MeasurementKind> = {
  height: 'length',
  weight: 'weight',
  waist: 'length',
  hips: 'length',
  bra: 'length',
}

const CM_PER_INCH = 2.54
const LBS_PER_KG = 2.2046226218

export function isMeasurementUnit(value: unknown): value is MeasurementUnit {
  return typeof value === 'string' && (MEASUREMENT_UNITS as readonly string[]).includes(value)
}

export function isMeasurementScraperKey(key: unknown): key is MeasurementScraperKey {
  return typeof key === 'string' && (MEASUREMENT_SCRAPER_KEYS as readonly string[]).includes(key)
}

export function getMeasurementScraperKind(key: MeasurementScraperKey): MeasurementKind {
  return MEASUREMENT_SCRAPER_KINDS[key]
}

export function normalizeMeasurementUnit(value: unknown): MeasurementUnit | null {
  if (value == null || value === '' || value === 'none') return null
  return isMeasurementUnit(value) ? value : null
}

export function getMeasurementKind(unit: MeasurementUnit): MeasurementKind {
  return (MEASUREMENT_WEIGHT_UNITS as readonly string[]).includes(unit) ? 'weight' : 'length'
}

export function unitsForKind(kind: MeasurementKind): readonly MeasurementUnit[] {
  return kind === 'weight' ? MEASUREMENT_WEIGHT_UNITS : MEASUREMENT_LENGTH_UNITS
}

export function canConvertMeasurementUnits(
  from: MeasurementUnit | null,
  to: MeasurementUnit | null,
): boolean {
  if (!from || !to) return false
  return getMeasurementKind(from) === getMeasurementKind(to)
}

/**
 * Hard check: scraper key kind, detected/default source unit, and storage unit must all share one kind.
 */
export function assertScraperMeasurementKindsCompatible(options: {
  scraperKey: unknown
  rawValue: unknown
  storageUnit: MeasurementUnit | null
}): {ok: true; sourceUnit: MeasurementUnit; storageUnit: MeasurementUnit} | {ok: false; reason: string} {
  const {scraperKey, rawValue, storageUnit} = options

  if (!isMeasurementScraperKey(scraperKey)) {
    return {ok: false, reason: 'unknown_scraper_key'}
  }
  if (!storageUnit) {
    return {ok: false, reason: 'storage_unit_missing'}
  }

  const keyKind = getMeasurementScraperKind(scraperKey)
  const storageKind = getMeasurementKind(storageUnit)
  if (keyKind !== storageKind) {
    return {ok: false, reason: 'storage_kind_mismatch'}
  }

  const detected = detectUnitFromString(rawValue)
  if (detected && getMeasurementKind(detected) !== keyKind) {
    return {ok: false, reason: 'detected_kind_mismatch'}
  }

  const sourceUnit = detected ?? TPDB_SOURCE_UNITS[scraperKey]
  if (getMeasurementKind(sourceUnit) !== keyKind) {
    return {ok: false, reason: 'source_kind_mismatch'}
  }
  if (!canConvertMeasurementUnits(sourceUnit, storageUnit)) {
    return {ok: false, reason: 'incompatible_units'}
  }

  return {ok: true, sourceUnit, storageUnit}
}

export function parseMeasurementNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const text = String(value).trim()
  if (!text) return null

  const feetInches = text.match(/^(\d+)\s*['′]\s*(\d+(?:\.\d+)?)\s*(?:["″]|in)?$/i)
  if (feetInches) {
    const feet = Number(feetInches[1])
    const inches = Number(feetInches[2])
    if (!Number.isFinite(feet) || !Number.isFinite(inches)) return null
    return feet * 12 + inches
  }

  const match = text.match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const num = Number(match[0])
  return Number.isFinite(num) ? num : null
}

export function detectUnitFromString(value: unknown): MeasurementUnit | null {
  if (value == null || value === '') return null
  const text = String(value).trim().toLowerCase()
  if (!text) return null

  if (/\d+\s*['′]\s*\d+/.test(text) || text.includes('ft')) return 'ft_in'
  if (/(?:lbs?|pounds?)\b/.test(text)) return 'lbs'
  if (/(?:kgs?|kilograms?)\b/.test(text)) return 'kg'
  if (/(?:cms?|centimeters?|centimetres?)\b/.test(text)) return 'cm'
  if (/(?:ins?|inches|inch)\b/.test(text) || /"$/.test(text)) return 'in'
  return null
}

export function resolveScraperSourceUnit(
  scraperKey: unknown,
  rawValue: unknown,
): MeasurementUnit | null {
  const detected = detectUnitFromString(rawValue)
  if (detected) return detected
  if (!isMeasurementScraperKey(scraperKey)) return null
  return TPDB_SOURCE_UNITS[scraperKey]
}

function toCanonicalCm(value: number, unit: MeasurementLengthUnit): number {
  switch (unit) {
    case 'cm':
      return value
    case 'in':
      return value * CM_PER_INCH
    case 'ft_in':
      return value * CM_PER_INCH
  }
}

function fromCanonicalCm(cm: number, unit: MeasurementLengthUnit): number | string {
  switch (unit) {
    case 'cm':
      return Math.round(cm)
    case 'in':
      return Math.round(cm / CM_PER_INCH)
    case 'ft_in': {
      const totalInches = Math.round(cm / CM_PER_INCH)
      let feet = Math.floor(totalInches / 12)
      let inches = totalInches % 12
      if (inches === 12) {
        feet += 1
        inches = 0
      }
      return `${feet}'${inches}"`
    }
  }
}

function toCanonicalKg(value: number, unit: MeasurementWeightUnit): number {
  return unit === 'kg' ? value : value / LBS_PER_KG
}

function fromCanonicalKg(kg: number, unit: MeasurementWeightUnit): number {
  return unit === 'kg' ? Math.round(kg) : Math.round(kg * LBS_PER_KG)
}

/**
 * Convert a stored measurement between units of the same kind.
 * For ft_in, numeric values are treated as total inches when parsing plain numbers.
 */
export function convertMeasurementValue(
  value: unknown,
  fromUnit: MeasurementUnit,
  toUnit: MeasurementUnit,
): string | null {
  if (!canConvertMeasurementUnits(fromUnit, toUnit)) return null

  const num = parseMeasurementNumber(value)
  if (num == null) return null

  if (getMeasurementKind(fromUnit) === 'length') {
    const cm = toCanonicalCm(num, fromUnit as MeasurementLengthUnit)
    const converted = fromCanonicalCm(cm, toUnit as MeasurementLengthUnit)
    return String(converted)
  }

  const kg = toCanonicalKg(num, fromUnit as MeasurementWeightUnit)
  return String(fromCanonicalKg(kg, toUnit as MeasurementWeightUnit))
}

export function formatMeasurementDisplay(value: unknown, unit: MeasurementUnit | null): string {
  if (value == null || value === '') return ''
  const raw = String(value)
  if (!unit) return raw

  if (unit === 'ft_in') {
    if (/^\d+\s*['′]/.test(raw.trim())) return raw
    const converted = convertMeasurementValue(raw, 'in', 'ft_in')
    return converted ?? raw
  }

  const num = parseMeasurementNumber(raw)
  if (num == null) return raw

  switch (unit) {
    case 'cm':
      return `${Math.round(num)} cm`
    case 'in':
      return `${Math.round(num)} in`
    case 'kg':
      return `${Math.round(num)} kg`
    case 'lbs':
      return `${Math.round(num)} lbs`
    default:
      return raw
  }
}

export function convertScraperValueToStorage(
  rawValue: unknown,
  scraperKey: unknown,
  storageUnit: MeasurementUnit | null,
): string | null {
  if (rawValue == null || rawValue === '') return null

  const check = assertScraperMeasurementKindsCompatible({
    scraperKey,
    rawValue,
    storageUnit,
  })
  if (!check.ok) return null

  return convertMeasurementValue(rawValue, check.sourceUnit, check.storageUnit)
}
