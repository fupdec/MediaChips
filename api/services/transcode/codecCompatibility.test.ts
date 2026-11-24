import {describe, expect, it} from 'vitest'
import {analyzeProbeResult} from './codecCompatibility'

describe('codecCompatibility', () => {
  it('accepts browser-friendly mp4/h264/aac', () => {
    expect(analyzeProbeResult({
      streams: [
        {codec_type: 'video', codec_name: 'h264'},
        {codec_type: 'audio', codec_name: 'aac'},
      ],
    }, '/media/a.mp4')).toEqual({
      playable: true,
      reason: null,
      videoCodec: 'h264',
      audioCodec: 'aac',
    })
  })

  it('rejects unsupported containers and codecs', () => {
    expect(analyzeProbeResult({
      streams: [{codec_type: 'video', codec_name: 'h264'}],
    }, '/media/a.mkv').reason).toBe('container')

    expect(analyzeProbeResult({
      streams: [{codec_type: 'video', codec_name: 'hevc'}],
    }, '/media/a.mp4').reason).toBe('video_codec')

    expect(analyzeProbeResult({
      streams: [
        {codec_type: 'video', codec_name: 'h264'},
        {codec_type: 'audio', codec_name: 'ac3'},
      ],
    }, '/media/a.mp4').reason).toBe('audio_codec')
  })

  it('handles audio-only playback', () => {
    expect(analyzeProbeResult({
      streams: [{codec_type: 'audio', codec_name: 'mp3'}],
    }, '/media/a.mp3', {audioOnly: true})).toMatchObject({
      playable: true,
      audioCodec: 'mp3',
    })
    expect(analyzeProbeResult({
      streams: [{codec_type: 'audio', codec_name: 'mp3'}],
    }, '/media/a.mkv', {audioOnly: true}).reason).toBe('container')
  })
})

describe('areCodecsBrowserCompatible', () => {
  it('accepts native codecs and missing streams, rejects the rest', async () => {
    const {areCodecsBrowserCompatible} = await import('./codecCompatibility')
    expect(areCodecsBrowserCompatible('h264', 'aac')).toBe(true)
    expect(areCodecsBrowserCompatible('h264', null)).toBe(true)
    expect(areCodecsBrowserCompatible('hevc', 'aac')).toBe(false)
    expect(areCodecsBrowserCompatible('h264', 'ac3')).toBe(false)
  })
})
