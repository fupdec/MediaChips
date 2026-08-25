/**
 * @vitest-environment node
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import {afterEach, describe, expect, it} from 'vitest'
import {discoverDatabaseEntries} from './databaseDiscovery'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, {recursive: true, force: true})
  }
})

describe('discoverDatabaseEntries', () => {
  it('discovers unregistered databases in immediate child directories', () => {
    const databasesPath = fs.mkdtempSync(path.join(os.tmpdir(), 'mediachips-discovery-'))
    temporaryDirectories.push(databasesPath)
    fs.mkdirSync(path.join(databasesPath, 'restored-library'))
    fs.writeFileSync(path.join(databasesPath, 'restored-library', 'db.sqlite'), '')
    fs.mkdirSync(path.join(databasesPath, 'not-a-database'))
    fs.writeFileSync(path.join(databasesPath, 'db.sqlite'), '')

    expect(discoverDatabaseEntries(databasesPath, [])).toEqual([
      expect.objectContaining({
        id: 'restored-library',
        name: 'restored-library',
        active: false,
      }),
    ])
  })

  it('does not duplicate configured databases', () => {
    const databasesPath = fs.mkdtempSync(path.join(os.tmpdir(), 'mediachips-discovery-'))
    temporaryDirectories.push(databasesPath)
    fs.mkdirSync(path.join(databasesPath, 'existing'))
    fs.writeFileSync(path.join(databasesPath, 'existing', 'db.sqlite'), '')

    expect(discoverDatabaseEntries(databasesPath, [{
      id: 'existing',
      name: 'My library',
      active: true,
    }])).toEqual([])
  })

  it('ignores nested sqlite files and directories named db.sqlite', () => {
    const databasesPath = fs.mkdtempSync(path.join(os.tmpdir(), 'mediachips-discovery-'))
    temporaryDirectories.push(databasesPath)
    fs.mkdirSync(path.join(databasesPath, 'nested', 'child'), {recursive: true})
    fs.writeFileSync(path.join(databasesPath, 'nested', 'child', 'db.sqlite'), '')
    fs.mkdirSync(path.join(databasesPath, 'directory-db', 'db.sqlite'), {recursive: true})

    expect(discoverDatabaseEntries(databasesPath, [])).toEqual([])
  })
})
