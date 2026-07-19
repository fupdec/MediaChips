import { describe, expect, it } from 'vitest'
import {
  convertMeasurementValue,
  convertScraperValueToStorage,
  formatMeasurementDisplay,
  normalizeMeasurementUnit,
} from './measurementUnits'

describe('measurementUnits re-export', () => {
  it('exposes shared helpers', () => {
    expect(normalizeMeasurementUnit('cm')).toBe('cm')
    expect(convertMeasurementValue('160', 'cm', 'in')).toBe('63')
    expect(convertScraperValueToStorage('26', 'waist', 'cm')).toBe('66')
    expect(formatMeasurementDisplay('160', 'cm')).toBe('160 cm')
  })
})
