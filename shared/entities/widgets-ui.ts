import type { ParsedExtendedStats, ParsedHomeHealth } from '../schemas/home'

export interface ExtendedStatsByTypeUi {
  mediaTypeId: number
  icon?: string
  count: number
  name?: string
}

export interface ExtendedStatsFileUi {
  id: number
  name?: string
  basename?: string
  filesize?: number
}

export interface ExtendedStatsUi {
  total: number
  byType: ExtendedStatsByTypeUi[]
  averageRating: number
  withTags: number
  rated: number
  favorites: number
  addedLast7Days: number
  addedLast30Days: number
  largestFiles: ExtendedStatsFileUi[]
}

export interface HomeHealthImageThumbsUi {
  total: number
  generated: number
  pending: number
}

export interface HomeHealthGeneratedTypeUi {
  total?: number
  generated?: number
  pending?: number
}

export type HomeHealthQueueItemId =
  | 'visuals'
  | 'fingerprint'
  | 'codec'
  | 'clip'
  | 'faces'
  | 'duplicates'
  | 'missing'
  | 'tagUpscale'

export interface HomeHealthQueueItemUi {
  id: HomeHealthQueueItemId
  severity: 'error' | 'warning' | 'info'
  count: number
  autoFixable: boolean
  settingsSection?: string
}

export interface HomeHealthDataUi {
  score: number
  queue: HomeHealthQueueItemUi[]
  duplicates: {
    byFilesize: number
    byContentHash: number
    byOshash: number
    byFingerprint: number
    byVisualHash: number
  }
  fingerprint: { total: number; pending: number; hashed: number }
  contentHash: { total: number; pending: number; hashed: number }
  oshash: { total: number; pending: number; hashed: number }
  videoCodec: { total: number; pending: number; filled: number }
  generatedImages: { byType: Record<string, HomeHealthGeneratedTypeUi>; totalPending: number }
  imageThumbs: HomeHealthImageThumbsUi
  clip: {
    total: number
    pending: number
    hashed: number
    modelStatus: string
    model: string
  }
  faces: {
    total: number
    pending: number
    generated: number
    faces: number
  }
  database: { id: number | null; name: string | null; bytes: number | null }
  tagImageAiUpscale: {
    done: boolean
    pendingCount: number
    suggested: boolean
    downloadSizeMb: number
  }
}

export function toExtendedStatsUi(data: ParsedExtendedStats): ExtendedStatsUi {
  return {
    total: data.total ?? 0,
    byType: (data.byType ?? []) as ExtendedStatsByTypeUi[],
    averageRating: data.averageRating ?? 0,
    withTags: data.withTags ?? 0,
    rated: data.rated ?? 0,
    favorites: data.favorites ?? 0,
    addedLast7Days: data.addedLast7Days ?? 0,
    addedLast30Days: data.addedLast30Days ?? 0,
    largestFiles: (data.largestFiles ?? []) as ExtendedStatsFileUi[],
  }
}

export function toHomeHealthUi(data: ParsedHomeHealth): HomeHealthDataUi {
  const duplicates = data.duplicates ?? {
    byFilesize: 0,
    byContentHash: 0,
    byOshash: 0,
    byFingerprint: 0,
    byVisualHash: 0,
  }
  return {
    score: typeof data.score === 'number' ? data.score : 100,
    queue: (data.queue ?? []) as HomeHealthQueueItemUi[],
    duplicates: {
      byFilesize: duplicates.byFilesize ?? 0,
      byContentHash: duplicates.byContentHash ?? 0,
      byOshash: duplicates.byOshash ?? 0,
      byFingerprint: duplicates.byFingerprint
        ?? (duplicates.byOshash ?? 0),
      byVisualHash: duplicates.byVisualHash ?? 0,
    },
    fingerprint: data.fingerprint ?? {
      total: data.oshash?.total ?? 0,
      pending: data.oshash?.pending ?? 0,
      hashed: data.oshash?.hashed ?? 0,
    },
    contentHash: data.contentHash ?? { total: 0, pending: 0, hashed: 0 },
    oshash: data.oshash ?? { total: 0, pending: 0, hashed: 0 },
    videoCodec: data.videoCodec ?? { total: 0, pending: 0, filled: 0 },
    generatedImages: {
      byType: (data.generatedImages?.byType ?? {}) as Record<string, HomeHealthGeneratedTypeUi>,
      totalPending: data.generatedImages?.totalPending ?? 0,
    },
    imageThumbs: data.imageThumbs ?? { total: 0, generated: 0, pending: 0 },
    clip: {
      total: data.clip?.total ?? 0,
      pending: data.clip?.pending ?? 0,
      hashed: data.clip?.hashed ?? 0,
      modelStatus: data.clip?.modelStatus ?? '',
      model: data.clip?.model ?? '',
    },
    faces: {
      total: data.faces?.total ?? 0,
      pending: data.faces?.pending ?? 0,
      generated: data.faces?.generated ?? 0,
      faces: data.faces?.faces ?? 0,
    },
    database: data.database ?? { id: null, name: null, bytes: null },
    tagImageAiUpscale: {
      done: data.tagImageAiUpscale?.done ?? true,
      pendingCount: data.tagImageAiUpscale?.pendingCount ?? 0,
      suggested: data.tagImageAiUpscale?.suggested ?? false,
      downloadSizeMb: data.tagImageAiUpscale?.downloadSizeMb ?? 50,
    },
  }
}

export const emptyExtendedStatsUi = (): ExtendedStatsUi => ({
  total: 0,
  byType: [],
  averageRating: 0,
  withTags: 0,
  rated: 0,
  favorites: 0,
  addedLast7Days: 0,
  addedLast30Days: 0,
  largestFiles: [],
})

export const emptyHomeHealthUi = (): HomeHealthDataUi => ({
  score: 100,
  queue: [],
  duplicates: { byFilesize: 0, byContentHash: 0, byOshash: 0, byFingerprint: 0, byVisualHash: 0 },
  fingerprint: { total: 0, pending: 0, hashed: 0 },
  contentHash: { total: 0, pending: 0, hashed: 0 },
  oshash: { total: 0, pending: 0, hashed: 0 },
  videoCodec: { total: 0, pending: 0, filled: 0 },
  generatedImages: { byType: {}, totalPending: 0 },
  imageThumbs: { total: 0, generated: 0, pending: 0 },
  clip: { total: 0, pending: 0, hashed: 0, modelStatus: '', model: '' },
  faces: { total: 0, pending: 0, generated: 0, faces: 0 },
  database: { id: null, name: null, bytes: null },
  tagImageAiUpscale: { done: true, pendingCount: 0, suggested: false, downloadSizeMb: 50 },
})
