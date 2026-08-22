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

    expect(result.copied ?? result.moved).toEqual([])
    expect(result.failed[0]?.reason).toMatch(/into itself/)
    expect(fs.existsSync(path.join(source, 'file.txt'))).toBe(true)
  })
})
