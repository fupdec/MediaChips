/**
 * Fixed evidence levels instead of tunable weights:
 * - exact: same byte size and oshash (beginning and end of the file). The only level merged automatically.
 * - version: preview frames match while the files differ (re-encode, compression, resolution). Manual review only.
 * - pending: large files of exactly the same size whose fingerprint is not known yet. Never merged; the
 *   background fingerprint job resolves the pair into exact or none.
 * Name, path and size are shown as context but never make a pair mergeable.
 */
export const DUPLICATE_POLICY_SETTING = 'duplicateSimilarityPolicy'
export const SIMILARITY_SIGNALS = ['path', 'name', 'size', 'oshash', 'visual'] as const
export type SimilaritySignal = typeof SIMILARITY_SIGNALS[number]
export type SimilarityLevel = 'exact' | 'version' | 'pending' | 'none'
export type OriginalPriority = 'quality' | 'largest' | 'smallest' | 'oldest' | 'newest'
export type DuplicateFileAction = 'keep' | 'delete'
export const VISUAL_STRICTNESS = {
  strict: {visualMinimum: 94, minimumFrames: 8},
  balanced: {visualMinimum: 90, minimumFrames: 7},
  loose: {visualMinimum: 85, minimumFrames: 6},
} as const
export type VisualStrictness = keyof typeof VISUAL_STRICTNESS
export type DuplicatePolicy = {
  /** Also find other versions of a video by preview frames. */
  searchSimilarVideos: boolean
  visualStrictness: VisualStrictness
  priority: OriginalPriority
  files: DuplicateFileAction
  /** Merge exact copies when a search starts or a card is added. Versions always need review. */
  autoMerge: boolean
  /**
   * Exact byte size at or above this many bytes makes a pair a fingerprint candidate: missing
   * oshash values are computed first. Size never makes a pair eligible on its own. 0 disables.
   */
  sizeCandidateMinBytes: number
}
export const DEFAULT_SIZE_CANDIDATE_MIN_BYTES = 512 * 1024 * 1024
export const defaultDuplicatePolicy = (): DuplicatePolicy => ({
  searchSimilarVideos: true, visualStrictness: 'balanced', priority: 'quality', files: 'keep', autoMerge: false,
  sizeCandidateMinBytes: DEFAULT_SIZE_CANDIDATE_MIN_BYTES,
})
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
/** Reads the current shape and the earlier weighted policy (weights/threshold/visualMinimum). */
export function parseDuplicatePolicy(raw: unknown): DuplicatePolicy {
  const fallback = defaultDuplicatePolicy()
  try {
    const value: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!isRecord(value)) return fallback
    const weights = isRecord(value.weights) ? value.weights : null
    const legacyMinimum = typeof value.visualMinimum === 'number' ? value.visualMinimum : null
    const visualStrictness: VisualStrictness = typeof value.visualStrictness === 'string' && value.visualStrictness in VISUAL_STRICTNESS
      ? value.visualStrictness as VisualStrictness
      : legacyMinimum == null ? fallback.visualStrictness : legacyMinimum >= 93 ? 'strict' : legacyMinimum <= 86 ? 'loose' : 'balanced'
    const searchSimilarVideos = typeof value.searchSimilarVideos === 'boolean' ? value.searchSimilarVideos
      : weights ? Number(weights.visual) > 0 : fallback.searchSimilarVideos
    const priority = typeof value.priority === 'string' && ['quality', 'largest', 'smallest', 'oldest', 'newest'].includes(value.priority)
      ? value.priority as OriginalPriority : fallback.priority
    const files: DuplicateFileAction = value.files === 'delete' ? 'delete' : 'keep'
    const size = value.sizeCandidateMinBytes
    return {
      searchSimilarVideos, visualStrictness, priority, files,
      autoMerge: value.autoMerge === true && files === 'keep',
      sizeCandidateMinBytes: typeof size === 'number' && Number.isFinite(size) ? Math.max(0, Math.round(size)) : DEFAULT_SIZE_CANDIDATE_MIN_BYTES,
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
  level: SimilarityLevel
  /** 100 for an exact copy, frame similarity for a version, 0 otherwise. Not a probability. */
  score: number
  /** Per-signal comparison for display: 100 match, 0 differs, null not available. Visual is a percentage. */
  signals: Record<SimilaritySignal, number | null>
  matchingFrames: number
  /** Exact copies, and versions while frame search is on. */
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
export function compareSimilarity(a: SimilarityItem, b: SimilarityItem, policy: DuplicatePolicy): SimilarityEvidence {
  const {visualMinimum, minimumFrames} = VISUAL_STRICTNESS[policy.visualStrictness]
  const grid = hashSimilarity(a.visualHash, b.visualHash)
  const tilesA = (a.visualHashTiles || '').split(':')
  const tilesB = (b.visualHashTiles || '').split(':')
  const frames = Array.from({length: 9}, (_, i) => hashSimilarity(tilesA[i], tilesB[i]))
  const availableFrames = frames.filter((value): value is number => value != null)
  const matchingFrames = availableFrames.filter(value => value >= visualMinimum).length
  // A single matching thumbnail cannot establish similarity for an entire video.
  const framesMatch = availableFrames.length === 9 && matchingFrames >= minimumFrames
  const tileScore = framesMatch ? availableFrames.reduce((sum, value) => sum + value, 0) / 9 : null
  const visual = grid == null && tileScore == null ? null : Math.max(grid ?? 0, tileScore ?? 0)
  const sizeA = Number(a.filesize) || 0, sizeB = Number(b.filesize) || 0
  const signals: SimilarityEvidence['signals'] = {
    path: a.path && b.path ? Number(a.path === b.path) * 100 : null,
    name: filename(a) && filename(b) ? Number(filename(a) === filename(b)) * 100 : null,
    size: sizeA > 0 && sizeB > 0 ? Number(sizeA === sizeB) * 100 : null,
    oshash: a.oshash && b.oshash ? Number(a.oshash === b.oshash && sizeA === sizeB) * 100 : null,
    visual,
  }
  const differentTypes = a.mediaTypeId != null && b.mediaTypeId != null && a.mediaTypeId !== b.mediaTypeId
  const versionMatch = policy.searchSimilarVideos && ((grid != null && grid >= visualMinimum) || framesMatch)
  const pending = policy.sizeCandidateMinBytes > 0 && signals.size === 100 && sizeA >= policy.sizeCandidateMinBytes
    && signals.oshash == null
  const level: SimilarityLevel = differentTypes ? 'none'
    : signals.oshash === 100 ? 'exact'
    : versionMatch ? 'version'
    : pending ? 'pending' : 'none'
  return {
    ids: [a.id, b.id], level, matchingFrames, signals,
    score: level === 'exact' ? 100 : level === 'version' ? Math.round((visual ?? 0) * 10) / 10 : 0,
    eligible: level === 'exact' || level === 'version',
  }
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
  return Boolean(a.oshash && a.oshash === b.oshash && a.filesize === b.filesize)
    || (policy.searchSimilarVideos && Boolean(a.visualHash && b.visualHash || a.visualHashTiles && b.visualHashTiles))
}
export type SimilarityGroupingProgress = {done: number; total: number}

/** One original per step; the step reports how many items were consumed (compared or grouped) so far. */
function* similarityGrouping(items: SimilarityItem[], policy: DuplicatePolicy) {
  const pending = new Map(items.map(item => [item.id, item]))
  const groups: Array<{key: string; itemIds: number[]; originalId: number; similarity: SimilarityEvidence[]; similarityItems: SimilarityItem[]}> = []
  const byId = new Map(pending)
  for (const original of [...items].sort((a, b) => compareOriginal(a, b, policy.priority))) {
    const id = original.id
    if (!pending.has(id)) continue
    pending.delete(id)
    const evidence = [...pending.values()].filter(item => couldMatch(original, item, policy)).map(item => compareSimilarity(original, item, policy)).filter(match => match.eligible)
    if (evidence.length) {
      const itemIds = [id, ...evidence.map(match => match.ids[1])]
      for (const memberId of itemIds) pending.delete(memberId)
      groups.push({key: `similarity-${id}`, originalId: id, itemIds, similarity: evidence, similarityItems: [original, ...evidence.map(match => byId.get(match.ids[1])!)]})
    }
    yield {done: items.length - pending.size, total: items.length}
  }
  return groups
}

/** Every member passes against its selected original. No transitive similarity chains. */
export function groupSimilarityItems(items: SimilarityItem[], policy: DuplicatePolicy) {
  const steps = similarityGrouping(items, policy)
  let step = steps.next()
  while (!step.done) step = steps.next()
  return step.value
}

/** Same result, but gives the event loop back regularly so progress can be read and the search cancelled. */
export async function groupSimilarityItemsAsync(items: SimilarityItem[], policy: DuplicatePolicy, options: {
  onProgress?: (progress: SimilarityGroupingProgress) => void
  signal?: AbortSignal
  /** Longest stretch of synchronous work before yielding. */
  sliceMs?: number
} = {}) {
  const sliceMs = options.sliceMs ?? 40
  const steps = similarityGrouping(items, policy)
  let sliceStart = Date.now()
  let step = steps.next()
  while (!step.done) {
    options.onProgress?.(step.value)
    if (Date.now() - sliceStart >= sliceMs) {
      await new Promise<void>(resolve => setImmediate(resolve))
      options.signal?.throwIfAborted()
      sliceStart = Date.now()
    }
    step = steps.next()
  }
  options.onProgress?.({done: items.length, total: items.length})
  return step.value
}
