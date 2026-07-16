import {afterEach, describe, expect, it} from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {isPathInsideMediaRoots, listMediaRoots} from './mediaRoots'

describe('mediaRoots', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, {recursive: true, force: true})
    }
  })

  function makeTempRoot() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mediachips-roots-'))
    tempDirs.push(dir)
    return dir
  }

  it('lists configured roots and child folders', () => {
    const root = makeTempRoot()
    const movies = path.join(root, 'movies')
    fs.mkdirSync(path.join(movies, 'Action'), {recursive: true})
    fs.mkdirSync(path.join(movies, 'Comedy'), {recursive: true})
    fs.writeFileSync(path.join(movies, 'readme.txt'), 'x')

    const roots = listMediaRoots(movies)
    expect(roots).toHaveLength(1)
    expect(roots[0].path).toBe(path.resolve(movies))
    expect(roots[0].children.map((child) => child.name).sort()).toEqual(['Action', 'Comedy'])
  })

  it('checks whether a path is inside a configured root', () => {
    const root = makeTempRoot()
    const movies = path.join(root, 'movies')
    fs.mkdirSync(movies, {recursive: true})

    expect(isPathInsideMediaRoots(path.join(movies, 'a'), movies)).toBe(true)
    expect(isPathInsideMediaRoots(path.join(root, 'other'), movies)).toBe(false)
  })

  it('falls back to system places when no mounts are configured outside Docker', () => {
    const previousDataDir = process.env.MEDIA_CHIPS_DATA_DIR
    delete process.env.MEDIA_CHIPS_DATA_DIR

    try {
      const roots = listMediaRoots('   ')
      expect(roots.length).toBeGreaterThan(0)
      expect(roots.some((root) => root.path === path.resolve(os.homedir()))).toBe(true)
      expect(isPathInsideMediaRoots(path.join(os.homedir(), 'Desktop'), '   ')).toBe(true)
    } finally {
      if (previousDataDir === undefined) delete process.env.MEDIA_CHIPS_DATA_DIR
      else process.env.MEDIA_CHIPS_DATA_DIR = previousDataDir
    }
  })

  it('does not fall back to home when Docker data dir is set and mounts are empty', () => {
    const previousDataDir = process.env.MEDIA_CHIPS_DATA_DIR
    process.env.MEDIA_CHIPS_DATA_DIR = '/data'

    try {
      expect(listMediaRoots('   ')).toEqual([])
    } finally {
      if (previousDataDir === undefined) delete process.env.MEDIA_CHIPS_DATA_DIR
      else process.env.MEDIA_CHIPS_DATA_DIR = previousDataDir
    }
  })
})
