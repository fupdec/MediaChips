import fs from 'fs'
import path from 'path'
import {createHash} from 'crypto'

function fileHash(file: string): string {
  const hash = createHash('sha256')
  const buffer = Buffer.alloc(1024 * 1024)
  const fd = fs.openSync(file, 'r')
  try {
    let bytes: number
    while ((bytes = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, bytes))
    }
    return hash.digest('hex')
  } finally {
    fs.closeSync(fd)
  }
}

function verifyCopy(source: string, destination: string) {
  for (const entry of fs.readdirSync(source, {withFileTypes: true})) {
    const from = path.join(source, entry.name)
    const to = path.join(destination, entry.name)
    if (entry.isDirectory()) verifyCopy(from, to)
    else if (!entry.isFile() || fileHash(from) !== fileHash(to)) {
      throw new Error(`Legacy storage copy verification failed: ${from}`)
    }
  }
}

export function legacyMigrationFailure(appFolder: string, error: unknown): never {
  const message = `Legacy library migration stopped. No empty library will be created. ${error instanceof Error ? error.message : String(error)}`
  try {
    fs.appendFileSync(path.join(appFolder, 'legacy-storage-migration.log'), `${new Date().toISOString()} ERROR ${message}\n`)
  } catch {
    // Preserve the original error even if the data directory is not writable.
  }
  throw new Error(message)
}

/** Publish only a verified copy. Retain the original indefinitely, including SQLite sidecars. */
export function migrateLegacyDatabasesFolder(appFolder: string) {
  const source = path.join(appFolder, 'databases')
  const destination = path.join(appFolder, 'app_storage')
  const backup = path.join(appFolder, 'databases.pre-1.x-backup')
  if (!fs.existsSync(source)) return

  let staging: string | undefined
  try {
    if (fs.existsSync(destination) || fs.existsSync(backup)) {
      throw new Error(`Legacy storage at ${source} conflicts with existing storage. Preserve both folders and resolve the conflict before restarting.`)
    }
    // A failed or interrupted copy is never used as live storage.
    staging = fs.mkdtempSync(path.join(appFolder, 'legacy-storage-copy-'))
    fs.cpSync(source, staging, {recursive: true, errorOnExist: true, force: false})
    verifyCopy(source, staging)
    fs.renameSync(staging, destination)
    fs.renameSync(source, backup)
    fs.appendFileSync(path.join(appFolder, 'legacy-storage-migration.log'), `${new Date().toISOString()} Verified copy published at ${destination}; original retained at ${backup}\n`)
  } catch (error) {
    if (staging && fs.existsSync(staging)) {
      try {
        fs.rmSync(staging, {recursive: true, force: true})
      } catch {
        // Never clean up either the original or published library.
      }
    }
    legacyMigrationFailure(appFolder, error)
  }
}

export function assertLegacyLibraryAvailable(appFolder: string, databaseFolder: string) {
  if (fs.existsSync(path.join(appFolder, 'databases')) ||
      (fs.existsSync(path.join(appFolder, 'databases.pre-1.x-backup')) &&
       !fs.existsSync(path.join(databaseFolder, 'db.sqlite')))) {
    legacyMigrationFailure(appFolder, `Expected migrated database is missing at ${databaseFolder}. The legacy library has been preserved.`)
  }
}
