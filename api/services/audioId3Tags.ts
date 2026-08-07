/** Pick ID3 / container tags from ffprobe format.tags (case-insensitive). */

export function pickFfprobeTag(
  tags: Record<string, unknown> | null | undefined,
  keys: string[],
): string | null {
  if (!tags || typeof tags !== 'object') return null
  const entries = Object.entries(tags)
  for (const key of keys) {
    const wanted = key.toLowerCase()
    for (const [rawKey, rawValue] of entries) {
      if (String(rawKey).toLowerCase() !== wanted) continue
      const value = String(rawValue ?? '').trim()
      if (value) return value
    }
  }
  return null
}

export function parseAudioId3Tags(tags: Record<string, unknown> | null | undefined): {
  title: string | null
  artist: string | null
  album: string | null
} {
  return {
    title: pickFfprobeTag(tags, ['title', 'TIT2']),
    artist: pickFfprobeTag(tags, ['artist', 'album_artist', 'albumartist', 'TPE1', 'TPE2']),
    album: pickFfprobeTag(tags, ['album', 'TALB']),
  }
}
