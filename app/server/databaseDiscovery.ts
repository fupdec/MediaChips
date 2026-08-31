import fs from 'fs'
import path from 'path'
import type { ServerDatabaseEntry } from '../types/server'

/**
 * Finds database directories that exist on disk but are missing from config.
 * Only immediate child directories containing db.sqlite are considered.
 */
export function discoverDatabaseEntries(
  databasesPath: string,
  configuredDatabases: ServerDatabaseEntry[],
): ServerDatabaseEntry[] {
  if (!fs.existsSync(databasesPath)) return []

  const configuredIds = new Set(configuredDatabases.map(database => database.id))
  const discovered: ServerDatabaseEntry[] = []

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(databasesPath, {withFileTypes: true})
  } catch (error: unknown) {
    console.error('⚠️ Failed to scan database directory:', error)
    return []
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    // readdirSync gives us a basename, preventing path traversal through IDs.
    const id = entry.name
    if (!id || id === '.' || id === '..' || configuredIds.has(id)) continue

    const databasePath = path.join(databasesPath, id)
    const sqlitePath = path.join(databasePath, 'db.sqlite')
    try {
      if (!fs.statSync(sqlitePath).isFile()) continue
    } catch {
      continue
    }

    discovered.push({
      id,
      name: id,
      active: false,
      createdAt: getCreationTime(sqlitePath),
    })
    configuredIds.add(id)
  }

  return discovered
}

function getCreationTime(filePath: string): number {
  try {
    const birthtime = fs.statSync(filePath).birthtimeMs
    return Number.isFinite(birthtime) ? birthtime : Date.now()
  } catch {
    return Date.now()
  }
}
