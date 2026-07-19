import {
  TPDB_SOURCE_UNITS,
  isMeasurementScraperKey,
  type MeasurementScraperKey,
  type MeasurementUnit,
} from '@shared/measurementUnits'

export type MeasurementUnitPromptField = {
  metaId: number
  metaName: string
  scraperKey: MeasurementScraperKey
  suggestedUnit: MeasurementUnit | null
}

export function suggestedUnitForScraperKey(scraperKey: string): MeasurementUnit | null {
  if (!isMeasurementScraperKey(scraperKey)) return null
  return TPDB_SOURCE_UNITS[scraperKey]
}
