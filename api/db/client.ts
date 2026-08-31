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

export function createDrizzleClient(
  dbPath: string,
  options: {readonly?: boolean} = {},
): DrizzleConnection {
  const sqlite = options.readonly
    ? new Database(dbPath, {readonly: true, fileMustExist: true})
    : new Database(dbPath)

  if (options.readonly) {
    // Readonly connections cannot change journal_mode; keep light pragmas only.
    try {
      sqlite.pragma('temp_store = MEMORY')
      sqlite.pragma('cache_size = -64000')
    } catch {
      // ignore pragma failures on exotic readonly mounts
    }
  } else {
    applySqlitePragmas(sqlite)
  }

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
