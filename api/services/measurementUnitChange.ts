import {
  canConvertMeasurementUnits,
  convertMeasurementValue,
  normalizeMeasurementUnit,
  type MeasurementUnit,
} from '../../shared/measurementUnits'
import type { DrizzleClient } from '../db/client'
import { createMetaRepository } from '../db/repositories/meta'
import { createValuesInMediaRepository } from '../db/repositories/valuesInMedia'
import { createValuesInTagRepository } from '../db/repositories/valuesInTag'

export type MeasurementUnitChangeResult = {
  converted: number
  skipped: number
  fromUnit: MeasurementUnit | null
  toUnit: MeasurementUnit | null
}

export function applyMeasurementUnitChange(
  db: DrizzleClient,
  metaId: number,
  nextUnitRaw: unknown,
): MeasurementUnitChangeResult {
  const metaRepo = createMetaRepository(db)
  const valuesInTagRepo = createValuesInTagRepository(db)
  const valuesInMediaRepo = createValuesInMediaRepository(db)

  const current = metaRepo.findById(metaId)
  const fromUnit = normalizeMeasurementUnit(current?.measurementUnit)
  const toUnit = normalizeMeasurementUnit(nextUnitRaw)

  let converted = 0
  let skipped = 0

  if (fromUnit && toUnit && fromUnit !== toUnit && canConvertMeasurementUnits(fromUnit, toUnit)) {
    for (const row of valuesInTagRepo.findAllByMetaId(metaId)) {
      const next = convertMeasurementValue(row.value, fromUnit, toUnit)
      if (next == null) {
        skipped += 1
        continue
      }
      valuesInTagRepo.updateValue(row.tagId, metaId, next)
      converted += 1
    }

    for (const row of valuesInMediaRepo.findAllByMetaId(metaId)) {
      const next = convertMeasurementValue(row.value, fromUnit, toUnit)
      if (next == null) {
        skipped += 1
        continue
      }
      valuesInMediaRepo.updateValue(row.mediaId, metaId, next)
      converted += 1
    }
  }

  return {converted, skipped, fromUnit, toUnit}
}
