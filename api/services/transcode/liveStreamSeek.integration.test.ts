// @vitest-environment node
import fs from 'fs'
import os from 'os'
import path from 'path'
import {execFileSync} from 'child_process'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {getFfmpegPath, getFfprobePath} from '../../utils/ffmpegPaths'
import {buildFfmpegLiveArgs} from './liveStreamFfmpegArgs'

describe('real FFmpeg live seeks', () => {
  const ffmpeg = getFfmpegPath()
  let root: string
  let source: string
  const run = (args: string[]) => execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', ...args], {timeout: 20000})
  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-live-seek-'))
    source = path.join(root, 'source.mkv')
    // Brightness encodes absolute time, so a seek that accidentally lands at
    // the previous keyframe or t=0 produces measurably different first pixels.
    run(['-f', 'lavfi', '-i', "nullsrc=s=64x64:r=10:d=36,geq=lum='16+5*T':cb=80:cr=170",
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=36', '-c:v', 'libx264', '-g', '50',
      '-c:a', 'aac', '-shortest', source])
  }, 30000)
  afterAll(() => fs.rmSync(root, {recursive: true, force: true}))
  it.each([3.3, 29.3])('starts video and audio at %ss without a preroll window', start => {
    const stream = run(buildFfmpegLiveArgs({inputPath: source, startTime: start, duration: 2}))
    const output = path.join(root, `seek-${start}.mp4`)
    fs.writeFileSync(output, stream)
    const probe = JSON.parse(execFileSync(getFfprobePath(), ['-v', 'error', '-show_streams', '-of', 'json', output], {encoding: 'utf8'}))
    expect(probe.streams.map((item: {codec_type: string}) => item.codec_type)).toEqual(['video', 'audio'])
    for (const track of probe.streams) expect(Math.abs(Number(track.start_time))).toBeLessThan(0.15)
    const firstPixel = (file: string, seek?: number) => run([
      ...(seek == null ? [] : ['-ss', String(seek)]), '-i', file, '-frames:v', '1',
      '-vf', 'scale=1:1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1',
    ])
    const expected = firstPixel(source, start)
    const actual = firstPixel(output)
    expect(actual.length).toBe(3)
    expect(Math.max(...actual.map((value, index) => Math.abs(value - expected[index])))).toBeLessThan(6)
    const zero = firstPixel(source, 0)
    expect(Math.max(...actual.map((value, index) => Math.abs(value - zero[index])))).toBeGreaterThan(10)
  })
})
