import type { ApiDb } from '../types/db'
import { createMarksRepository } from '../db/repositories/marks'
import { createMediaRepository } from '../db/repositories/media'
import { buildPathLookupVariants } from '../utils/normalizeUserPath'

export interface PlayerChapter {
  title: string
  time: number
}

export interface MarkChaptersForPathResult {
  found: boolean
  mediaId: number | null
  path: string | null
  chapters: PlayerChapter[]
}

type MarkForChapter = {
  type?: string | null
  text?: string | null
  time?: number | null
  end?: number | null
  tagId?: number | null
  'tag.name'?: string | null
  tag?: {name?: string | null} | null
}

function stripFileUrl(value: string): string {
  let result = value.trim()
  if (!/^file:/i.test(result)) return result

  try {
    result = decodeURIComponent(result)
  } catch {
    // keep undecoded path
  }

  result = result.replace(/^file:\/\/\/?/i, '')
  result = result.replace(/^localhost\//i, '')

  // file:///C:/video.mp4 → /C:/video.mp4 on some platforms
  if (/^\/[A-Za-z]:[\\/]/.test(result)) {
    result = result.slice(1)
  }

  return result
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

export function chapterTitleFromMark(mark: MarkForChapter): string {
  const tagName = mark['tag.name'] || mark.tag?.name
  if (tagName) return stripHtml(String(tagName))

  const type = String(mark.type || '').toLowerCase()
  if (type === 'favorite') return 'Favorite'
  if (type === 'bookmark') {
    const text = mark.text ? stripHtml(String(mark.text)) : ''
    return text || 'Bookmark'
  }

  if (mark.text) {
    const text = stripHtml(String(mark.text))
    if (text) return text
  }

  if (type === 'meta' || mark.tagId) return 'Mark'
  if (type) return type.charAt(0).toUpperCase() + type.slice(1)
  return 'Mark'
}

export function marksToChapters(marks: MarkForChapter[]): PlayerChapter[] {
  return marks
    .map((mark) => {
      const time = Number(mark.time)
      if (!Number.isFinite(time) || time < 0) return null
      return {
        title: chapterTitleFromMark(mark),
        time,
      }
    })
    .filter((item): item is PlayerChapter => item != null)
    .sort((a, b) => a.time - b.time || a.title.localeCompare(b.title))
}

export function resolveMarkChaptersForPath(
  db: ApiDb,
  rawPath: string,
): MarkChaptersForPathResult {
  const cleaned = stripFileUrl(String(rawPath || ''))
  const variants = buildPathLookupVariants(cleaned)

  if (!variants.length) {
    return {found: false, mediaId: null, path: null, chapters: []}
  }

  const mediaRepo = createMediaRepository(db.drizzle)
  const medium = mediaRepo.findByPathVariants(variants)
  if (!medium?.id) {
    return {found: false, mediaId: null, path: null, chapters: []}
  }

  const marksRepo = createMarksRepository(db.drizzle)
  const marks = marksRepo.findAllForVideo(medium.id)

  return {
    found: true,
    mediaId: medium.id,
    path: medium.path ?? null,
    chapters: marksToChapters(marks),
  }
}
