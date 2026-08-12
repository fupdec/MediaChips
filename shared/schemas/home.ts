import { z } from 'zod'
import { MediaItemSchema, TagSchema } from './entities'

export const HomeMediaStatsSchema = z.object({
  total: z.number(),
  filesize: z.number(),
}).passthrough()

export const HomeTagCountSchema = z.object({
  count: z.number(),
}).passthrough()

export const ExtendedStatsByTypeSchema = z.object({
  mediaTypeId: z.number(),
  icon: z.string().optional(),
  count: z.number(),
  name: z.string().optional(),
})

export const ExtendedStatsFileSchema = z.object({
  id: z.number(),
  name: z.string().optional(),
  basename: z.string().optional(),
  filesize: z.number().optional(),
})

export const ExtendedStatsSchema = z.object({
  total: z.number().optional(),
  byType: z.array(ExtendedStatsByTypeSchema).optional(),
  averageRating: z.number().optional(),
  withTags: z.number().optional(),
  rated: z.number().optional(),
  favorites: z.number().optional(),
  addedLast7Days: z.number().optional(),
  addedLast30Days: z.number().optional(),
  largestFiles: z.array(ExtendedStatsFileSchema).optional(),
}).passthrough()

export const ChartActivitySeriesSchema = z.object({
  added: z.array(z.number()),
  viewed: z.array(z.number()),
  edited: z.array(z.number()),
})

export const ChartStatsSchema = z.object({
  days: z.array(z.string()),
  period: z.number(),
  granularity: z.enum(['day', 'week', 'month']),
  mediaTotal: z.number(),
  tagsTotal: z.number(),
  media: ChartActivitySeriesSchema,
  tags: ChartActivitySeriesSchema,
}).passthrough()

export const CreatedCalendarDayCountSchema = z.object({
  day: z.string(),
  count: z.number(),
})

export const CreatedCalendarMonthSchema = z.object({
  year: z.number(),
  month: z.number(),
  days: z.array(CreatedCalendarDayCountSchema),
  totalInMonth: z.number(),
  totalWithDate: z.number(),
  totalMissingDate: z.number(),
}).passthrough()

export const HealthQueueItemIdSchema = z.enum([
  'visuals',
  'fingerprint',
  'codec',
  'clip',
  'faces',
  'duplicates',
  'missing',
  'tagUpscale',
])

export const HealthQueueItemSchema = z.object({
  id: HealthQueueItemIdSchema,
  severity: z.enum(['error', 'warning', 'info']),
  count: z.number(),
  autoFixable: z.boolean(),
  settingsSection: z.string().optional(),
})

export const HomeHealthSchema = z.object({
  score: z.number().optional(),
  queue: z.array(HealthQueueItemSchema).optional(),
  duplicates: z.object({
    byFilesize: z.number(),
    byContentHash: z.number(),
    byOshash: z.number().optional(),
    byFingerprint: z.number().optional(),
    byVisualHash: z.number().optional(),
  }).optional(),
  fingerprint: z.object({
    total: z.number(),
    pending: z.number(),
    hashed: z.number(),
    byKind: z.object({
      oshash: z.object({
        total: z.number(),
        pending: z.number(),
        hashed: z.number(),
      }),
      contentHash: z.object({
        total: z.number(),
        pending: z.number(),
        hashed: z.number(),
      }),
    }).optional(),
  }).optional(),
  contentHash: z.object({
    total: z.number(),
    pending: z.number(),
    hashed: z.number(),
  }).optional(),
  oshash: z.object({
    total: z.number(),
    pending: z.number(),
    hashed: z.number(),
  }).optional(),
  videoCodec: z.object({
    total: z.number(),
    pending: z.number(),
    filled: z.number(),
  }).optional(),
  generatedImages: z.object({
    byType: z.record(z.string(), z.unknown()),
    totalPending: z.number(),
  }).optional(),
  imageThumbs: z.object({
    total: z.number(),
    generated: z.number(),
    pending: z.number(),
  }).optional(),
  clip: z.object({
    total: z.number(),
    pending: z.number(),
    hashed: z.number(),
    modelStatus: z.string().optional(),
    model: z.string().optional(),
  }).optional(),
  faces: z.object({
    total: z.number(),
    pending: z.number(),
    generated: z.number(),
    faces: z.number().optional(),
  }).optional(),
  database: z.object({
    id: z.number().nullable(),
    name: z.string().nullable(),
    bytes: z.number().nullable(),
  }).optional(),
  tagImageAiUpscale: z.object({
    done: z.boolean(),
    pendingCount: z.number().optional(),
    suggested: z.boolean(),
    downloadSizeMb: z.number().optional(),
  }).optional(),
}).passthrough()

export const HomeHealthLiteSchema = z.object({
  fingerprint: z.object({
    total: z.number(),
    pending: z.number(),
    hashed: z.number(),
  }).optional(),
  contentHash: z.object({
    total: z.number(),
    pending: z.number(),
    hashed: z.number(),
  }).optional(),
  oshash: z.object({
    total: z.number(),
    pending: z.number(),
    hashed: z.number(),
  }).optional(),
  videoCodec: z.object({
    total: z.number(),
    pending: z.number(),
    filled: z.number(),
  }).optional(),
  tagImageAiUpscale: z.object({
    done: z.boolean(),
    pendingCount: z.number().optional(),
    suggested: z.boolean(),
    downloadSizeMb: z.number().optional(),
  }).optional(),
}).passthrough()

export type ParsedHomeHealthLite = z.infer<typeof HomeHealthLiteSchema>

export const HomeMarkersSchema = z.object({
  marks: z.array(z.object({ id: z.number() }).passthrough()).optional(),
}).passthrough()

export const HomeMediaResponseSchema = z.object({
  continueWatching: z.array(MediaItemSchema).optional(),
  favorites: z.array(MediaItemSchema).optional(),
  topViews: z.array(MediaItemSchema).optional(),
  inbox: z.array(MediaItemSchema).optional(),
  items: z.array(MediaItemSchema).optional(),
}).passthrough()

export const HomeSimilarSeedSchema = z.object({
  id: z.number(),
  name: z.string().nullable().optional(),
  basename: z.string().nullable().optional(),
  path: z.string().nullable().optional(),
  mediaTypeId: z.number().nullable().optional(),
  reason: z.enum(['viewed', 'favorite', 'any']).optional(),
}).passthrough()

/** Per-signal raw scores (clip cosine / tag Jaccard) when known. */
export const MediaSimilaritySignalsSchema = z.object({
  clip: z.number().optional(),
  tags: z.number().optional(),
}).passthrough()

/** Fused similarity payload attached to Home Similar neighbors. */
export const MediaSimilaritySchema = z.object({
  score: z.number().optional(),
  signals: MediaSimilaritySignalsSchema.optional(),
}).passthrough()

export const HomeSimilarMediaItemSchema = MediaItemSchema.extend({
  isSeed: z.boolean().optional(),
  similarity: MediaSimilaritySchema.optional(),
})

export const HomeSimilarResponseSchema = z.object({
  seed: HomeSimilarSeedSchema.nullable(),
  seedItem: HomeSimilarMediaItemSchema.nullable().optional(),
  items: z.array(HomeSimilarMediaItemSchema),
}).passthrough()

export const MissingMediaStatusSchema = z.object({
  total: z.number().optional(),
  missing: z.number().optional(),
  present: z.number().optional(),
}).passthrough()

export const MediaThumbsResponseSchema = z.object({
  thumbs: z.record(z.union([z.string(), z.number()]), z.unknown()).optional(),
}).passthrough()

export const TagThumbsResponseSchema = z.object({
  thumbs: z.record(
    z.union([z.string(), z.number()]),
    z.record(z.string(), z.string()),
  ).optional(),
}).passthrough()

export const SuggestTagsResponseSchema = z.object({
  suggestions: z.array(z.object({ word: z.string().optional() }).passthrough()).optional(),
}).passthrough()

/** Sequelize `query()` returns `[rows, metadata]`. */
export const SqlQueryMediaResultSchema = z.tuple([
  z.array(MediaItemSchema),
  z.unknown(),
])

export const SqlQueryTagResultSchema = z.tuple([
  z.array(TagSchema),
  z.unknown(),
])

export const GlobalSearchMediaItemSchema = z.object({
  id: z.number(),
  name: z.string().nullable().optional(),
  mediaTypeId: z.number().optional(),
  path: z.string().optional(),
  width: z.number().nullable().optional(),
  height: z.number().nullable().optional(),
  matchSource: z.enum(['name', 'tag', 'bookmark', 'both']).optional(),
  matchedBookmark: z.string().optional(),
  matchedTags: z.array(z.object({
    id: z.number(),
    name: z.string(),
    metaId: z.number().nullable().optional(),
    matchSource: z.enum(['name', 'synonym', 'bookmark', 'both']).optional(),
    matchedSynonyms: z.array(z.string()).optional(),
    matchedBookmark: z.string().optional(),
  })).optional(),
})

export const GlobalSearchTagItemSchema = z.object({
  id: z.number(),
  name: z.string().nullable().optional(),
  metaId: z.number().nullable().optional(),
  synonyms: z.string().nullable().optional(),
  matchSource: z.enum(['name', 'synonym', 'bookmark', 'both']).optional(),
  matchedSynonyms: z.array(z.string()).optional(),
  matchedBookmark: z.string().optional(),
})

export const GlobalSearchMediaResponseSchema = z.object({
  items: z.array(GlobalSearchMediaItemSchema),
})

export const GlobalSearchTagsResponseSchema = z.object({
  items: z.array(GlobalSearchTagItemSchema),
})

export const GlobalSearchResponseSchema = z.object({
  media: z.array(GlobalSearchMediaItemSchema),
  tags: z.array(GlobalSearchTagItemSchema),
})

export type ParsedHomeMediaStats = z.infer<typeof HomeMediaStatsSchema>
export type ParsedHomeTagCount = z.infer<typeof HomeTagCountSchema>
export type ParsedExtendedStatsByType = z.infer<typeof ExtendedStatsByTypeSchema>
export type ParsedExtendedStatsFile = z.infer<typeof ExtendedStatsFileSchema>
export type ParsedExtendedStats = z.infer<typeof ExtendedStatsSchema>
export type ParsedChartStats = z.infer<typeof ChartStatsSchema>
export type ParsedChartActivitySeries = z.infer<typeof ChartActivitySeriesSchema>
export type ParsedCreatedCalendarMonth = z.infer<typeof CreatedCalendarMonthSchema>
export type ParsedHomeHealth = z.infer<typeof HomeHealthSchema>
export type HealthQueueItem = NonNullable<ParsedHomeHealth['queue']>[number]
export type HealthQueueItemId = z.infer<typeof HealthQueueItemIdSchema>
export type ParsedHomeMarkers = z.infer<typeof HomeMarkersSchema>
export type ParsedHomeMediaResponse = z.infer<typeof HomeMediaResponseSchema>
export type ParsedHomeSimilarResponse = z.infer<typeof HomeSimilarResponseSchema>
export type ParsedHomeSimilarMediaItem = z.infer<typeof HomeSimilarMediaItemSchema>
export type ParsedMediaSimilarity = z.infer<typeof MediaSimilaritySchema>
