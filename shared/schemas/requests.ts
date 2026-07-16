import { z } from 'zod'
import { FilterObjectSchema } from './entities'
import {
  optionalCoercedBooleanSchema,
  optionalCoercedNumberSchema,
  optionalNullableCoercedNumberSchema,
} from './coercion'

const optionalCoercedBoolean = optionalCoercedBooleanSchema
const optionalCoercedNumber = optionalCoercedNumberSchema

export const ItemsListRequestSchema = z.object({
  metaId: optionalCoercedNumber,
  mediaTypeId: optionalCoercedNumber,
  filters: z.array(FilterObjectSchema).optional(),
  sortBy: z.string().optional(),
  direction: z.string().optional(),
  find_duplicates: optionalCoercedBoolean,
  duplicates_by: z.string().optional(),
  ids: z.array(z.union([z.number(), z.string()])).optional(),
  includeNavigation: optionalCoercedBoolean,
  page: optionalCoercedNumber,
  limit: optionalCoercedNumber,
  skipTotals: optionalCoercedBoolean,
}).passthrough()

export const MediaIdsRequestSchema = z.object({
  metaId: optionalCoercedNumber,
  mediaTypeId: optionalNullableCoercedNumberSchema,
  filters: z.array(FilterObjectSchema).optional(),
  sortBy: z.string().optional(),
  direction: z.string().optional(),
  find_duplicates: optionalCoercedBoolean,
  duplicates_by: z.string().optional(),
}).passthrough()

export const MediaBasicsRequestSchema = z.object({
  ids: z.array(z.union([z.number(), z.string()])).optional(),
}).passthrough()

export const MediaThumbsRequestSchema = z.object({
  ids: z.array(z.union([z.number(), z.string()])).optional(),
  mediaType: z.string().optional(),
}).passthrough()

export const TagThumbsRequestSchema = z.object({
  metaId: z.union([z.number(), z.string()]),
  ids: z.array(z.union([z.number(), z.string()])).optional(),
  types: z.array(z.string()).optional(),
}).passthrough()

export const SceneSearchRequestSchema = z.object({
  query: z.string().trim().min(1),
  limit: optionalCoercedNumber,
}).passthrough()

export const SceneMatchRequestSchema = z.object({
  mediaId: z.union([z.number(), z.string()]),
  query: z.string().trim().optional(),
  limit: optionalCoercedNumber,
}).passthrough()

export const SceneMarkersRequestSchema = z.object({
  sceneId: z.string().trim().min(1),
}).passthrough()

export const SceneMarkersApplyRequestSchema = z.object({
  sceneId: z.string().trim().min(1),
  mediaId: z.union([z.number(), z.string()]),
  merge: z.enum(['merge', 'replace']).optional(),
  markerMetaId: z.union([z.number(), z.string()]).nullable().optional(),
}).passthrough()

export const MediaPathUpdateRequestSchema = z.object({
  id: z.union([z.number(), z.string()]),
  path: z.string().min(1),
  ids: z.array(z.union([z.number(), z.string()])).optional(),
}).passthrough()

export const DeleteEntityOneRequestSchema = z.object({
  id: z.union([z.number(), z.string()]),
  metaId: z.union([z.number(), z.string()]).nullable().optional(),
  with_file: z.boolean().optional(),
  path: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
}).passthrough()

export const BulkMetaApplyRequestSchema = z.object({
  itemType: z.enum(['media', 'tag']),
  itemIds: z.array(z.union([z.number(), z.string()])).min(1),
  changes: z.array(z.object({
    editType: z.union([z.number(), z.string()]).optional(),
    metaId: z.union([z.number(), z.string()]).optional(),
    metaType: z.string().optional(),
    value: z.unknown().optional(),
  }).passthrough()).optional().default([]),
  presetChanges: z.array(z.object({
    editType: z.union([z.number(), z.string()]).optional(),
    field: z.string().optional(),
    value: z.unknown().optional(),
  }).passthrough()).optional().default([]),
})

export const GlobalSearchRequestSchema = z.object({
  q: z.string().optional(),
  query: z.string().optional(),
  limit: z.union([z.number(), z.string()]).optional(),
}).passthrough()

export const PathPayloadSchema = z.object({
  path: z.string().min(1),
})

export const CheckFilesPayloadSchema = z.object({
  paths: z.array(z.string().min(1)).min(1).max(100),
})

export const AddMediaRequestSchema = z.object({
  path: z.string().min(1),
  type: z.union([z.string(), z.number(), z.record(z.unknown())]).optional(),
  is_check_duplicates: z.boolean().optional(),
}).passthrough()

export const ParsePathTagsRequestSchema = z.object({
  paths: z.array(z.object({
    path: z.string().optional(),
    mediaId: z.number(),
  }).passthrough()).optional().default([]),
  settings: z.record(z.unknown()).optional(),
}).passthrough()

export const ApplyParseLibraryTagsRequestSchema = z.object({
  assignments: z.array(z.object({
    mediaId: z.number(),
    tagId: z.number(),
    metaId: z.number(),
  })).optional().default([]),
}).passthrough()

export const AuthLoginRequestSchema = z.object({
  password: z.string().optional(),
})

export const RenameFileRequestSchema = z.object({
  old_path: z.string().min(1),
  new_path: z.string().min(1),
})

export const OpenPathRequestSchema = z.object({
  path: z.string().min(1),
  isDir: z.boolean().optional(),
})

export const GetFileListRequestSchema = z.object({
  path: z.string().min(1),
  filter: z.string().min(1),
  excluded: z.array(z.string()).optional(),
})

export const UpdateMediaInfoRequestSchema = z.object({
  id: z.union([z.number(), z.string()]),
})

export const SearchMediaByPathRequestSchema = z.object({
  query: z.string().optional(),
  path: z.string().optional(),
  mediaTypeId: z.coerce.number().optional(),
}).passthrough()

export const UpdateMediaMultipleRequestSchema = z.object({
  mediaFiles: z.array(z.object({
    id: z.union([z.number(), z.string()]),
  }).passthrough()).min(1),
}).passthrough()

export const DatabaseSizesRequestSchema = z.object({
  ids: z.array(z.union([z.string(), z.number()])).min(1),
})

export const DeleteDbRequestSchema = z.object({
  id: z.string().min(1),
})

export const FolderSizeRequestSchema = z.object({
  folder: z.string().min(1),
})

export const ClearDataRequestSchema = z.object({
  imageType: z.string().min(1),
})

export const CreateThumbRequestSchema = z.object({
  timestamp: z.coerce.number(),
  inputPath: z.string().min(1),
  outputPath: z.string().min(1),
  width: z.coerce.number(),
  overwrite: z.boolean().optional(),
}).passthrough()

export const CreateImageRequestSchema = z.object({
  image: z.string().min(1),
  outputPath: z.string().min(1),
  url: z.string().nullable().optional(),
  sizes: z.unknown(),
}).passthrough()

export const CreateMarkThumbRequestSchema = z.object({
  markId: z.coerce.number(),
  inputPath: z.string().optional(),
  outputPath: z.string().optional(),
  mediaId: z.coerce.number().optional(),
  overwrite: z.boolean().optional(),
}).passthrough()

export const VideoPreviewTaskRequestSchema = z.object({
  id: z.coerce.number().optional(),
  path: z.string().optional(),
  input: z.string().optional(),
  output: z.string().optional(),
  inputPath: z.string().optional(),
  outputPath: z.string().optional(),
  width: z.coerce.number().optional(),
  cols: z.coerce.number().optional(),
  rows: z.coerce.number().optional(),
  timestamp: z.coerce.number().optional(),
  seekRatio: z.coerce.number().min(0).max(1).optional(),
  overwrite: z.boolean().optional(),
}).passthrough()

export const SuggestTagsPathEntrySchema = z.union([
  z.string(),
  z.object({
    path: z.string().optional(),
    mediaId: z.coerce.number().optional(),
  }).passthrough(),
])

export const SuggestTagsRequestSchema = z.object({
  paths: z.array(SuggestTagsPathEntrySchema).optional(),
  limit: z.coerce.number().optional(),
  maxWords: z.coerce.number().optional(),
  excludeExisting: optionalCoercedBoolean,
  settings: z.record(z.unknown()).optional(),
  mediaTypeId: z.coerce.number().optional(),
  mediaLimit: z.coerce.number().optional(),
  locale: z.string().optional(),
}).passthrough()

export const BackupNameRequestSchema = z.object({
  name: z.string().optional(),
  path: z.string().optional(),
}).passthrough()

export const HomeMediaQuerySchema = z.object({
  continueLimit: optionalCoercedNumber,
  favoritesLimit: optionalCoercedNumber,
  topViewsLimit: optionalCoercedNumber,
  limit: optionalCoercedNumber,
}).passthrough()

export const HomeMarkersQuerySchema = z.object({
  limit: optionalCoercedNumber,
}).passthrough()

export const MarkClipsRequestSchema = z.object({
  tagId: z.coerce.number(),
  sort: z.enum(['time', 'shuffle']).optional(),
  countOnly: optionalCoercedBoolean,
}).passthrough()

export const MediaTagCountQuerySchema = z.object({
  mediaTypeId: z.coerce.number(),
  tagId: z.coerce.number(),
})

export type ParsedItemsListRequest = z.infer<typeof ItemsListRequestSchema>
export type ParsedBulkMetaApplyRequest = z.infer<typeof BulkMetaApplyRequestSchema>
export type ParsedGlobalSearchRequest = z.infer<typeof GlobalSearchRequestSchema>
export type ParsedPathPayload = z.infer<typeof PathPayloadSchema>
export type ParsedAddMediaRequest = z.infer<typeof AddMediaRequestSchema>
export type ParsedParsePathTagsRequest = z.infer<typeof ParsePathTagsRequestSchema>
export type ParsedApplyParseLibraryTagsRequest = z.infer<typeof ApplyParseLibraryTagsRequestSchema>
