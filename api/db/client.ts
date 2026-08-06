import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import { applySqlitePragmas } from './pragmas'
import { registerMediaGroupByFunctions } from './mediaGroupByFunctions'

export type DrizzleSchema = typeof schema

export type DrizzleClient = BetterSQLite3Database<DrizzleSchema>

export type DrizzleConnection = {
  sqlite: Database.Database
  drizzle: DrizzleClient
}

export function createDrizzleClient(dbPath: string): DrizzleConnection {
  const sqlite = new Database(dbPath)
  applySqlitePragmas(sqlite)
  registerMediaGroupByFunctions(sqlite)
  const drizzleDb = drizzle(sqlite, {schema})

  return {
    sqlite,
    drizzle: drizzleDb,
  }
}

export function closeDrizzleClient(connection: Pick<DrizzleConnection, 'sqlite'>) {
  connection.sqlite.close()
}
