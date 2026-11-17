export interface SubtitleCue {
  start: number
  end: number
  text: string
}

const TIMESTAMP = /^(?:(\d+):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/

/** "00:01:02,500" (SRT), "00:01:02.500" or "01:02.500" (WebVTT) → seconds. */
export function parseSubtitleTimestamp(value: string): number | null {
  const match = TIMESTAMP.exec(value.trim())
  if (!match) return null
  const hours = Number(match[1] ?? 0)
  const minutes = Number(match[2])
  const seconds = Number(match[3])
  if (minutes > 59 || seconds > 59) return null
  const milliseconds = match[4] ? Number(match[4].padEnd(3, '0')) : 0
  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000
}

/** SRT and WebVTT in one tolerant parser: cue blocks are found by their "start --> end" line. */
export function parseSubtitles(text: string): SubtitleCue[] {
  const normalized = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const cues: SubtitleCue[] = []
  for (const block of normalized.split(/\n\s*\n/)) {
    const lines = block.split('\n')
    const timingIndex = lines.findIndex(line => line.includes('-->'))
    if (timingIndex < 0) continue // WEBVTT header, NOTE, STYLE, REGION blocks
    const timing = /^\s*(\S+)\s*-->\s*(\S+)/.exec(lines[timingIndex])
    if (!timing) continue
    const start = parseSubtitleTimestamp(timing[1])
    const end = parseSubtitleTimestamp(timing[2])
    if (start == null || end == null || end <= start) continue
    const cueText = lines.slice(timingIndex + 1).join('\n').trim()
    if (cueText) cues.push({start, end, text: cueText})
  }
  return cues.sort((a, b) => a.start - b.start)
}

const ACTIVE_LOOKBACK = 8

/** Cues showing at `time`; `cues` must be sorted by start (parseSubtitles does that). */
export function findActiveCues(cues: readonly SubtitleCue[], time: number): SubtitleCue[] {
  let low = 0
  let high = cues.length - 1
  let last = -1
  while (low <= high) {
    const middle = (low + high) >> 1
    if (cues[middle].start <= time) {
      last = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  const active: SubtitleCue[] = []
  for (let index = last; index >= 0 && index > last - ACTIVE_LOOKBACK; index--) {
    if (cues[index].end > time) active.unshift(cues[index])
  }
  return active
}

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

const TAG = /<\/?[a-zA-Z0-9][^<>]*>/g
const ALLOWED_TAG = /^<\/?(i|b|u)>$/

/**
 * Cue text → safe HTML: everything is escaped, only <i>, <b> and <u> survive,
 * other tags (font, voice, karaoke timestamps) and ASS overrides like {\an8} are dropped.
 */
export function cueTextToHtml(text: string): string {
  const source = text.replace(/\{\\[^}]*\}/g, '')
  let html = ''
  let last = 0
  for (const match of source.matchAll(TAG)) {
    const index = match.index ?? 0
    html += escapeHtml(source.slice(last, index))
    const tag = match[0].toLowerCase()
    if (ALLOWED_TAG.test(tag)) html += tag
    last = index + match[0].length
  }
  html += escapeHtml(source.slice(last))
  return html.replace(/\n/g, '<br>')
}
