import { describe, it, expect } from 'vitest'
import {
  getChunkStart,
  getChunkDuration,
  getNextChunkStart,
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
