import {describe, expect, it} from 'vitest'
import {pickMediaFileInfo} from './mediaFileInfoService'

describe('pickMediaFileInfo', () => {
  it('keeps only file metadata fields', () => {
    expect(pickMediaFileInfo({
      id: 1,
      name: 'clip',
      path: '/videos/clip.mp4',
      basename: 'clip.mp4',
      ext: 'mp4',
      filesize: 1024,
      duration: 90,
      width: 1920,
      height: 1080,
      codec: 'h264',
      bitrate: 8000000,
      fps: 24,
      orientation: 1,
      rating: 5,
      tags: [{tagId: 7}],
    })).toEqual({
      name: 'clip',
      path: '/videos/clip.mp4',
      basename: 'clip.mp4',
      ext: 'mp4',
      filesize: 1024,
      duration: 90,
      width: 1920,
      height: 1080,
      codec: 'h264',
      bitrate: 8000000,
      fps: 24,
      orientation: 1,
    })
  })
})
