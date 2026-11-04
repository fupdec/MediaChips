import {execFile} from 'child_process'
import {promisify} from 'util'
import {getFfmpegPath, getFfprobePath} from '../../utils/ffmpegPaths'
import {runWithFfmpegLimit, runWithFfprobeLimit} from '../mediaPostProcessQueue'
import {getVideoStreamDimensions, normalizeFfprobePayload, resolveStreamFps} from '../../utils/ffprobeMath'
import type {FfprobeStream} from '../../utils/ffprobeMath'
import type {CloudMediaMetadata} from '../cloudAccounts/mediaMetadata'
const exec = promisify(execFile)
// Exclude playlists / concat demuxers, which could refer to other files or URLs.
const inputOptions = ['-protocol_whitelist', 'http,tcp', '-format_whitelist',
  'mov,matroska,webm,avi,asf,flv,mpeg,mpegts,ogg,mp3,wav,flac,aac,ac3,amr,aiff,ape,au,wv,caf,image2,jpeg_pipe,png_pipe,webp_pipe,bmp_pipe,tiff_pipe,gif,apng',
  '-rw_timeout', '15000000', '-probesize', '5000000', '-analyzeduration', '5000000']
export async function probeNasMedia(url: string, signal: AbortSignal) {
  return runWithFfprobeLimit(async () => {
    const {stdout} = await exec(getFfprobePath(), ['-v', 'error', '-max_alloc', '67108864', '-threads', '1', ...inputOptions, '-show_format', '-show_streams', '-of', 'json', url],
      {signal, timeout: 35_000, killSignal: 'SIGKILL', maxBuffer: 2 * 1024 * 1024})
    const raw = JSON.parse(stdout) as {format?: {tags?: Record<string, string>; duration?: string; bit_rate?: string};
      streams?: Array<FfprobeStream & {index: number; duration?: string; bit_rate?: string; disposition?: {attached_pic?: number}; tags?: Record<string, string>}>}
    const info = normalizeFfprobePayload(raw)
    const streams = raw.streams || []
    const stream = streams.find(item => item.codec_type === 'video' && !item.disposition?.attached_pic)
      || streams.find(item => item.codec_type === 'audio')
    const positive = (value: unknown) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : undefined
    const dimensions = getVideoStreamDimensions(info)
    const tags = {...raw.format?.tags, ...stream?.tags}
    const metadata: CloudMediaMetadata = {duration: positive(info.format.duration) || positive(stream?.duration),
      width: positive(dimensions.width), height: positive(dimensions.height),
      bitrate: positive(info.format.bit_rate) || positive(stream?.bit_rate), fps: resolveStreamFps(stream),
      codec: stream?.codec_name, title: tags?.title, artist: tags?.artist, album: tags?.album}
    const cover = streams.find(item => item.codec_type === 'video' && item.disposition?.attached_pic)
    return {metadata, coverIndex: cover?.index}
  }, {signal, priority: -10})
}
export async function createNasThumbnail(url: string, output: string, kind: string, duration: number | undefined, coverIndex: number | undefined, signal: AbortSignal, seekRatio?: number) {
  return runWithFfmpegLimit(async () => {
    const seek = kind === 'video' && duration
      ? seekRatio == null ? Math.min(duration / 2, 30) : duration * Math.min(Math.max(seekRatio, 0), 0.999)
      : 0
    await exec(getFfmpegPath(), ['-nostdin', '-hide_banner', '-loglevel', 'error', '-max_alloc', '67108864', '-threads', '1', ...inputOptions,
      ...(seek ? ['-ss', String(seek)] : []), '-i', url,
      '-map', kind === 'audio' ? `0:${coverIndex}` : '0:v:0', '-an', '-threads', '1',
      '-vf', "scale='min(640,iw)':-2", '-frames:v', '1', '-q:v', '3', '-f', 'image2', '-y', output],
      {signal, timeout: 45_000, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024})
  }, {signal, priority: -10})
}
