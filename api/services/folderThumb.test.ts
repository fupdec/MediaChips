import fs from 'fs'
import os from 'os'
import path from 'path'
import {afterEach, describe, expect, it} from 'vitest'
import {findFolderThumbPath, FOLDER_THUMB_CANDIDATES} from './folderThumb'

describe('folderThumb', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      fs.rmSync(dir, {recursive: true, force: true})
    }
  })

  it('lists common sidecar names first with folder.jpg', () => {
    expect(FOLDER_THUMB_CANDIDATES[0]).toBe('folder.jpg')
  })

  it('finds folder.jpg next to a media file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-folder-thumb-'))
    dirs.push(dir)
    const media = path.join(dir, 'clip.mp4')
    const cover = path.join(dir, 'folder.jpg')
    fs.writeFileSync(media, 'x')
    fs.writeFileSync(cover, 'y')
    expect(findFolderThumbPath(media)).toBe(cover)
  })

  it('falls back to cover.jpg when folder.jpg is missing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-folder-thumb-'))
    dirs.push(dir)
    const media = path.join(dir, 'clip.mp4')
    const cover = path.join(dir, 'cover.jpg')
    fs.writeFileSync(media, 'x')
    fs.writeFileSync(cover, 'y')
    expect(findFolderThumbPath(media)).toBe(cover)
  })

  it('returns null when no sidecar exists', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-folder-thumb-'))
    dirs.push(dir)
    const media = path.join(dir, 'clip.mp4')
    fs.writeFileSync(media, 'x')
    expect(findFolderThumbPath(media)).toBeNull()
  })
})
