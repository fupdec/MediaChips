import {afterEach, describe, expect, it} from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {listBrowseDirectory} from './browseDirectory'

describe('browseDirectory', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, {recursive: true, force: true})
    }
  })

  function makeTempRoot() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mediachips-browse-'))
    tempDirs.push(dir)
    return dir
  }

  it('lists only current folder contents and sorts directories first', () => {
    const root = makeTempRoot()
    const movies = path.join(root, 'movies')
    fs.mkdirSync(path.join(movies, 'Action'), {recursive: true})
    fs.mkdirSync(path.join(movies, 'nested', 'deep'), {recursive: true})
    fs.writeFileSync(path.join(movies, 'a.mp4'), 'x')
    fs.writeFileSync(path.join(movies, 'readme.txt'), 'x')
    fs.writeFileSync(path.join(movies, 'nested', 'hidden.mp4'), 'x')

    const result = listBrowseDirectory(movies, {
      envValue: movies,
      extensions: 'mp4,mkv',
    })

    expect(result.currentPath).toBe(path.resolve(movies))
    expect(result.parentPath).toBeNull()
    expect(result.rootPath).toBe(path.resolve(movies))
    expect(result.entries.map((entry) => entry.name)).toEqual([
      'Action',
      'nested',
      'a.mp4',
      'readme.txt',
    ])
    const video = result.entries.find((entry) => entry.name === 'a.mp4')
    expect(video).toMatchObject({
      isDirectory: false,
      addable: true,
      inLibrary: false,
      extension: 'mp4',
      size: 1,
    })
    expect(typeof video?.mtimeMs).toBe('number')
    expect(video!.mtimeMs!).toBeGreaterThan(0)

    const folder = result.entries.find((entry) => entry.name === 'Action')
    expect(folder).toMatchObject({
      isDirectory: true,
      size: null,
    })
    expect(typeof folder?.mtimeMs).toBe('number')

    expect(result.entries.find((entry) => entry.name === 'readme.txt')).toMatchObject({
      addable: false,
      extension: 'txt',
    })
    expect(result.entries.some((entry) => entry.name === 'hidden.mp4')).toBe(false)
  })

  it('rejects paths outside media roots', () => {
    const root = makeTempRoot()
    const movies = path.join(root, 'movies')
    const other = path.join(root, 'other')
    fs.mkdirSync(movies, {recursive: true})
    fs.mkdirSync(other, {recursive: true})

    expect(() => listBrowseDirectory(other, {envValue: movies})).toThrow(/outside configured media roots/)
  })

  it('marks files already present in the library', () => {
    const root = makeTempRoot()
    const movies = path.join(root, 'movies')
    fs.mkdirSync(movies, {recursive: true})
    const existingPath = path.join(movies, 'known.mp4')
    const newPath = path.join(movies, 'new.mp4')
    fs.writeFileSync(existingPath, 'x')
    fs.writeFileSync(newPath, 'x')

    const result = listBrowseDirectory(movies, {
      envValue: movies,
      extensions: 'mp4',
      mediaRepo: {
        findByPaths(paths) {
          return paths.includes(existingPath)
            ? [{id: 42, path: existingPath}]
            : []
        },
      },
    })

    expect(result.entries.find((entry) => entry.name === 'known.mp4')).toMatchObject({
      inLibrary: true,
      addable: false,
      mediaId: 42,
    })
    expect(result.entries.find((entry) => entry.name === 'new.mp4')).toMatchObject({
      inLibrary: false,
      addable: true,
      mediaId: null,
    })
  })

  it('returns parent path when browsing into a child folder', () => {
    const root = makeTempRoot()
    const movies = path.join(root, 'movies')
    const action = path.join(movies, 'Action')
    fs.mkdirSync(action, {recursive: true})

    const result = listBrowseDirectory(action, {envValue: movies})
    expect(result.parentPath).toBe(path.resolve(movies))
    expect(result.rootPath).toBe(path.resolve(movies))
  })

  it('hides dotfiles by default and includes them when showHidden is true', () => {
    const root = makeTempRoot()
    const movies = path.join(root, 'movies')
    fs.mkdirSync(movies, {recursive: true})
    fs.mkdirSync(path.join(movies, '.stash'), {recursive: true})
    fs.writeFileSync(path.join(movies, '.hidden.mp4'), 'x')
    fs.writeFileSync(path.join(movies, 'visible.mp4'), 'x')

    const hidden = listBrowseDirectory(movies, {envValue: movies, extensions: 'mp4'})
    expect(hidden.entries.map((entry) => entry.name)).toEqual(['visible.mp4'])

    const shown = listBrowseDirectory(movies, {
      envValue: movies,
      extensions: 'mp4',
      showHidden: true,
    })
    expect(shown.entries.map((entry) => entry.name)).toEqual([
      '.stash',
      '.hidden.mp4',
      'visible.mp4',
    ])
  })
})
