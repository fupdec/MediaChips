/** A configurable evidence score, never a probability of byte identity. */
export const DUPLICATE_POLICY_SETTING = 'duplicateSimilarityPolicy'
export const SIMILARITY_SIGNALS = ['path', 'name', 'size', 'oshash', 'visual'] as const
export type SimilaritySignal = typeof SIMILARITY_SIGNALS[number]
export type OriginalPriority = 'quality' | 'largest' | 'smallest' | 'oldest' | 'newest'
export type DuplicateFileAction = 'keep' | 'delete'
export type DuplicatePolicy = {
  weights: Record<SimilaritySignal, number>
  required: SimilaritySignal[]
  threshold: number
  visualMinimum: number
  minimumFrames: number
  priority: OriginalPriority
  files: DuplicateFileAction
  autoMerge: boolean
  searchSimilarVideos?: boolean
}
export const defaultDuplicatePolicy = (): DuplicatePolicy => ({
  weights: {path: 0, name: 0, size: 0, oshash: 100, visual: 0},
  required: [], threshold: 75, visualMinimum: 85, minimumFrames: 6,
  priority: 'quality', files: 'keep', autoMerge: false,
})
export function parseDuplicatePolicy(raw: unknown): DuplicatePolicy {
  const fallback = defaultDuplicatePolicy()
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback
    const num = (v: unknown, d: number, min: number, max: number) =>
      typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : d
    const weights = {...fallback.weights}
    for (const key of SIMILARITY_SIGNALS) weights[key] = num(value.weights?.[key], weights[key], 0, 100)
    return {
      weights,
      required: Array.isArray(value.required) ? SIMILARITY_SIGNALS.filter(key => value.required.includes(key)) : [],
      threshold: num(value.threshold, fallback.threshold, 1, 100),
      visualMinimum: num(value.visualMinimum, fallback.visualMinimum, 1, 100),
      minimumFrames: num(value.minimumFrames, fallback.minimumFrames, 1, 9),
      priority: ['quality', 'largest', 'smallest', 'oldest', 'newest'].includes(value.priority) ? value.priority : fallback.priority,
      files: value.files === 'delete' ? 'delete' : 'keep',
      autoMerge: value.autoMerge === true,
      searchSimilarVideos: typeof value.searchSimilarVideos === 'boolean' ? value.searchSimilarVideos : undefined,
    }
  } catch { return fallback }
}
export type SimilarityItem = {
  mediaTypeId?: number | null
  id: number; path: string; basename?: string | null; filesize?: number | null
  oshash?: string | null; visualHash?: string | null; visualHashTiles?: string | null
  width?: number | null; height?: number | null; createdAt?: string | null
}
export type SimilarityEvidence = {
  ids: [number, number]
  score: number
  signals: Record<SimilaritySignal, number | null>
  matchingFrames: number
  eligible: boolean
}
export function hashSimilarity(a?: string | null, b?: string | null): number | null {
  if (!a || !b || !/^[0-9a-f]{16}$/i.test(a) || !/^[0-9a-f]{16}$/i.test(b)) return null
  let distance = 0
  for (let i = 0; i < 16; i++) {
    let xor = parseInt(a[i], 16) ^ parseInt(b[i], 16)
    while (xor) { distance++; xor &= xor - 1 }
  }
  return 100 * (64 - distance) / 64
}
const filename = (item: SimilarityItem) => (item.basename || item.path.split(/[\\/]/).pop() || '')
  .replace(/\.[^.]+$/, '').normalize('NFC').toLocaleLowerCase()
type SimilarityExplanation = {
  contributions: Record<SimilaritySignal, number>
  requiredFailures: SimilaritySignal[]
  noWeights: boolean
  noStrongMatch: boolean
}
export function compareSimilarity(a: SimilarityItem, b: SimilarityItem, policy: DuplicatePolicy, explain: true): SimilarityEvidence & SimilarityExplanation
export function compareSimilarity(a: SimilarityItem, b: SimilarityItem, policy: DuplicatePolicy): SimilarityEvidence
export function compareSimilarity(a: SimilarityItem, b: SimilarityItem, policy: DuplicatePolicy, explain = false) {
  const grid = hashSimilarity(a.visualHash, b.visualHash)
  const tilesA = (a.visualHashTiles || '').split(':')
  const tilesB = (b.visualHashTiles || '').split(':')
  const frames = Array.from({length: 9}, (_, i) => hashSimilarity(tilesA[i], tilesB[i]))
  const availableFrames = frames.filter((value): value is number => value != null)
  const matchingFrames = availableFrames.filter(value => value >= policy.visualMinimum).length
  // A single matching thumbnail cannot establish similarity for an entire video.
  const tileScore = availableFrames.length === 9 && matchingFrames >= policy.minimumFrames
    ? availableFrames.reduce((sum, value) => sum + value, 0) / 9 : null
  const visual = grid == null && tileScore == null ? null : Math.max(grid ?? 0, tileScore ?? 0)
  const signals: SimilarityEvidence['signals'] = {
    path: a.path && b.path ? Number(a.path === b.path) * 100 : null,
    name: filename(a) && filename(b) ? Number(filename(a) === filename(b)) * 100 : null,
    size: Number(a.filesize) > 0 && Number(b.filesize) > 0 ? Number(a.filesize === b.filesize) * 100 : null,
    oshash: a.oshash && b.oshash ? Number(a.oshash === b.oshash && a.filesize === b.filesize) * 100 : null,
    visual,
  }
  const passed = (key: SimilaritySignal) => key === 'visual'
    ? (grid != null && grid >= policy.visualMinimum) || (availableFrames.length === 9 && matchingFrames >= policy.minimumFrames)
    : signals[key] === 100
  const weights = {...policy.weights}
  if (policy.searchSimilarVideos === false) weights.visual = 0
  const total = SIMILARITY_SIGNALS.reduce((sum, key) => sum + weights[key], 0)
  // Keep the denominator fixed: unavailable evidence contributes zero, never inflates the score.
  const weightedScore = total ? SIMILARITY_SIGNALS.reduce((sum, key) => sum + weights[key] * (signals[key] ?? 0), 0) / total : 0
  const weightedMatch = (weights.oshash > 0 && passed('oshash')) || (weights.visual > 0 && passed('visual')) || (weights.path > 0 && passed('path'))
  const visualMatch = policy.searchSimilarVideos === true && passed('visual')
  const useVisualScore = visualMatch && (!weightedMatch || (visual ?? 0) > weightedScore)
  const score = useVisualScore ? visual ?? 0 : weightedScore
  const strong = weightedMatch || visualMatch
  const requiredFailures = policy.required.filter(key => !(key === 'visual' && policy.searchSimilarVideos === false) && !passed(key))
  const differentTypes = a.mediaTypeId != null && b.mediaTypeId != null && a.mediaTypeId !== b.mediaTypeId
  const evidence: SimilarityEvidence = {
    ids: [a.id, b.id], score: Math.round(score * 10) / 10, signals, matchingFrames,
    eligible: !differentTypes && score >= policy.threshold && strong && requiredFailures.length === 0,
  }
  if (!explain) return evidence

  const contributions = {...weights}
  for (const key of SIMILARITY_SIGNALS) {
    contributions[key] = useVisualScore ? (key === 'visual' ? score : 0)
      : total ? weights[key] * (signals[key] ?? 0) / total : 0
  }
  return {...evidence, contributions, requiredFailures,
    noWeights: total === 0 && policy.searchSimilarVideos !== true, noStrongMatch: !strong}
}
function compareOriginal(a: SimilarityItem, b: SimilarityItem, priority: OriginalPriority): number {
  const area = (x: SimilarityItem) => Number(x.width || 0) * Number(x.height || 0)
  const size = Number(b.filesize || 0) - Number(a.filesize || 0)
  const date = String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
  const primary = priority === 'quality' ? area(b) - area(a) : priority === 'largest' ? size
    : priority === 'smallest' ? -size : priority === 'oldest' ? date : -date
  return primary || size || a.id - b.id
}
export function pickSimilarityOriginal(items: SimilarityItem[], priority: OriginalPriority): number | null {
  return [...items].sort((a, b) => compareOriginal(a, b, priority))[0]?.id ?? null
}
function couldMatch(a: SimilarityItem, b: SimilarityItem, policy: DuplicatePolicy): boolean {
  return (policy.weights.path > 0 && a.path === b.path)
    || (policy.weights.oshash > 0 && Boolean(a.oshash && a.oshash === b.oshash && a.filesize === b.filesize))
    || ((policy.searchSimilarVideos ?? (policy.weights.visual > 0)) && Boolean(a.visualHash && b.visualHash || a.visualHashTiles && b.visualHashTiles))
}
/** Every member passes against its selected original. No transitive similarity chains. */
export function groupSimilarityItems(items: SimilarityItem[], policy: DuplicatePolicy) {
  const pending = new Map(items.map(item => [item.id, item]))
  const groups: Array<{key: string; itemIds: number[]; originalId: number; similarity: SimilarityEvidence[]; similarityItems: SimilarityItem[]}> = []
  const byId = new Map(pending)
  for (const original of [...items].sort((a, b) => compareOriginal(a, b, policy.priority))) {
    const id = original.id
    if (!pending.has(id)) continue
    pending.delete(id)
    const evidence = [...pending.values()].filter(item => couldMatch(original, item, policy)).map(item => compareSimilarity(original, item, policy)).filter(match => match.eligible)
    if (!evidence.length) continue
    const itemIds = [id, ...evidence.map(match => match.ids[1])]
    for (const memberId of itemIds) pending.delete(memberId)
    groups.push({key: `similarity-${id}`, originalId: id, itemIds, similarity: evidence, similarityItems: [original, ...evidence.map(match => byId.get(match.ids[1])!)]})
  }
  return groups
}
