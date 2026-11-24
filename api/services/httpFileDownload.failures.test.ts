/** @vitest-environment node */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'
import {downloadHttpFileWithRetries} from './httpFileDownload'

let directory = ''
afterEach(() => {
  if (directory) fs.rmSync(directory, {recursive: true, force: true})
  directory = ''
})

describe('download failures before connecting', () => {
  it.each(['cancelled', 'invalid-url'])('preserves the existing file on %s', async failure => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-download-failure-'))
    const destination = path.join(directory, 'model.onnx')
    fs.writeFileSync(destination, 'working-model')
    await expect(downloadHttpFileWithRetries('invalid-url', destination, {
      attempts: 1,
      ...(failure === 'cancelled' ? {signal: {aborted: true}} : {}),
    })).rejects.toThrow(failure === 'cancelled' ? 'aborted' : 'Invalid URL')
    expect(fs.readFileSync(destination, 'utf8')).toBe('working-model')
    expect(fs.existsSync(destination + '.download')).toBe(false)
  })
})
