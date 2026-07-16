import Database from 'better-sqlite3'
import { applySqlitePragmas } from './pragmas'
import { seedDefaults } from './seedDefaults'
import { seedDemoMetadata } from './seedDemoMetadata'
import { runLegacyUpgrades } from './legacyUpgrades'
import { repairSchemaColumns, repairMissingTables, repairMissingIndexes } from './schemaRepair'
import { ensureSearchFtsIndex } from './searchFts'

export type PostMigrationOptions = {
  /** When false, skip sample Color tags seed (e.g. during LowDB migration). Default true. */
  seedDemo?: boolean
}

export function runPostMigrations(dbPath: string, options: PostMigrationOptions = {}) {
  const sqlite = new Database(dbPath)
  const seedDemo = options.seedDemo !== false

  try {
    applySqlitePragmas(sqlite)
    seedDefaults(sqlite)
    if (seedDemo) {
      seedDemoMetadata(sqlite)
    }
    const repairedColumns = repairSchemaColumns(sqlite)
    if (repairedColumns.length) {
      console.log('\x1b[33m%s\x1b[0m', `⚙️ Repaired schema columns: ${repairedColumns.join(', ')}`)
    }
    const repairedTables = repairMissingTables(sqlite)
    if (repairedTables.length) {
      console.log('\x1b[33m%s\x1b[0m', `⚙️ Repaired schema tables: ${repairedTables.join(', ')}`)
    }
    const repairedIndexes = repairMissingIndexes(sqlite)
    if (repairedIndexes.length) {
      console.log('\x1b[33m%s\x1b[0m', `⚙️ Repaired schema indexes: ${repairedIndexes.join(', ')}`)
    }
    const installedFts = ensureSearchFtsIndex(sqlite)
    if (installedFts.length) {
      console.log('\x1b[33m%s\x1b[0m', `⚙️ Installed search FTS indexes: ${installedFts.join(', ')}`)
    }
    runLegacyUpgrades(sqlite)
  } finally {
    sqlite.close()
  }
}

