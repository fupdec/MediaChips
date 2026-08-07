import path from 'path'
import type {ApiDb} from '../types/db'
import {formatChapterClock} from './autoChapterDetect'
import {
  getLocalAiStatus,
  iterateLocalAiChat,
  isLocalAiEnabled,
} from './localLlm'
import {extractJsonObject} from './localLlmChat'

/** Pull a short display stem from a media path/name for chapter titles. */
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
  if (total <= 1) return 'Scene'
  if (index === 0) return 'Opening'
  if (index === total - 1) return 'Ending'
  if (total >= 5) {
    const ratio = index / (total - 1)
    if (ratio < 0.34) return 'Early'
    if (ratio < 0.67) return 'Mid'
    return 'Late'
  }
  return `Scene ${index + 1}`
}

/**
 * Readable titles without an LLM: positional cue + optional stem + clock.
 * Example: "Opening · Neon Nights · 0:00"
 */
export function buildHeuristicChapterTitles(input: {
  filePathOrName?: string | null
  times: number[]
}): string[] {
  const times = (input.times || []).map((t) => Number(t)).filter((t) => Number.isFinite(t) && t >= 0)
  const stem = chapterTitleStem(input.filePathOrName)
  return times.map((time, index) => {
    const parts = [positionalLabel(index, times.length)]
    if (stem) parts.push(stem)
    parts.push(formatChapterClock(time))
    return parts.join(' · ')
  })
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

export async function buildLocalAiChapterTitles(
  db: ApiDb,
  input: {
    filePathOrName?: string | null
    times: number[]
    locale?: string
    shouldStop?: () => boolean
  },
): Promise<string[] | null> {
  const times = input.times || []
  if (times.length < 2) return null
  if (!isLocalAiEnabled(db)) return null
  const status = getLocalAiStatus(db)
  if (!['downloaded', 'loaded'].includes(String(status.status || ''))) return null

  const stem = chapterTitleStem(input.filePathOrName) || 'video'
  const clocks = times.map((time, index) => ({
    index: index + 1,
    time: formatChapterClock(time),
  }))

  let finalText = ''
  for await (const event of iterateLocalAiChat(db, {
    mode: 'meta',
    locale: input.locale || 'en',
    messages: [{
      role: 'user',
      content: [
        'Invent short chapter titles for a video timeline.',
        `Return ONLY JSON: {"titles":["..."]} with exactly ${times.length} titles.`,
        'Each title ≤ 6 words, no numbering, no timestamps in the title text.',
        `Video name: ${JSON.stringify(stem)}`,
        `Chapters: ${JSON.stringify(clocks)}`,
      ].join('\n'),
    }],
    context: {
      goal: 'chapter titles',
    },
    system: 'Return only JSON with key titles (string array). Keep titles concise and specific to the video name when possible.',
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
    times: number[]
    locale?: string
    useLlmTitles?: boolean
    shouldStop?: () => boolean
  },
): Promise<string[]> {
  const heuristic = buildHeuristicChapterTitles(input)
  if (!input.useLlmTitles) return heuristic
  try {
    const llmTitles = await buildLocalAiChapterTitles(db, input)
    if (llmTitles?.length === input.times.length) return llmTitles
  } catch {
    // Fall back to heuristics when Local AI is unavailable or fails.
  }
  return heuristic
}
