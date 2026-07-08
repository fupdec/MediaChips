import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { createDrizzleClient, closeDrizzleClient } from '../client'
import { bootstrapDatabase } from '../migrationRunner'
import { createMetaRepository } from './meta'
import { createValuesInMediaRepository } from './valuesInMedia'

describe('boolean meta values', () => {
  let tmpDir: string
  let connection: ReturnType<typeof createDrizzleClient>

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-meta-bool-'))
    const dbPath = path.join(tmpDir, 'test.db')
    await bootstrapDatabase(dbPath)
    connection = createDrizzleClient(dbPath)
  })

  afterEach(() => {
    closeDrizzleClient(connection)
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('stores boolean values as strings in valuesInMedia', () => {
    const metaRepo = createMetaRepository(connection.drizzle)
    const valuesRepo = createValuesInMediaRepository(connection.drizzle)
    const meta = metaRepo.create({ type: 'boolean', name: 'Done', icon: 'check' })

    valuesRepo.bulkCreate([{ mediaId: 1, metaId: meta.id, value: true as unknown as string }])
    valuesRepo.bulkCreate([{ mediaId: 2, metaId: meta.id, value: false as unknown as string }])

    expect(valuesRepo.findAllByMediaId(1)[0]?.value).toBe('true')
    expect(valuesRepo.findAllByMediaId(2)[0]?.value).toBe('false')
  })
})
