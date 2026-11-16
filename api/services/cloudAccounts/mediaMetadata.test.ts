// @vitest-environment node
import {describe, expect, it} from 'vitest'
import {cloudMediaMetadata} from './mediaMetadata'

describe('cloud media metadata', () => {
  it('converts duration milliseconds and preserves fractional frame rates', () => {
    expect(cloudMediaMetadata('gdrive', {videoMediaMetadata: {durationMillis: '123456', width: 1920, height: 1080}}))
      .toMatchObject({duration: 123.456, width: 1920, height: 1080})
    expect(cloudMediaMetadata('onedrive', {video: {duration: 1500, width: 1280, height: 720, bitrate: 8000000, frameRate: 29.97, fourCC: 'H264'}}))
      .toMatchObject({duration: 1.5, bitrate: 8000000, fps: 29.97, codec: 'H264'})
    expect(cloudMediaMetadata('dropbox', {media_info: {'.tag': 'metadata', metadata: {duration: 2500, dimensions: {width: 640, height: 360}}}}))
      .toMatchObject({duration: 2.5, width: 640, height: 360})
  })
  it('reads image dimensions and OneDrive audio tags', () => {
    expect(cloudMediaMetadata('gdrive', {imageMediaMetadata: {width: 4000, height: 3000}})).toMatchObject({width: 4000, height: 3000})
    expect(cloudMediaMetadata('onedrive', {image: {width: 3000, height: 2000}})).toMatchObject({width: 3000, height: 2000})
    expect(cloudMediaMetadata('dropbox', {media_info: {metadata: {dimensions: {width: 2000, height: 1000}}}})).toMatchObject({width: 2000, height: 1000})
    expect(cloudMediaMetadata('onedrive', {audio: {duration: 90000, bitrate: 256000, title: 'Song', artist: 'Artist', album: 'Album'}}))
      .toMatchObject({duration: 90, bitrate: 256000, title: 'Song', artist: 'Artist', album: 'Album'})
  })
  it('does not mistake the audio codec for the video codec', () => {
    const metadata = cloudMediaMetadata('onedrive', {video: {duration: 2000, audioFormat: 'AAC'}})
    expect(metadata).toMatchObject({duration: 2})
    expect(metadata?.codec).toBeUndefined()
  })
  it('does not invent data for pending or invalid provider values', () => {
    expect(cloudMediaMetadata('dropbox', {media_info: {'.tag': 'pending'}})).toBeUndefined()
    expect(cloudMediaMetadata('gdrive', {videoMediaMetadata: {durationMillis: '-1000', width: 0, height: Infinity}})).toBeUndefined()
    expect(cloudMediaMetadata('onedrive', {video: {duration: 'broken', bitrate: NaN, fourCC: '  '}})).toBeUndefined()
  })
})
