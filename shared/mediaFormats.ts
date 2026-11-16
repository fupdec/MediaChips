// Recognized video containers. Playback is decided by the player, not the extension.
export const VIDEO_CONTENT_TYPES: Record<string, string> = {
  mp4: 'video/mp4', m4v: 'video/mp4', mp4v: 'video/mp4', webm: 'video/webm',
  mov: 'video/quicktime', qt: 'video/quicktime', mkv: 'video/x-matroska',
  avi: 'video/x-msvideo', wmv: 'video/x-ms-wmv', asf: 'video/x-ms-asf',
  mpeg: 'video/mpeg', mpg: 'video/mpeg', mpe: 'video/mpeg', m1v: 'video/mpeg', m2v: 'video/mpeg',
  ts: 'video/mp2t', mts: 'video/mp2t', m2ts: 'video/mp2t', m2t: 'video/mp2t',
  vob: 'video/mpeg', mod: 'video/mpeg', tod: 'video/mp2t',
  flv: 'video/x-flv', f4v: 'video/mp4', '3gp': 'video/3gpp', '3gpp': 'video/3gpp', '3g2': 'video/3gpp2',
  ogv: 'video/ogg', ogm: 'video/ogg', mxf: 'video/mxf', rm: 'video/vnd.rn-realvideo', rmvb: 'video/vnd.rn-realvideo',
  divx: 'video/x-msvideo',
}
export const AUDIO_CONTENT_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac',
}
export const IMAGE_CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp',
}
export function mediaFileKind(name: string): 'video' | 'audio' | 'image' | null {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (Object.prototype.hasOwnProperty.call(VIDEO_CONTENT_TYPES, ext)) return 'video'
  if (Object.prototype.hasOwnProperty.call(AUDIO_CONTENT_TYPES, ext)) return 'audio'
  if (Object.prototype.hasOwnProperty.call(IMAGE_CONTENT_TYPES, ext)) return 'image'
  return null
}
export function mediaFileContentType(name: string): string | null {
  const kind = mediaFileKind(name)
  if (!kind) return null
  const types = kind === 'video' ? VIDEO_CONTENT_TYPES : kind === 'audio' ? AUDIO_CONTENT_TYPES : IMAGE_CONTENT_TYPES
  return types[name.split('.').pop()!.toLowerCase()]
}
