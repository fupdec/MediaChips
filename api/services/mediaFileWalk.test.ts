import {describe, expect, it} from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  collectMediaFilesFromRoots,
  listMediaFilesFromRoots,
  walkMatchedMediaFiles,
} from './mediaFileWalk'

describe('mediaFileWalk', () => {
  it('lists matching files and skips excluded paths', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-walk-'))
    try {
      fs.mkdirSync(path.join(root, 'keep'), {recursive: true})
      fs.mkdirSync(path.join(root, 'skip-me'), {recursive: true})
      fs.writeFileSync(path.join(root, 'keep', 'a.mp4'), 'x')
      fs.writeFileSync(path.join(root, 'skip-me', 'b.mp4'), 'x')
      fs.writeFileSync(path.join(root, 'keep', 'c.txt'), 'x')

      const files = await listMediaFilesFromRoots([root], {
        extensionRegex: /\.mp4$/i,
        excluded: ['skip-me'],
      })
      expect(files.map((file) => path.basename(file)).sort()).toEqual(['a.mp4'])
    } finally {
      fs.rmSync(root, {recursive: true, force: true})
    }
  })

  it('collects extras via classifyFile and walks matched files', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-walk2-'))
    try {
      fs.writeFileSync(path.join(root, 'a.mp4'), 'x')
      fs.writeFileSync(path.join(root, 'b.zip'), 'x')

      const collected = await collectMediaFilesFromRoots([root], {
        classifyFile: (filePath) => {
          if (filePath.endsWith('.zip')) return 'extra'
          if (filePath.endsWith('.mp4')) return 'match'
          return 'skip'
        },
      })
      expect(collected.files.map((file) => path.basename(file))).toEqual(['a.mp4'])
      expect(collected.extras.map((file) => path.basename(file))).toEqual(['b.zip'])

      const walked: string[] = []
      for await (const item of walkMatchedMediaFiles([root], {
        extensionRegex: /\.mp4$/i,
      })) {
        walked.push(path.basename(item.path))
      }
      expect(walked).toEqual(['a.mp4'])
    } finally {
      fs.rmSync(root, {recursive: true, force: true})
    }
  })
})
