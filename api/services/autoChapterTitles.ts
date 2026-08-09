import path from 'path'
import type {ApiDb} from '../types/db'
import {formatChapterClock} from './autoChapterDetect'
import {
  getLocalAiStatus,
  iterateLocalAiChat,
  isLocalAiEnabled,
} from './localLlm'
import {extractJsonObject} from './localLlmChat'
import {hasDownloadedModel, labelFramesAtTimestamps} from './videoClipTagger'

/** Pull a short display stem from a media path/name (for LLM context only — not chapter text). */
export function chapterTitleStem(filePathOrName: string | null | undefined): string {
  const raw = String(filePathOrName || '').trim()
  if (!raw) return ''
  const base = path.basename(raw).replace(/\.[^.]+$/, '')
  return base
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48)
}

function positionalLabel(index: number, total: number): string {
  if (total <= 1) return 'Chapter 1'
  if (index === 0) return 'Opening'
  if (index === total - 1) return 'Ending'
  // Avoid Early/Mid/Late spam when many chapters land in one third of the file.
  return `Chapter ${index + 1}`
}

/**
 * Readable titles without vision/LLM: positional cue + clock.
 * Example: "Opening · 0:00" — never the filename.
 */
export function buildHeuristicChapterTitles(input: {
  filePathOrName?: string | null
  times: number[]
}): string[] {
  void input.filePathOrName
  const times = (input.times || []).map((t) => Number(t)).filter((t) => Number.isFinite(t) && t >= 0)
  return times.map((time, index) => (
    `${positionalLabel(index, times.length)} · ${formatChapterClock(time)}`
  ))
}

export function parseChapterTitlesResponse(
  parsed: Record<string, unknown> | null,
  expectedCount: number,
): string[] | null {
  if (!parsed || typeof parsed !== 'object') return null
  const raw = Array.isArray(parsed.titles) ? parsed.titles : null
  if (!raw || raw.length < expectedCount) return null
  const titles = raw
    .slice(0, expectedCount)
    .map((item) => String(item ?? '').trim().replace(/\s+/g, ' ').slice(0, 80))
  if (titles.some((title) => !title)) return null
  return titles
}

/** Build chapter titles from CLIP labels at each cut (description · clock). */
export function buildTitlesFromVisionLabels(input: {
  times: number[]
  labels: Array<{label: string; score: number} | null>
}): string[] | null {
  const times = (input.times || []).map((t) => Number(t)).filter((t) => Number.isFinite(t) && t >= 0)
  if (!times.length || input.labels.length !== times.length) return null
  if (!input.labels.some((row) => row?.label)) return null

  return times.map((time, index) => {
    const label = String(input.labels[index]?.label || '').trim()
    if (label) return `${label} · ${formatChapterClock(time)}`
    return `${positionalLabel(index, times.length)} · ${formatChapterClock(time)}`
  })
}

export async function buildClipChapterTitles(
  db: ApiDb,
  input: {
    videoPath?: string | null
    times: number[]
    locale?: string
    shouldStop?: () => boolean
    onProgress?: (fraction: number) => void
  },
): Promise<string[] | null> {
  const videoPath = String(input.videoPath || '').trim()
  const times = input.times || []
  if (!videoPath || times.length < 2) return null
  if (!hasDownloadedModel(db)) return null

  const labels = await labelFramesAtTimestamps(db, videoPath, times, {
    locale: input.locale,
    shouldStop: input.shouldStop,
    onProgress: input.onProgress,
  })
  if (!labels) return null
  return buildTitlesFromVisionLabels({times, labels})
}

export async function buildLocalAiChapterTitles(
  db: ApiDb,
  input: {
    filePathOrName?: string | null
    times: number[]
    locale?: string
    shouldStop?: () => boolean
    /** Optional on-screen cues (CLIP labels) so the model does not echo the file name. */
    visionLabels?: Array<string | null | undefined>
  },
): Promise<string[] | null> {
  const times = input.times || []
  if (times.length < 2) return null
  if (!isLocalAiEnabled(db)) return null
  const status = getLocalAiStatus(db)
  if (!['downloaded', 'loaded'].includes(String(status.status || ''))) return null

  const clocks = times.map((time, index) => ({
    index: index + 1,
    time: formatChapterClock(time),
    visual: String(input.visionLabels?.[index] || '').trim() || null,
  }))

  let finalText = ''
  for await (const event of iterateLocalAiChat(db, {
    mode: 'meta',
    locale: input.locale || 'en',
    messages: [{
      role: 'user',
      content: [
        'Rewrite chapter titles using the visual cues for each scene.',
        `Return ONLY JSON: {"titles":["..."]} with exactly ${times.length} titles.`,
        'Each title ≤ 5 words, no numbering, no timestamps, no “Chapter/Глава/Introduction/Conclusion”.',
        'Do NOT invent generic book-style labels. Do NOT use the video file name.',
        'If a visual cue is present, keep it (you may shorten or localize). If missing, use a short distinct action label.',
        `Chapters: ${JSON.stringify(clocks)}`,
      ].join('\n'),
    }],
    context: {
      goal: 'chapter titles',
    },
    system: 'Return only JSON with key titles (string array). Ground titles in visual cues; never invent Introduction/Conclusion templates.',
  }, {shouldStop: input.shouldStop})) {
    if (event.type === 'done') finalText = String(event.text || '')
    if (event.type === 'error' || event.type === 'aborted') return null
  }

  const parsed = extractJsonObject(finalText)
  const titles = parseChapterTitlesResponse(parsed, times.length)
  if (!titles) return null
  // Keep clocks for player/scrobble clarity.
  return titles.map((title, index) => `${title} · ${formatChapterClock(times[index] || 0)}`)
}

export async function resolveAutoChapterTitles(
  db: ApiDb,
  input: {
    filePathOrName?: string | null
    /** Resolved on-disk path for frame sampling (CLIP descriptions). */
    videoPath?: string | null
    times: number[]
    locale?: string
    useLlmTitles?: boolean
    shouldStop?: () => boolean
    onProgress?: (fraction: number) => void
  },
): Promise<string[]> {
  const heuristic = buildHeuristicChapterTitles(input)
  const report = (fraction: number) => input.onProgress?.(Math.min(1, Math.max(0, fraction)))

  let visionLabels: Array<string | null> | undefined
  let clipTitles: string[] | null = null

  try {
    report(0.05)
    clipTitles = await buildClipChapterTitles(db, {
      videoPath: input.videoPath,
      times: input.times,
      locale: input.locale,
      shouldStop: input.shouldStop,
      onProgress: (fraction) => report(0.05 + fraction * 0.75),
    })
    if (clipTitles) {
      visionLabels = clipTitles.map((title) => {
        const clockSep = title.lastIndexOf(' · ')
        return clockSep > 0 ? title.slice(0, clockSep).trim() : title
      })
    }
  } catch {
    clipTitles = null
  }

  // Only polish with Local AI when CLIP grounded most chapters — otherwise it
  // invents generic “Introduction / Conclusion” labels with no scene signal.
  const grounded = (visionLabels || []).filter((label) => Boolean(label && !/^(Opening|Ending|Chapter\s+\d+)$/i.test(label))).length
  const canUseLlm = Boolean(input.useLlmTitles)
    && grounded >= Math.max(2, Math.ceil(input.times.length * 0.5))

  if (canUseLlm) {
    try {
      report(0.85)
      const llmTitles = await buildLocalAiChapterTitles(db, {
        filePathOrName: input.filePathOrName,
        times: input.times,
        locale: input.locale,
        shouldStop: input.shouldStop,
        visionLabels,
      })
      if (llmTitles?.length === input.times.length) {
        report(1)
        return llmTitles
      }
    } catch {
      // Fall through to CLIP / heuristic.
    }
  }

  if (clipTitles?.length === input.times.length) {
    report(1)
    return clipTitles
  }

  report(1)
  return heuristic
}
