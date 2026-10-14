import {describe, expect, it} from 'vitest'
import {normalizeXHamsterUrl, WebVideoImportSchema, WebVideoPlaybackQuerySchema, WebVideoFrameSchema} from './webVideo'

describe('xHamster page URLs', () => {
  it('deduplicates locale, slug, embed, legacy and tracking variations', () => {
    for (const url of [
      'https://ru.xhamster.com/videos/example-video-xhAb12?utm_source=test#player',
      'https://xhamster.com/videos/xhAb12',
      'https://xhamster2.desi/embed/xhAb12',
      'https://xhamster.one/movies/xhAb12/old.html',
    ]) expect(normalizeXHamsterUrl(url)).toBe('https://xhamster.com/videos/video-xhAb12')
  })

  it('rejects other sites, lookalike hosts, credentials, ports and non-video pages', () => {
    for (const url of ['http://xhamster.com/videos/test-123', 'https://xhamster.com.evil.test/videos/test-123',
      'https://evilxhamster.com/videos/test-123', 'https://xhamster.com/',
      'https://xhamster.com/users/test', 'https://user:pass@xhamster.com/videos/test-123',
      'https://xhamster.com:8080/videos/test-123', 'file:///tmp/test.mp4', '--exec touch /tmp/test']) {
      expect(normalizeXHamsterUrl(url)).toBeNull()
      expect(WebVideoImportSchema.safeParse({url}).success).toBe(false)
    }
  })
})

describe('web video player input', () => {
  it('accepts numeric quality and an explicit refresh flag', () => {
    expect(WebVideoPlaybackQuerySchema.parse({quality: '720', fresh: '1'})).toEqual({quality: 720, fresh: '1'})
    for (const quality of ['-1', '0', 'NaN', '720.5', 'https://localhost/', '999999']) {
      expect(WebVideoPlaybackQuerySchema.safeParse({quality}).success).toBe(false)
    }
  })

  it('requires marker identity and a bounded JPEG data URL', () => {
    expect(WebVideoFrameSchema.safeParse({target: 'mark', image: 'data:image/jpeg;base64,/9j/'}).success).toBe(false)
    expect(WebVideoFrameSchema.safeParse({target: 'poster', image: 'file:///tmp/image.jpg'}).success).toBe(false)
    expect(WebVideoFrameSchema.safeParse({target: 'mark', markId: 10, image: 'data:image/jpeg;base64,/9j/'}).success).toBe(true)
  })
})
