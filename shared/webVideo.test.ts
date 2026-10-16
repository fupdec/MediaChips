import {describe, expect, it} from 'vitest'
import {normalizeXHamsterUrl, normalizeWebVideoUrl, isWebVideoPath, WebVideoImportSchema, WebVideoPlaybackQuerySchema, WebVideoFrameSchema} from './webVideo'

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


describe('universal video page URLs', () => {
  it.each([
    ['https://www.xvideos.com/video123/title?utm_source=share#player', 'https://www.xvideos.com/video123/title'],
    ['https://www.pornhub.com/view_video.php?viewkey=ph123&fbclid=tracking', 'https://www.pornhub.com/view_video.php?viewkey=ph123'],
    ['https://www.youtube.com/watch?v=abc123&t=5', 'https://www.youtube.com/watch?v=abc123&t=5'],
    ['https://vimeo.com/12345', 'https://vimeo.com/12345'],
    ['https://example.com/watch?id=123&token=keep', 'https://example.com/watch?id=123&token=keep'],
    ['https://ru.xhamster.com/videos/title-xhAb12?utm_source=share', 'https://xhamster.com/videos/video-xhAb12'],
  ])('normalizes %s without losing the video identity', (url, expected) => {
    expect(normalizeWebVideoUrl(url)).toBe(expected)
    expect(WebVideoImportSchema.safeParse({url}).success).toBe(true)
    expect(isWebVideoPath(expected)).toBe(true)
  })

  it.each([
    'file:///tmp/a.mp4', 'http://example.com/video', 'https://user:pass@example.com/video',
    'https://example.com:8443/video', 'https://localhost/video', 'https://server.local/video',
    'https://127.0.0.1/video', 'https://2130706433/video', 'https://0x7f000001/video',
    'https://[::1]/video', 'https://[::ffff:127.0.0.1]/video', 'https://localhost./video',
    'https://metadata.google.internal/video', '--exec touch /tmp/test',
  ])('rejects unsafe page input %s', url => {
    expect(normalizeWebVideoUrl(url)).toBeNull()
    expect(WebVideoImportSchema.safeParse({url}).success).toBe(false)
  })
})
