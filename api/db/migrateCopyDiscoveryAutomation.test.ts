// @vitest-environment node
import {afterEach, describe, expect, it} from 'vitest'
import {createTestDb, closeTestDb, type TestDb} from './testUtils/createTestDb'
import {runDrizzleMigrations} from './drizzleMigrations'
import {repairSchemaColumns, repairMissingTables, repairMissingIndexes} from './schemaRepair'

describe('automatic copy discovery migrations', () => {
  let fixture: TestDb | undefined
  afterEach(() => { if (fixture) closeTestDb(fixture) })
  it('upgrades a saved queue, recovers a schema-repaired boot and remains idempotent', () => {
    fixture = createTestDb('copy-auto-upgrade')
    const {sqlite, dbPath} = fixture
    sqlite.exec(`DELETE FROM __drizzle_migrations WHERE created_at >= 1782894000000;
      DROP TABLE copyDiscoveryAutoRequests;
      DROP TABLE copyDiscoveryAutoRoots;
      ALTER TABLE copyDiscoveryJobs DROP COLUMN triggers;
      INSERT INTO copyDiscoveryJobs (id,state,method,roots,createdAt,updatedAt)
      VALUES ('old-job','queued','oshash','[{"key":"/archive"}]','2026','2026');`)
    // A partial old boot may already have repaired a column before migration restarts.
    repairSchemaColumns(sqlite); repairMissingTables(sqlite); repairMissingIndexes(sqlite)
    runDrizzleMigrations(dbPath); runDrizzleMigrations(dbPath)
    expect(sqlite.prepare('SELECT id,state,roots,triggers FROM copyDiscoveryJobs').get()).toEqual({id: 'old-job', state: 'queued', roots: '[{"key":"/archive"}]', triggers: '[]'})
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'copy_discovery_auto_due_idx'").get()).toBeDefined()
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM copyDiscoveryAutoRequests').get()).toEqual({n: 0})
  })
})
