const QUALITY_TOKENS = /\b(?:2160p|1440p|1080p|720p|480p|4k|8k|uhd|fhd|hd|sd|x264|x265|h264|h265|hevc|avc|webrip|web[- ]?dl|bluray|bdrip|dvdrip|hdr|sdr)\b/gi

export function buildSceneSearchQueryFromFilename(filename: string): string {
  const baseName = String(filename || '')
    .replace(/\\/g, '/')
    .split('/')
    .pop() || ''

  const withoutExtension = baseName.replace(/\.[^.]+$/, '')

  return withoutExtension
    .replace(QUALITY_TOKENS, ' ')
    .replace(/[[\](){}]/g, ' ')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
