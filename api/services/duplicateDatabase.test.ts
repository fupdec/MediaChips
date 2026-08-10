import {describe, expect, it, beforeEach, afterEach} from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  copyDatabaseDirectory,
  getGeneratedCacheSkipPaths,
  shouldCopyDatabasePath,
} from './duplicateDatabase'

describe('duplicateDatabase', () => {
  it('always skips backups and sqlite sidecars', () => {
    expect(shouldCopyDatabasePath('backups', true)).toBe(false)
    expect(shouldCopyDatabasePath('backups/a.zip', true)).toBe(false)
    expect(shouldCopyDatabasePath('db.sqlite-wal', true)).toBe(false)
    expect(shouldCopyDatabasePath('db.sqlite-shm', false)).toBe(false)
    expect(shouldCopyDatabasePath('db.sqlite', true)).toBe(true)
    expect(shouldCopyDatabasePath('meta/1/cover.jpg', true)).toBe(true)
  })

  it('skips generated cache paths when includeGeneratedCache is false', () => {
    expect(shouldCopyDatabasePath('media/videos/thumbs', false)).toBe(false)
    expect(shouldCopyDatabasePath('media/videos/thumbs/a.jpg', false)).toBe(false)
    expect(shouldCopyDatabasePath('transcode_cache/x', false)).toBe(false)
    expect(shouldCopyDatabasePath('media/videos/thumbs', true)).toBe(true)
    expect(getGeneratedCacheSkipPaths()).toContain('media/videos/grids')
  })

  describe('copyDatabaseDirectory', () => {
    let root = ''

    beforeEach(() => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-dup-db-'))
    })

    afterEach(() => {
      fs.rmSync(root, {recursive: true, force: true})
    })

    it('copies the library without backups and optional cache', async () => {
      const source = path.join(root, 'src')
      const dest = path.join(root, 'dst')
      fs.mkdirSync(path.join(source, 'media', 'videos', 'thumbs'), {recursive: true})
      fs.mkdirSync(path.join(source, 'meta', '1'), {recursive: true})
      fs.mkdirSync(path.join(source, 'backups'), {recursive: true})
      fs.mkdirSync(path.join(source, 'transcode_cache'), {recursive: true})
      fs.writeFileSync(path.join(source, 'db.sqlite'), 'sqlite')
      fs.writeFileSync(path.join(source, 'db.sqlite-wal'), 'wal')
      fs.writeFileSync(path.join(source, 'media', 'videos', 'thumbs', 'a.jpg'), 'thumb')
      fs.writeFileSync(path.join(source, 'meta', '1', 'tag.jpg'), 'meta')
      fs.writeFileSync(path.join(source, 'backups', 'old.zip'), 'zip')
      fs.writeFileSync(path.join(source, 'transcode_cache', 'x.bin'), 'cache')

      await copyDatabaseDirectory({
        sourceDir: source,
        destDir: dest,
        includeGeneratedCache: false,
      })

      expect(fs.existsSync(path.join(dest, 'db.sqlite'))).toBe(true)
      expect(fs.existsSync(path.join(dest, 'db.sqlite-wal'))).toBe(false)
      expect(fs.existsSync(path.join(dest, 'meta', '1', 'tag.jpg'))).toBe(true)
      expect(fs.existsSync(path.join(dest, 'backups'))).toBe(false)
      expect(fs.existsSync(path.join(dest, 'media', 'videos', 'thumbs', 'a.jpg'))).toBe(false)
      expect(fs.existsSync(path.join(dest, 'transcode_cache'))).toBe(false)
    })

    it('includes generated cache when requested', async () => {
      const source = path.join(root, 'src')
      const dest = path.join(root, 'dst')
      fs.mkdirSync(path.join(source, 'media', 'videos', 'thumbs'), {recursive: true})
      fs.writeFileSync(path.join(source, 'db.sqlite'), 'sqlite')
      fs.writeFileSync(path.join(source, 'media', 'videos', 'thumbs', 'a.jpg'), 'thumb')

      await copyDatabaseDirectory({
        sourceDir: source,
        destDir: dest,
        includeGeneratedCache: true,
      })

      expect(fs.existsSync(path.join(dest, 'media', 'videos', 'thumbs', 'a.jpg'))).toBe(true)
    })

    it('removes the destination if copy fails mid-way', async () => {
      const source = path.join(root, 'missing')
      const dest = path.join(root, 'dst')
      await expect(copyDatabaseDirectory({
        sourceDir: source,
        destDir: dest,
        includeGeneratedCache: true,
      })).rejects.toThrow(/not found/i)
      expect(fs.existsSync(dest)).toBe(false)
    })
  })
})
