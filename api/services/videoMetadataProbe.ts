import {ffprobe} from '../utils/ffmpeg'

interface FfprobeStream {
  codec_type?: string
  codec_name?: string
  width?: number
  height?: number
  nb_frames?: number
}

interface FfprobeInfo {
  format: {
    duration: number
    bit_rate: number
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
    if (info.format.duration < 1) {
      throw new Error('duration less than 1 sec.')
    }

    const duration = Math.floor(info.format.duration)

    let width: number | undefined
    let height: number | undefined
    let codec: string | undefined
    let fps: number | undefined

    for (const stream of info.streams) {
      if (stream.codec_type !== 'video') continue
      width = stream.width
      height = stream.height
      codec = stream.codec_name
      fps = Math.ceil((stream.nb_frames ?? 0) / info.format.duration)
      break
    }

    return {
      duration,
      bitrate: info.format.bit_rate,
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
