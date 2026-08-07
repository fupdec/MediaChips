import {ffprobe, resolveFfprobeDuration} from '../utils/ffmpeg'
import {
  estimateBitrate,
  isUsableDuration,
  resolveStreamFps,
  type FfprobeStream,
} from '../utils/ffprobeMath'

interface FfprobeInfo {
  format: {
    duration: number
    bit_rate?: number
    size?: number
  }
  streams: FfprobeStream[]
}

export interface VideoMetadataProbeResult {
  duration: number
  bitrate: number
  width?: number
  height?: number
  codec?: string
  fps?: number
}

const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => Promise.race([
  promise,
  new Promise<T>((_, reject) => {
    setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  }),
])

export async function probeVideoMetadata(pathToFile: string): Promise<VideoMetadataProbeResult | false> {
  try {
    const info = await withTimeout(ffprobe(pathToFile), 60000, 'ffprobe') as FfprobeInfo
    const resolvedDuration = await withTimeout(
      resolveFfprobeDuration(pathToFile, info.format.duration),
      60000,
      'ffprobe duration',
    )

    if (!isUsableDuration(resolvedDuration)) {
      throw new Error('duration less than 1 sec.')
    }

    const duration = Math.floor(resolvedDuration)

    let width: number | undefined
    let height: number | undefined
    let codec: string | undefined
    let fps: number | undefined

    for (const stream of info.streams) {
      if (stream.codec_type !== 'video') continue
      const streamWidth = Number(stream.width)
      const streamHeight = Number(stream.height)
      width = Number.isFinite(streamWidth) && streamWidth > 0 ? streamWidth : undefined
      height = Number.isFinite(streamHeight) && streamHeight > 0 ? streamHeight : undefined
      codec = stream.codec_name
      fps = resolveStreamFps(stream, resolvedDuration)
      break
    }

    const bitrate = Number.isFinite(Number(info.format.bit_rate)) && Number(info.format.bit_rate) > 0
      ? Number(info.format.bit_rate)
      : estimateBitrate(info.format.size, resolvedDuration) ?? 0

    return {
      duration,
      bitrate,
      width,
      height,
      codec,
      fps,
    }
  } catch (error) {
    console.error(error)
    return false
  }
}
