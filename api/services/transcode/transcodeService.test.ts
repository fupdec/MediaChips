// @vitest-environment node
import fs from 'fs'
import os from 'os'
import path from 'path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {createTranscodeManager} from './transcodeService'
import {ffprobePlayability, runFfmpegBackground} from '../../utils/ffmpeg'
import {getCacheDir} from './transcodeCache'

vi.mock('../../utils/ffmpeg', () => ({
  ffprobe: vi.fn(), ffprobePlayability: vi.fn(), resolveFfprobeDuration: vi.fn(), runFfmpegBackground: vi.fn(),
}))
vi.mock('./mp4ContainerLayout', () => ({needsBrowserRemuxForMp4: () => true}))

describe('native playback and cache maintenance', () => {
  let root: string
  let manager: ReturnType<typeof createTranscodeManager>
  beforeEach(() => {
    vi.clearAllMocks()
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-native-playback-'))
    manager = createTranscodeManager({databasesPath: root, getActiveDbId: () => 'db', db: null})
    vi.mocked(ffprobePlayability).mockResolvedValue({streams: [
      {codec_type: 'video', codec_name: 'hevc'}, {codec_type: 'audio', codec_name: 'ac3'},
    ], format: {duration: '120'}} as never)
  })
  afterEach(() => {
    fs.rmSync(root, {recursive: true, force: true})
    delete (global as {serverConfig?: unknown}).serverConfig
  })
  it.each(['movie.mp4', 'movie.mkv', 'movie.mov'])('serves %s as original bytes with transcoding disabled', async name => {
    const source = path.join(root, name)
    fs.writeFileSync(source, 'source')
    const result = await manager.resolveStreamPath(source, 'auto', {transcodeEnabled: false})
    expect(result.filePath).toBe(source)
    expect(result.plan).toMatchObject({mode: 'direct', transcodeRequired: false, transcodeEnabled: false,
      playability: {videoCodec: 'hevc', audioCodec: 'ac3'}})
    expect(ffprobePlayability).toHaveBeenCalledWith(source)
    expect(runFfmpegBackground).not.toHaveBeenCalled()
  })
  it('does not build a disk copy just because an otherwise compatible MP4 has a layout warning', async () => {
    const source = path.join(root, 'movie.mp4')
    fs.writeFileSync(source, 'source')
    vi.mocked(ffprobePlayability).mockResolvedValue({streams: [
      {codec_type: 'video', codec_name: 'h264'}, {codec_type: 'audio', codec_name: 'aac'},
    ], format: {duration: '120'}} as never)
    expect((await manager.resolveStreamPath(source)).filePath).toBe(source)
    expect(runFfmpegBackground).not.toHaveBeenCalled()
    expect(fs.existsSync(getCacheDir(root, 'db'))).toBe(false)
  })
  it('trims old caches on a stats request even when no new remux is created', async () => {
    ;(global as {serverConfig?: unknown}).serverConfig = {transcodeCacheMaxGb: String(100 / 1024 ** 3)}
    const dir = getCacheDir(root, 'db')
    fs.mkdirSync(dir, {recursive: true})
    fs.writeFileSync(path.join(dir, 'old.part.mp4'), Buffer.alloc(200))
    expect(await manager.getCacheStatsForActiveDb()).toEqual({bytes: 0, files: 0, entries: 0})
  })
})
