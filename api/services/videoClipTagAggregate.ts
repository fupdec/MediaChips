import type {
  ClipClassificationRow,
  ClipTagSuggestion,
  ClipTagSuggestionSample,
} from '../types/videoClipTagger'
import {getLocalizedLabel, tags} from './videoClipTagDictionary'
import {normalizeClipTagName} from './videoClipFrameSample'

export function aggregateFrameResults(
  frameResults: ClipClassificationRow[][],
  locale: string,
  existingTags: Array<{name?: string}> = [],
): ClipTagSuggestion[] {
  const existing = new Set(existingTags.map((tag) => normalizeClipTagName(tag.name)))
  const tagByKey = new Map(tags.map((tag: {key: string}) => [tag.key, tag]))
  const grouped = new Map<string, ClipTagSuggestion>()

  for (const row of frameResults.flat()) {
    const tag = tagByKey.get(row.key)
    if (!tag) continue

    const label = getLocalizedLabel(tag, locale)
    if (existing.has(normalizeClipTagName(label))) continue

    const current = grouped.get(row.key) || {
      key: row.key,
      word: label,
      label,
      canonical: getLocalizedLabel(tag, 'en'),
      occurrences: 0,
      confidence: 0,
      samples: [] as ClipTagSuggestionSample[],
      mediaIds: [] as unknown[],
    }

    current.occurrences += 1
    current.confidence = Math.max(current.confidence, row.score)
    if (row.mediaId && !current.mediaIds.includes(row.mediaId)) current.mediaIds.push(row.mediaId)
    if (current.samples.length < 3) {
      current.samples.push({
        mediaId: row.mediaId,
        timestamp: row.timestamp,
        score: row.score,
      })
    }

    grouped.set(row.key, current)
  }

  return [...grouped.values()]
    .sort((a, b) => (b.occurrences - a.occurrences) || (b.confidence - a.confidence))
}
