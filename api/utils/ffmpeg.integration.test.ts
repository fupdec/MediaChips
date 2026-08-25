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
  convertVideoFile,
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
    // Synthetic 5s H.264/AAC clip — no checked-in media fixture required.
    await runFfmpeg([
      '-f', 'lavfi',
      '-i', 'testsrc=duration=5:size=320x240:rate=10',
      '-f', 'lavfi',
      '-i', 'sine=frequency=1000:duration=5',
      '-shortest',
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-c:v', 'libx264',
      '-y',
      sampleMp4,
    ])
  }, 60_000)

  afterAll(() => {
    if (tmpDir) fs.rmSync(tmpDir, {recursive: true, force: true})
  })

  it('converts a short clip to HEVC MP4 with AAC audio', async () => {
    const out = path.join(tmpDir, 'converted-hevc.mp4')
    await convertVideoFile(sampleMp4, out, {
      codec: 'hevc',
      resolution: 480,
      quality: 'economy',
      duration: 5,
    })
    const probe = await ffprobe(out)
    expect(fs.statSync(out).size).toBeGreaterThan(0)
    expect(probe.streams?.find((stream) => stream.codec_type === 'video')?.codec_name).toBe('hevc')
    expect(probe.streams?.find((stream) => stream.codec_type === 'audio')?.codec_name ?? 'aac').toBe('aac')
    expect(Number(probe.format.duration)).toBeGreaterThan(0)
  }, 60_000)

  it('ffprobe reports a short video stream', async () => {
    const probe = await ffprobe(sampleMp4)
    expect(Number(probe.format.duration)).toBeGreaterThan(4)
    expect(Number(probe.format.duration)).toBeLessThan(6)
    const video = (probe.streams || []).find((stream) => stream.codec_type === 'video')
    expect(video).toBeTruthy()
    expect(Number(video?.width)).toBe(320)
    expect(Number(video?.height)).toBe(240)
    expect(probe.streams?.find((stream) => stream.codec_type === 'audio')?.codec_name).toBe('aac')
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

  it('extractVideoThumbnail can overwrite the same jpg path (image2 -update)', async () => {
    const out = path.join(tmpDir, 'thumb-overwrite.jpg')
    await extractVideoThumbnail({
      input: sampleMp4,
      outputPath: out,
      height: 120,
      seekRatio: 0.25,
    })
    const firstSize = fs.statSync(out).size
    await extractVideoThumbnail({
      input: sampleMp4,
      outputPath: out,
      height: 200,
      seekRatio: 0.75,
    })
    expect(fs.statSync(out).size).toBeGreaterThan(500)
    expect(fs.statSync(out).size).not.toBe(firstSize)
  })
})
