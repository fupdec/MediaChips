import { describe, expect, it } from 'vitest'
import {
  assertScraperMeasurementKindsCompatible,
  canConvertMeasurementUnits,
  convertMeasurementValue,
  convertScraperValueToStorage,
  detectUnitFromString,
  formatMeasurementDisplay,
  getMeasurementKind,
  normalizeMeasurementUnit,
  parseMeasurementNumber,
  resolveScraperSourceUnit,
  unitsForKind,
} from './measurementUnits'

describe('measurementUnits', () => {
  it('normalizes and derives kind from unit', () => {
    expect(normalizeMeasurementUnit(null)).toBeNull()
    expect(normalizeMeasurementUnit('none')).toBeNull()
    expect(normalizeMeasurementUnit('cm')).toBe('cm')
    expect(getMeasurementKind('cm')).toBe('length')
    expect(getMeasurementKind('kg')).toBe('weight')
    expect(unitsForKind('length')).toEqual(['cm', 'in', 'ft_in'])
    expect(canConvertMeasurementUnits('cm', 'kg')).toBe(false)
    expect(canConvertMeasurementUnits('cm', 'in')).toBe(true)
  })

  it('parses numbers and feet-inches', () => {
    expect(parseMeasurementNumber('175 cm')).toBe(175)
    expect(parseMeasurementNumber(`5'7"`)).toBe(67)
  })

  it('detects units from strings and TPDB defaults', () => {
    expect(detectUnitFromString('75kg')).toBe('kg')
    expect(detectUnitFromString('26 in')).toBe('in')
    expect(resolveScraperSourceUnit('waist', '26')).toBe('in')
    expect(resolveScraperSourceUnit('height', '165')).toBe('cm')
  })

  it('converts within length and weight', () => {
    expect(convertMeasurementValue('160', 'cm', 'in')).toBe('63')
    expect(convertMeasurementValue('63', 'in', 'cm')).toBe('160')
    expect(convertMeasurementValue('160', 'cm', 'ft_in')).toBe(`5'3"`)
    expect(convertMeasurementValue('75', 'kg', 'lbs')).toBe('165')
    expect(convertMeasurementValue('165', 'lbs', 'kg')).toBe('75')
    expect(convertMeasurementValue('26', 'in', 'kg')).toBeNull()
  })

  it('formats display with unit suffixes', () => {
    expect(formatMeasurementDisplay('160', 'cm')).toBe('160 cm')
    expect(formatMeasurementDisplay('26', 'in')).toBe('26 in')
    expect(formatMeasurementDisplay(`5'3"`, 'ft_in')).toBe(`5'3"`)
    expect(formatMeasurementDisplay('160', null)).toBe('160')
  })

  it('converts scraper values into storage units', () => {
    expect(convertScraperValueToStorage('26', 'waist', 'cm')).toBe('66')
    expect(convertScraperValueToStorage('165', 'height', 'cm')).toBe('165')
    expect(convertScraperValueToStorage('175cm', 'height', 'cm')).toBe('175')
    expect(convertScraperValueToStorage('75kg', 'weight', 'kg')).toBe('75')
    expect(convertScraperValueToStorage('165 cm', 'height', 'in')).toBe('65')
    expect(convertScraperValueToStorage('75kg', 'weight', 'lbs')).toBe('165')
    expect(convertScraperValueToStorage('38', 'bra', 'cm')).toBe('97')
    expect(convertScraperValueToStorage('38DD', 'bra', 'cm')).toBe('97')
    expect(resolveScraperSourceUnit('bra', '38')).toBe('in')
  })

  it('rejects kind mismatches hard', () => {
    expect(convertScraperValueToStorage('75kg', 'height', 'cm')).toBeNull()
    expect(convertScraperValueToStorage('175cm', 'weight', 'kg')).toBeNull()
    expect(convertScraperValueToStorage('38', 'bra', 'kg')).toBeNull()
    expect(convertScraperValueToStorage('75', 'weight', 'cm')).toBeNull()
    expect(convertScraperValueToStorage('175', 'height', null)).toBeNull()
    expect(assertScraperMeasurementKindsCompatible({
      scraperKey: 'height',
      rawValue: '75kg',
      storageUnit: 'cm',
    })).toEqual({ok: false, reason: 'detected_kind_mismatch'})
  })
})
