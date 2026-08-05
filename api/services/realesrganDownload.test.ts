import {describe, expect, it} from 'vitest'
import {
  getRealesrganZipUrl,
  isTransientDownloadError,
  needsTagAiUpscale,
  targetHeightFor,
} from './realesrganDownload'

describe('realesrganDownload', () => {
  it('builds platform zip urls and geometry', () => {
    expect(getRealesrganZipUrl('darwin')).toContain('macos.zip')
    expect(needsTagAiUpscale(300, 300, 600)).toBe(true)
    expect(needsTagAiUpscale(600, 400, 600)).toBe(false)
    expect(targetHeightFor(200, 100, 400)).toBe(200)
  })

  it('classifies transient download errors', () => {
    expect(isTransientDownloadError(Object.assign(new Error('fail'), {code: 'ECONNRESET'}))).toBe(true)
    expect(isTransientDownloadError(new Error('HTTP 404'))).toBe(false)
  })
})
