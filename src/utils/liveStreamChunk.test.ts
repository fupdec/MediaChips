import { describe, it, expect } from 'vitest'
import {
  getChunkStart,
  getChunkDuration,
  getLiveStreamOutputDuration,
  getNextChunkStart,
  getContinuousNextChunkStart,
  resolveLiveFileDuration,
  LIVE_STREAM_CHUNK_SECONDS,
} from '@/utils/liveStreamChunk'

describe('liveStreamChunk', () => {
  it('aligns playback time to chunk boundaries', () => {
    expect(getChunkStart(0)).toBe(0)
    expect(getChunkStart(29.9)).toBe(0)
    expect(getChunkStart(125.5)).toBe(120)
  })

  it('limits chunk duration near file end', () => {
    expect(getChunkDuration({
      chunkStart: 120,
      fileDuration: 140,
    })).toBe(20)

    expect(getChunkDuration({
      chunkStart: 120,
      fileDuration: 500,
    })).toBe(LIVE_STREAM_CHUNK_SECONDS)
  })

  it('streams continuously to EOF without a 30s cap', () => {
    expect(getLiveStreamOutputDuration({
      streamStart: 0,
      fileDuration: 3855,
    })).toBe(3855)

    expect(getLiveStreamOutputDuration({
      streamStart: 120,
      fileDuration: 500,
    })).toBe(380)

    expect(getLiveStreamOutputDuration({
      streamStart: 100,
      fileDuration: null,
    })).toBeNull()

    expect(getLiveStreamOutputDuration({
      streamStart: 500,
      fileDuration: 500,
    })).toBeNull()
  })

  it('returns next chunk start until end of file', () => {
    expect(getNextChunkStart(0, 200)).toBe(30)
    expect(getNextChunkStart(120, 140)).toBeNull()
    expect(getNextChunkStart(120, 200)).toBe(150)
  })

  it('keeps advancing when file duration is unknown', () => {
    expect(getNextChunkStart(270, null)).toBe(300)
    expect(getNextChunkStart(270, 0)).toBe(300)
    expect(getNextChunkStart(270, undefined)).toBe(300)
  })

  it('hands off continuously from the actual segment length', () => {
    // Short ffmpeg segment must continue from the last shown frame.
    expect(getContinuousNextChunkStart(0, 28.4, 600)).toBeCloseTo(28.4, 5)
    expect(getContinuousNextChunkStart(28.4, 30, 600)).toBeCloseTo(58.4, 5)
    expect(getContinuousNextChunkStart(30, 29.85, 600)).toBeCloseTo(59.85, 5)
    expect(getContinuousNextChunkStart(0, 30, 600)).toBe(30)
  })

  it('stops continuous handoff at known EOF', () => {
    expect(getContinuousNextChunkStart(120, 20, 140)).toBeNull()
    expect(getContinuousNextChunkStart(100, 30, 130)).toBeNull()
    expect(getContinuousNextChunkStart(139.97, 0.1, 140)).toBeNull()
  })

  it('falls back to nominal chunk length when segment duration is missing', () => {
    expect(getContinuousNextChunkStart(60, null, 600)).toBe(90)
    expect(getContinuousNextChunkStart(60, 0, 600)).toBe(90)
  })

  it('resolves live file duration without trusting chunk-sized store values', () => {
    expect(resolveLiveFileDuration({
      metadataDuration: 600,
      storeDuration: 10,
      liveStreamOffset: 270,
    })).toBe(600)

    expect(resolveLiveFileDuration({
      metadataDuration: 0,
      storeDuration: 10,
      liveStreamOffset: 270,
    })).toBeNull()

    expect(resolveLiveFileDuration({
      metadataDuration: null,
      storeDuration: 600,
      liveStreamOffset: 270,
    })).toBe(600)
  })
})
