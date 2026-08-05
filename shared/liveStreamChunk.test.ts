import {describe, expect, it} from 'vitest'
import {
  LIVE_STREAM_CHUNK_SECONDS,
  getChunkDuration,
  getChunkStart,
  getContinuousNextChunkStart,
  getLiveStreamOutputDuration,
  getNextChunkStart,
  resolveLiveFileDuration,
} from './liveStreamChunk'

describe('liveStreamChunk', () => {
  it('aligns playback time to chunk boundaries', () => {
    expect(getChunkStart(0)).toBe(0)
    expect(getChunkStart(29.9)).toBe(0)
    expect(getChunkStart(125.5)).toBe(120)
  })

  it('limits chunk duration near file end', () => {
    expect(getChunkDuration({chunkStart: 120, fileDuration: 140})).toBe(20)
    expect(getChunkDuration({chunkStart: 120, fileDuration: 500})).toBe(LIVE_STREAM_CHUNK_SECONDS)
  })

  it('streams continuously to EOF without a 30s cap', () => {
    expect(getLiveStreamOutputDuration({streamStart: 0, fileDuration: 3855})).toBe(3855)
    expect(getLiveStreamOutputDuration({streamStart: 120, fileDuration: 500})).toBe(380)
    expect(getLiveStreamOutputDuration({streamStart: 100, fileDuration: null})).toBeNull()
  })

  it('hands off continuously and stops at EOF', () => {
    expect(getNextChunkStart(0, 200)).toBe(30)
    expect(getNextChunkStart(120, 140)).toBeNull()
    expect(getContinuousNextChunkStart(0, 28.4, 600)).toBeCloseTo(28.4, 5)
    expect(getContinuousNextChunkStart(120, 20, 140)).toBeNull()
  })

  it('resolves live file duration from metadata over short store values', () => {
    expect(resolveLiveFileDuration({
      metadataDuration: 600,
      storeDuration: 30,
      liveStreamOffset: 40,
    })).toBe(600)
    expect(resolveLiveFileDuration({
      metadataDuration: null,
      storeDuration: 30,
      liveStreamOffset: 40,
    })).toBeNull()
  })
})
