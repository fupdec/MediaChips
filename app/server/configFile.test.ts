/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  createDefaultConfig,
  getConfigBackupPath,
  loadConfigFile,
  normalizeServerConfig,
  saveConfigFile,
} from './configFile'

describe('configFile', () => {
  let tempDir: string
  let configPath: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mediachips-config-'))
    configPath = path.join(tempDir, 'config.json')
  })

  afterEach(() => {
    fs.rmSync(tempDir, {recursive: true, force: true})
  })

  it('loads valid config from main file', () => {
    fs.writeFileSync(configPath, JSON.stringify({
      port: 12321,
      databases: [{id: 'abc', name: 'Main', active: true, createdAt: 1}],
    }))

    const result = loadConfigFile(configPath)
    expect(result.source).toBe('main')
    expect(result.config?.databases[0]?.name).toBe('Main')
  })

  it('restores config from backup when main json is broken', () => {
    fs.writeFileSync(configPath, '{not-json')
    fs.writeFileSync(getConfigBackupPath(configPath), JSON.stringify({
      port: 12321,
      databases: [{id: 'abc', name: 'Backup', active: true, createdAt: 1}],
    }))

    const result = loadConfigFile(configPath)
    expect(result.source).toBe('backup')
    expect(result.config?.databases[0]?.name).toBe('Backup')
    expect(result.preservedCorruptedAs).toBeTruthy()
  })

  it('returns default when both main and backup are invalid', () => {
    fs.writeFileSync(configPath, '{broken')
    fs.writeFileSync(getConfigBackupPath(configPath), '{also-broken')

    const result = loadConfigFile(configPath)
    expect(result.source).toBe('default')
    expect(result.config).toBeNull()
  })

  it('normalizes config with missing active database', () => {
    const normalized = normalizeServerConfig({
      port: 12321,
      databases: [
        {id: '1', name: 'One', active: false},
        {id: '2', name: 'Two', active: false},
      ],
    })

    expect(normalized?.databases.filter(db => db.active)).toHaveLength(1)
    expect(normalized?.databases[0]?.active).toBe(true)
  })

  it('preserves database icon on normalize', () => {
    const normalized = normalizeServerConfig({
      port: 12321,
      databases: [
        {id: '1', name: 'One', active: true, createdAt: 1, icon: 'film'},
        {id: '2', name: 'Two', active: false, createdAt: 2, icon: '  '},
      ],
    })

    expect(normalized?.databases[0]?.icon).toBe('film')
    expect(normalized?.databases[1]?.icon).toBeUndefined()
  })

  it('creates backup before saving', () => {
    fs.writeFileSync(configPath, JSON.stringify(createDefaultConfig()))
    saveConfigFile(configPath, {
      port: 12321,
      databases: [{id: 'new', name: 'Updated', active: true, createdAt: 2}],
    })

    const backup = JSON.parse(fs.readFileSync(getConfigBackupPath(configPath), 'utf8'))
    expect(backup.databases[0]?.name).toBe('Default')

    const current = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    expect(current.databases[0]?.name).toBe('Updated')
  })
})
