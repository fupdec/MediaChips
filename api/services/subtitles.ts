import {lstat, readFile, readdir} from 'node:fs/promises'
import path from 'node:path'
import {HttpError} from '../types/errors'
import {
  MAX_SUBTITLE_BYTES,
  MAX_SUBTITLE_TRACKS,
  matchSubtitleFileName,
  sortSubtitleTracks,
  type SubtitleFile,
  type SubtitleTrack,
} from '../../shared/subtitles'

/**
 * Legacy 8-bit files: Cyrillic text (windows-1251) is mostly high bytes, Western text (windows-1252)
 * only has a few accented letters among ASCII ones.
 */
function looksLikeCyrillicLegacy(buffer: Buffer): boolean {
  let high = 0
  let ascii = 0
  for (const byte of buffer) {
    if (byte >= 0x80) high++
    else if ((byte >= 0x41 && byte <= 0x5a) || (byte >= 0x61 && byte <= 0x7a)) ascii++
  }
  return high + ascii > 0 && high / (high + ascii) >= 0.3
}

/** UTF-8 (with or without BOM), UTF-16 with BOM, otherwise windows-1251/1252. */
export function decodeSubtitleBuffer(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString('utf8')
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buffer.subarray(2))
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(buffer.subarray(2))
  }
  try {
    return new TextDecoder('utf-8', {fatal: true}).decode(buffer)
  } catch {
    // Not UTF-8: fall through to the legacy code pages.
  }
  try {
    return new TextDecoder(looksLikeCyrillicLegacy(buffer) ? 'windows-1251' : 'windows-1252').decode(buffer)
  } catch {
    return buffer.toString('latin1')
  }
}

/** Subtitle files next to the video, named after it. */
export async function listSubtitleTracks(mediaFilePath: string): Promise<SubtitleTrack[]> {
  const directory = path.dirname(mediaFilePath)
  const baseName = path.parse(mediaFilePath).name
  let names: string[]
  try {
    names = await readdir(directory)
  } catch {
    return []
  }
  const tracks = names
    .map(name => matchSubtitleFileName(baseName, name))
    .filter((track): track is SubtitleTrack => track != null)
  return sortSubtitleTracks(tracks).slice(0, MAX_SUBTITLE_TRACKS)
}

/** Reads one listed track; names that are not in the listing (paths, other files) are never opened. */
export async function readSubtitleFile(mediaFilePath: string, name: string): Promise<SubtitleFile | null> {
  if (path.basename(name) !== name) return null
  const track = (await listSubtitleTracks(mediaFilePath)).find(item => item.name === name)
  if (!track) return null
  const filePath = path.join(path.dirname(mediaFilePath), track.name)
  const info = await lstat(filePath)
  if (!info.isFile()) return null
  if (info.size > MAX_SUBTITLE_BYTES) throw new HttpError(413, 'Subtitle file is too large')
  return {name: track.name, format: track.format, text: decodeSubtitleBuffer(await readFile(filePath))}
}
