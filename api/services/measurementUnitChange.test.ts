/**
 * @vitest-environment node
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {closeDrizzleClient, createDrizzleClient} from '../db/client'
import {bootstrapDatabase} from '../db/migrationRunner'
import {createMetaRepository} from '../db/repositories/meta'
import {createValuesInMediaRepository} from '../db/repositories/valuesInMedia'
import {createValuesInTagRepository} from '../db/repositories/valuesInTag'
import {applyMeasurementUnitChange} from './measurementUnitChange'

describe('applyMeasurementUnitChange', () => {
  let tmpDir: string
  let connection: ReturnType<typeof createDrizzleClient>

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-unit-change-'))
    const dbPath = path.join(tmpDir, 'test.db')
    await bootstrapDatabase(dbPath)
    connection = createDrizzleClient(dbPath)
  })

  afterEach(() => {
    closeDrizzleClient(connection)
    fs.rmSync(tmpDir, {recursive: true, force: true})
  })

  function seedLengthMeta(unit: string | null = 'cm') {
    const metaRepo = createMetaRepository(connection.drizzle)
    return metaRepo.create({
      type: 'number',
      name: 'Height',
      measurementUnit: unit,
    })
  }

  it('converts tag and media values between compatible units', () => {
    const meta = seedLengthMeta('cm')
    const tagValues = createValuesInTagRepository(connection.drizzle)
    const mediaValues = createValuesInMediaRepository(connection.drizzle)

    tagValues.bulkCreate([
      {tagId: 1, metaId: meta.id, value: '160'},
      {tagId: 2, metaId: meta.id, value: 'not-a-number'},
    ])
    mediaValues.bulkCreate([
      {mediaId: 10, metaId: meta.id, value: '180'},
    ])

    const result = applyMeasurementUnitChange(connection.drizzle, meta.id, 'in')

    expect(result).toEqual({
      converted: 2,
      skipped: 1,
      fromUnit: 'cm',
      toUnit: 'in',
    })
    expect(tagValues.findAllByMetaId(meta.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({tagId: 1, value: '63'}),
      expect.objectContaining({tagId: 2, value: 'not-a-number'}),
    ]))
    expect(mediaValues.findAllByMetaId(meta.id)[0]?.value).toBe('71')
  })

  it('does not rewrite when units are the same', () => {
    const meta = seedLengthMeta('cm')
    const tagValues = createValuesInTagRepository(connection.drizzle)
    tagValues.bulkCreate([{tagId: 1, metaId: meta.id, value: '160'}])

    const result = applyMeasurementUnitChange(connection.drizzle, meta.id, 'cm')

    expect(result).toEqual({
      converted: 0,
      skipped: 0,
      fromUnit: 'cm',
      toUnit: 'cm',
    })
    expect(tagValues.findAllByMetaId(meta.id)[0]?.value).toBe('160')
  })

  it('skips incompatible kinds without writing', () => {
    const meta = seedLengthMeta('cm')
    const tagValues = createValuesInTagRepository(connection.drizzle)
    tagValues.bulkCreate([{tagId: 1, metaId: meta.id, value: '160'}])

    const result = applyMeasurementUnitChange(connection.drizzle, meta.id, 'kg')

    expect(result).toEqual({
      converted: 0,
      skipped: 0,
      fromUnit: 'cm',
      toUnit: 'kg',
    })
    expect(tagValues.findAllByMetaId(meta.id)[0]?.value).toBe('160')
  })

  it('skips conversion when previous unit is unset', () => {
    const meta = seedLengthMeta(null)
    const tagValues = createValuesInTagRepository(connection.drizzle)
    tagValues.bulkCreate([{tagId: 1, metaId: meta.id, value: '160'}])

    const result = applyMeasurementUnitChange(connection.drizzle, meta.id, 'in')

    expect(result).toEqual({
      converted: 0,
      skipped: 0,
      fromUnit: null,
      toUnit: 'in',
    })
    expect(tagValues.findAllByMetaId(meta.id)[0]?.value).toBe('160')
  })
})
