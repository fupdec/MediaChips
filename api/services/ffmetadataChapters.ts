import type { PlayerChapter } from './markChaptersForPath'

function escapeFfmetadataValue(value: string): string {
  return String(value).replace(/[\\=;#\n\r]/g, (char) => `\\${char}`)
}

/** Build an ffmetadata chapters file body for mpv `--chapters-file`. */
export function buildFfmetadataChapters(chapters: PlayerChapter[]): string {
  const sorted = [...chapters]
    .map((chapter) => ({
      title: String(chapter.title || 'Mark'),
      timeMs: Math.max(0, Math.round(Number(chapter.time) * 1000)),
    }))
    .filter((chapter) => Number.isFinite(chapter.timeMs))
    .sort((a, b) => a.timeMs - b.timeMs || a.title.localeCompare(b.title))

  if (!sorted.length) return ';FFMETADATA1\n'

  const lines = [';FFMETADATA1']

  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index]
    const next = sorted[index + 1]
    const endMs = next
      ? Math.max(current.timeMs + 1, next.timeMs)
      : current.timeMs + 1000

    lines.push('[CHAPTER]')
    lines.push('TIMEBASE=1/1000')
    lines.push(`START=${current.timeMs}`)
    lines.push(`END=${endMs}`)
    lines.push(`title=${escapeFfmetadataValue(current.title)}`)
  }

  lines.push('')
  return lines.join('\n')
}
