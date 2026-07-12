import type { ServerDatabaseEntry } from '../types/server'
import { apiErrorMessage } from '../../api/types/errors'
import path from 'path'
import { createDrizzleClient, smokeTestDrizzle } from '../../api/db'
import { bootstrapDatabase } from '../../api/db/migrationRunner'
import { createApiDb } from '../../api/createApiDb'
import { scheduleLegacyTimelineCleanup } from '../../api/services/legacyTimelineCleanup'

function setupDatabase({databasesPath, dbConfig}: { databasesPath: string; dbConfig: ServerDatabaseEntry | undefined }) {
  if (!dbConfig) {
    console.error('\x1b[31m%s\x1b[0m', '❌ No active database to connect to!')
    process.exit(1)
  }

  console.log('\x1b[36m%s\x1b[0m', `Connecting to database: ${dbConfig.name} (${dbConfig.id})`)

  const dbPath = path.join(databasesPath, dbConfig.id, 'db.sqlite')
  const drizzleConnection = createDrizzleClient(dbPath)

  const db = createApiDb({
    drizzleConnection,
    config: dbConfig,
    path: path.join(databasesPath, dbConfig.id),
    path_databases: databasesPath,
  })

  console.log('\x1b[36m%s\x1b[0m', '✅ Database connection successful')
  console.log('\x1b[36m%s\x1b[0m', `Database ID: ${db.config?.id}`)

  bootstrapDatabase(dbPath).then(() => {
    console.log('\x1b[36m%s\x1b[0m', '✅ Database synchronized')
    console.log('\x1b[32m%s\x1b[0m', '✅ Migrations applied')

    const mediaCount = smokeTestDrizzle(db.drizzle)
    console.log('\x1b[32m%s\x1b[0m', `✅ Drizzle connected (${mediaCount} media rows)`)
    scheduleLegacyTimelineCleanup(db)
  }).catch((err: unknown) => {
    console.log('\x1b[33m%s\x1b[0m', '⚠️ Database bootstrap error:', err instanceof Error ? apiErrorMessage(err) : String(err))
  })

  return {db, drizzleConnection}
}

export { setupDatabase }
