import { runDrizzleMigrations, resetSqliteDatabase } from './drizzleMigrations'
import { runPostMigrations, type PostMigrationOptions } from './postMigrations'

export async function bootstrapDatabase(dbPath: string) {
  runDrizzleMigrations(dbPath)
  runPostMigrations(dbPath)
}

export async function resetDatabaseAndRunMigrations(
  dbPath: string,
  options: PostMigrationOptions = {},
) {
  resetSqliteDatabase(dbPath)
  runDrizzleMigrations(dbPath)
  runPostMigrations(dbPath, options)
}

