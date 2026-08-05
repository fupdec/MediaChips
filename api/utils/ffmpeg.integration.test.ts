/**
 * @vitest-environment node
 *
 * Real ffmpeg/ffprobe spawn path. Skips when bundled/static binaries are absent
 * so CI stays green without a system ffmpeg install.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {getFfmpegPath, getFfprobePath} from './ffmpegPaths'
import {
  extractVideoThumbnail,
  ffprobe,
  runFfmpeg,
} from './ffmpeg'

function ffmpegBinariesAvailable(): boolean {
  try {
    return fs.existsSync(getFfmpegPath()) && fs.existsSync(getFfprobePath())
  } catch {
    return false
  }
}

const describeIntegration = ffmpegBinariesAvailable() ? describe : describe.skip

describeIntegration('ffmpeg integration', () => {
  let tmpDir = ''
  let sampleMp4 = ''

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-ffmpeg-int-'))
    sampleMp4 = path.join(tmpDir, 'sample.mp4')
    // Synthetic 1s H.264 clip — no checked-in media fixture required.
    await runFfmpeg([
      '-f', 'lavfi',
      '-i', 'testsrc=duration=1:size=320x240:rate=10',
      '-pix_fmt', 'yuv420p',
      '-c:v', 'libx264',
      '-y',
      sampleMp4,
    ])
  }, 60_000)

  afterAll(() => {
    if (tmpDir) fs.rmSync(tmpDir, {recursive: true, force: true})
  })

  it('ffprobe reports a short video stream', async () => {
    const probe = await ffprobe(sampleMp4)
    expect(Number(probe.format.duration)).toBeGreaterThan(0.5)
    expect(Number(probe.format.duration)).toBeLessThan(2)
    const video = (probe.streams || []).find((stream) => stream.codec_type === 'video')
    expect(video).toBeTruthy()
    expect(Number(video?.width)).toBe(320)
    expect(Number(video?.height)).toBe(240)
  })

  it('extractVideoThumbnail writes a non-empty jpeg', async () => {
    const out = path.join(tmpDir, 'thumb.jpg')
    await extractVideoThumbnail({
      input: sampleMp4,
      outputPath: out,
      height: 160,
      seekRatio: 0.5,
    })
    expect(fs.existsSync(out)).toBe(true)
    expect(fs.statSync(out).size).toBeGreaterThan(500)
  })
})
