/**
 * @vitest-environment node
 */
import {afterEach, describe, expect, it} from 'vitest'
import {
  getMediaPostProcessQueueStats,
  resetMediaPostProcessQueues,
  runWithFfmpegLimit,
  runWithFfprobeLimit,
  runWithRemuxLimit,
} from './mediaPostProcessQueue'

const delay = (ms: number) => new Promise<void>((resolve) => {
  setTimeout(resolve, ms)
})

describe('mediaPostProcessQueue', () => {
  afterEach(() => {
    resetMediaPostProcessQueues()
  })

  it('limits concurrent ffmpeg work to 1', async () => {
    let active = 0
    let maxActive = 0

    await Promise.all(Array.from({length: 4}, () => runWithFfmpegLimit(async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await delay(15)
      active -= 1
    })))

    expect(maxActive).toBe(1)
    expect(getMediaPostProcessQueueStats().ffmpeg.active).toBe(0)
  })

  it('allows nested runWithFfmpegLimit without deadlock', async () => {
    const result = await runWithFfmpegLimit(async () => {
      await delay(5)
      return runWithFfmpegLimit(async () => 'nested-ok')
    })

    expect(result).toBe('nested-ok')
  })

  it('allows nested runWithFfprobeLimit without deadlock', async () => {
    const result = await runWithFfprobeLimit(async () => {
      return runWithFfprobeLimit(async () => 42)
    })

    expect(result).toBe(42)
  })

  it('limits concurrent ffprobe work to 2', async () => {
    let active = 0
    let maxActive = 0

    await Promise.all(Array.from({length: 6}, () => runWithFfprobeLimit(async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await delay(15)
      active -= 1
    })))

    expect(maxActive).toBeLessThanOrEqual(2)
  })

  it('keeps remux work off the live ffmpeg queue', async () => {
    let ffmpegActive = 0
    let remuxStartedWhileFfmpegBusy = false

    const ffmpegJob = runWithFfmpegLimit(async () => {
      ffmpegActive += 1
      await delay(40)
      ffmpegActive -= 1
    })

    await delay(5)
    await runWithRemuxLimit(async () => {
      remuxStartedWhileFfmpegBusy = ffmpegActive > 0
      await delay(5)
    })
    await ffmpegJob

    expect(remuxStartedWhileFfmpegBusy).toBe(true)
    expect(getMediaPostProcessQueueStats().remux.active).toBe(0)
  })
})
