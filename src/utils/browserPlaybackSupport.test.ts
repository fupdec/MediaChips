import {describe, expect, it, vi} from 'vitest'
import {hasUnsupportedBrowserAudio, hasUnsupportedBrowserContainer} from './browserPlaybackSupport'

describe('browser audio compatibility', () => {
  it('detects unsupported AC3 even when the video/container can play', () => {
    const media = {canPlayType: vi.fn(type => type.startsWith('video/') ? 'probably' : '')} as unknown as HTMLMediaElement
    expect(hasUnsupportedBrowserAudio(media, 'ac3')).toBe(true)
    expect(media.canPlayType).toHaveBeenCalledWith('audio/mp4; codecs="ac-3"')
  })
  it('keeps native audio when the current browser supports it', () => {
    const media = {canPlayType: vi.fn(() => 'probably')} as unknown as HTMLMediaElement
    expect(hasUnsupportedBrowserAudio(media, 'eac3')).toBe(false)
    expect(hasUnsupportedBrowserAudio(media, 'aac')).toBe(false)
  })
  it('does not reject silent files or incomplete codec information', () => {
    const media = {canPlayType: vi.fn(() => '')} as unknown as HTMLMediaElement
    for (const codec of [null, undefined, 'unknown']) expect(hasUnsupportedBrowserAudio(media, codec)).toBe(false)
    expect(media.canPlayType).not.toHaveBeenCalled()
  })
  it('accepts an available audio decoder even if another container is unsupported', () => {
    const media = {canPlayType: vi.fn(type => type.includes('ogg') ? 'maybe' : '')} as unknown as HTMLMediaElement
    expect(hasUnsupportedBrowserAudio(media, 'opus')).toBe(false)
  })
})

describe('browser container compatibility', () => {
  const media = (supported: string[]) => ({
    canPlayType: vi.fn((type: string) => supported.includes(type) ? 'maybe' : ''),
  }) as unknown as HTMLMediaElement
  it('flags MPEG-TS and AVI when the browser rejects them', () => {
    expect(hasUnsupportedBrowserContainer(media([]), 'mpegts')).toBe(true)
    expect(hasUnsupportedBrowserContainer(media([]), 'avi')).toBe(true)
  })
  it('keeps containers the browser accepts, including matroska', () => {
    expect(hasUnsupportedBrowserContainer(media(['video/x-matroska']), 'matroska,webm')).toBe(false)
    expect(hasUnsupportedBrowserContainer(media(['video/mp4']), 'mov,mp4,m4a,3gp,3g2,mj2')).toBe(false)
  })
  it('never blocks unknown or missing containers', () => {
    expect(hasUnsupportedBrowserContainer(media([]), null)).toBe(false)
    expect(hasUnsupportedBrowserContainer(media([]), 'somethingnew')).toBe(false)
  })
})
