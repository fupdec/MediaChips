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

export const HomeHealthSchema = z.object({
  duplicates: z.object({
    byFilesize: z.number(),
    byContentHash: z.number(),
    byOshash: z.number().optional(),
    byFingerprint: z.number().optional(),
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
  database: z.object({
    id: z.number().nullable(),
    name: z.string().nullable(),
    bytes: z.number().nullable(),
  }).optional(),
}).passthrough()

export const HomeMarkersSchema = z.object({
  marks: z.array(z.object({ id: z.number() }).passthrough()).optional(),
}).passthrough()

export const HomeMediaResponseSchema = z.object({
  continueWatching: z.array(MediaItemSchema).optional(),
  favorites: z.array(MediaItemSchema).optional(),
  topViews: z.array(MediaItemSchema).optional(),
  items: z.array(MediaItemSchema).optional(),
}).passthrough()

export const MissingMediaStatusSchema = z.object({
  missing: z.number().optional(),
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
})

export const GlobalSearchTagItemSchema = z.object({
  id: z.number(),
  name: z.string().nullable().optional(),
  metaId: z.number().nullable().optional(),
  synonyms: z.string().nullable().optional(),
  matchSource: z.enum(['name', 'synonym', 'both']).optional(),
  matchedSynonyms: z.array(z.string()).optional(),
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
export type ParsedHomeHealth = z.infer<typeof HomeHealthSchema>
export type ParsedHomeMarkers = z.infer<typeof HomeMarkersSchema>
export type ParsedHomeMediaResponse = z.infer<typeof HomeMediaResponseSchema>
