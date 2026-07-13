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

export interface HomeHealthDataUi {
  duplicates: { byFilesize: number; byContentHash: number }
  contentHash: { total: number; pending: number; hashed: number }
  oshash: { total: number; pending: number; hashed: number }
  videoCodec: { total: number; pending: number; filled: number }
  generatedImages: { byType: Record<string, HomeHealthGeneratedTypeUi>; totalPending: number }
  imageThumbs: HomeHealthImageThumbsUi
  database: { id: number | null; name: string | null; bytes: number | null }
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
  return {
    duplicates: data.duplicates ?? { byFilesize: 0, byContentHash: 0 },
    contentHash: data.contentHash ?? { total: 0, pending: 0, hashed: 0 },
    oshash: data.oshash ?? { total: 0, pending: 0, hashed: 0 },
    videoCodec: data.videoCodec ?? { total: 0, pending: 0, filled: 0 },
    generatedImages: {
      byType: (data.generatedImages?.byType ?? {}) as Record<string, HomeHealthGeneratedTypeUi>,
      totalPending: data.generatedImages?.totalPending ?? 0,
    },
    imageThumbs: data.imageThumbs ?? { total: 0, generated: 0, pending: 0 },
    database: data.database ?? { id: null, name: null, bytes: null },
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
  duplicates: { byFilesize: 0, byContentHash: 0 },
  contentHash: { total: 0, pending: 0, hashed: 0 },
  oshash: { total: 0, pending: 0, hashed: 0 },
  videoCodec: { total: 0, pending: 0, filled: 0 },
  generatedImages: { byType: {}, totalPending: 0 },
  imageThumbs: { total: 0, generated: 0, pending: 0 },
  database: { id: null, name: null, bytes: null },
})
