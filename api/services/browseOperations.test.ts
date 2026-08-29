import {afterEach, describe, expect, it} from 'vitest'
import fs from 'fs'
import fsp from 'fs/promises'
import os from 'os'
import path from 'path'
import {copyEntries, deleteEntries, moveEntries} from './browseOperations'

describe('browseOperations physical path access', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) fs.rmSync(dir, {recursive: true, force: true})
  })

  function makeTempRoot() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mediachips-operations-'))
    tempDirs.push(dir)
    return dir
  }

  async function makeSymlinkOrSkip(target: string, link: string) {
    try {
      await fsp.symlink(target, link, 'junction')
    } catch (err: unknown) {
      if (process.platform === 'win32') return false
      throw err
    }
    return true
  }

  it('rejects an existing source symlink that resolves outside the media root', async () => {
    const root = makeTempRoot()
    const media = path.join(root, 'media')
    const outside = path.join(root, 'outside')
    const link = path.join(media, 'linked')
    fs.mkdirSync(media)
    fs.mkdirSync(outside)
    fs.writeFileSync(path.join(outside, 'secret.mp4'), 'secret')
    if (!await makeSymlinkOrSkip(outside, link)) return

    const result = await deleteEntries([{path: link, name: 'linked'}], media)
    expect(result.deleted).toEqual([])
    expect(result.failed[0]?.reason).toMatch(/outside configured media roots/)
    expect(fs.existsSync(path.join(outside, 'secret.mp4'))).toBe(true)
  })

  it('rejects a destination symlink resolving outside the media root', async () => {
    const root = makeTempRoot()
    const media = path.join(root, 'media')
    const outside = path.join(root, 'outside')
    const source = path.join(media, 'source.txt')
    const link = path.join(media, 'export')
    fs.mkdirSync(media)
    fs.mkdirSync(outside)
    fs.writeFileSync(source, 'source')
    if (!await makeSymlinkOrSkip(outside, link)) return

    await expect(copyEntries([{path: source, name: 'source.txt'}], link, media))
      .rejects.toThrow(/outside configured media roots/)
    expect(fs.existsSync(path.join(outside, 'source.txt'))).toBe(false)
  })

  it.each(['copy', 'move'])('rejects %s into a nested destination', async (operation) => {
    const root = makeTempRoot()
    const media = path.join(root, 'media')
    const source = path.join(media, 'folder')
    const destination = path.join(source, 'nested', 'destination')
    fs.mkdirSync(source, {recursive: true})
    fs.writeFileSync(path.join(source, 'file.txt'), 'file')

    const result = operation === 'copy'
      ? await copyEntries([{path: source, name: 'folder'}], destination, media)
      : await moveEntries([{path: source, name: 'folder'}], destination, media)

    expect(('copied' in result ? result.copied : result.moved)).toEqual([])
    expect(result.failed[0]?.reason).toMatch(/into itself/)
    expect(fs.existsSync(path.join(source, 'file.txt'))).toBe(true)
  })
})


describe('browseOperations destination conflicts', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) fs.rmSync(dir, {recursive: true, force: true})
  })

  function makeTempRoot() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mediachips-operations-conflict-'))
    tempDirs.push(dir)
    return dir
  }

  it.each(['copy', 'move'] as const)('%s reports file and folder destination conflicts without overwriting', async (operation) => {
    const root = makeTempRoot()
    const media = path.join(root, 'media')
    const destination = path.join(media, 'destination')
    const sourceFile = path.join(media, 'file.txt')
    const sourceFolder = path.join(media, 'folder')
    fs.mkdirSync(destination, {recursive: true})
    fs.writeFileSync(sourceFile, 'source file')
    fs.mkdirSync(sourceFolder)
    fs.writeFileSync(path.join(sourceFolder, 'source.txt'), 'source folder')
    fs.writeFileSync(path.join(destination, 'file.txt'), 'existing file')
    fs.mkdirSync(path.join(destination, 'folder'))
    fs.writeFileSync(path.join(destination, 'folder', 'existing.txt'), 'existing folder')

    const result = operation === 'copy'
      ? await copyEntries([
        {path: sourceFile, name: 'file.txt'},
        {path: sourceFolder, name: 'folder'},
      ], destination, media)
      : await moveEntries([
        {path: sourceFile, name: 'file.txt'},
        {path: sourceFolder, name: 'folder'},
      ], destination, media)

    expect(('copied' in result ? result.copied : result.moved)).toEqual([])
    expect(result.failed).toMatchObject([
      {path: sourceFile, status: 409, reason: expect.stringMatching(/already exists/)},
      {path: sourceFolder, status: 409, reason: expect.stringMatching(/already exists/)},
    ])
    expect(fs.readFileSync(path.join(destination, 'file.txt'), 'utf8')).toBe('existing file')
    expect(fs.readFileSync(path.join(destination, 'folder', 'existing.txt'), 'utf8')).toBe('existing folder')
    expect(fs.existsSync(sourceFile)).toBe(true)
    expect(fs.existsSync(sourceFolder)).toBe(true)
  })

  it.each(['copy', 'move'] as const)('%s treats a symlink destination as a conflict', async (operation) => {
    const root = makeTempRoot()
    const media = path.join(root, 'media')
    const destination = path.join(media, 'destination')
    const source = path.join(media, 'linked.txt')
    const target = path.join(media, 'target.txt')
    fs.mkdirSync(destination, {recursive: true})
    fs.writeFileSync(source, 'source')
    fs.writeFileSync(target, 'target')
    await fsp.symlink(target, path.join(destination, 'linked.txt'))

    const result = operation === 'copy'
      ? await copyEntries([{path: source, name: 'linked.txt'}], destination, media)
      : await moveEntries([{path: source, name: 'linked.txt'}], destination, media)

    expect(('copied' in result ? result.copied : result.moved)).toEqual([])
    expect(result.failed).toMatchObject([{path: source, status: 409}])
    expect(fs.lstatSync(path.join(destination, 'linked.txt')).isSymbolicLink()).toBe(true)
    expect(fs.existsSync(source)).toBe(true)
  })

  it.each(['copy', 'move'] as const)('%s continues a batch after a destination conflict', async (operation) => {
    const root = makeTempRoot()
    const media = path.join(root, 'media')
    const destination = path.join(media, 'destination')
    const conflicting = path.join(media, 'conflicting.txt')
    const allowed = path.join(media, 'allowed.txt')
    fs.mkdirSync(destination, {recursive: true})
    fs.writeFileSync(conflicting, 'source conflict')
    fs.writeFileSync(allowed, 'source allowed')
    fs.writeFileSync(path.join(destination, 'conflicting.txt'), 'existing')

    const result = operation === 'copy'
      ? await copyEntries([
        {path: conflicting, name: 'conflicting.txt'},
        {path: allowed, name: 'allowed.txt'},
      ], destination, media)
      : await moveEntries([
        {path: conflicting, name: 'conflicting.txt'},
        {path: allowed, name: 'allowed.txt'},
      ], destination, media)

    expect(('copied' in result ? result.copied : result.moved)).toEqual([allowed])
    expect(result.failed).toMatchObject([{path: conflicting, status: 409}])
    expect(fs.readFileSync(path.join(destination, 'conflicting.txt'), 'utf8')).toBe('existing')
    expect(fs.readFileSync(path.join(destination, 'allowed.txt'), 'utf8')).toBe('source allowed')
    expect(fs.existsSync(conflicting)).toBe(true)
    expect(fs.existsSync(allowed)).toBe(operation === 'copy')
  })
})
