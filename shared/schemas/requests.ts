import { z } from 'zod'
import { FilterObjectSchema, MetaSchema } from './entities'
import { MetaSettingSchema } from './media-meta'
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
  groupBy: z.string().optional(),
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

export const MediaSimilarByVisualRequestSchema = z.object({
  seedId: z.coerce.number().int().positive(),
  limit: z.coerce.number().int().positive().max(200).optional(),
}).passthrough()

export const MediaSuggestTagsFromSimilarRequestSchema = z.object({
  mediaIds: z.array(z.coerce.number().int().positive()).min(1).max(200).optional(),
  seedId: z.coerce.number().int().positive().optional(),
  neighborLimit: z.coerce.number().int().positive().max(80).optional(),
  tagLimit: z.coerce.number().int().positive().max(40).optional(),
  minCount: z.coerce.number().int().positive().max(20).optional(),
  apply: z.boolean().optional(),
}).passthrough()

export const MediaSemanticSearchRequestSchema = z.object({
  query: z.string().trim().min(1),
  mediaTypeId: z.union([z.number(), z.string()]).optional().nullable(),
  limit: z.coerce.number().int().positive().max(1000).optional(),
  locale: z.string().trim().min(1).max(16).optional().nullable(),
}).passthrough()

export const MediaSimilarByClipRequestSchema = z.object({
  seedId: z.coerce.number().int().positive(),
  limit: z.coerce.number().int().positive().max(1000).optional(),
}).passthrough()

export const MediaDuplicateGroupsRequestSchema = z.object({
  duplicates_by: z.string().trim().min(1).optional(),
  mediaTypeId: z.union([z.number(), z.string()]).optional().nullable(),
})

export const MediaThumbsRequestSchema = z.object({
  ids: z.array(z.union([z.number(), z.string()])).optional(),
  mediaType: z.string().optional(),
}).passthrough()

export const TagThumbsRequestSchema = z.object({
  metaId: z.union([z.number(), z.string()]),
  ids: z.array(z.union([z.number(), z.string()])).optional(),
  types: z.array(z.string()).optional(),
}).passthrough()

export const MergeTagsRequestSchema = z.object({
  metaId: z.union([z.number(), z.string()]),
  survivorId: z.union([z.number(), z.string()]),
  sourceIds: z.array(z.union([z.number(), z.string()])).min(1),
})

export const MergeMediaRequestSchema = z.object({
  survivorId: z.union([z.number(), z.string()]),
  sourceIds: z.array(z.union([z.number(), z.string()])).min(1),
  with_file: z.boolean().optional(),
})

export const MoveTagsToCategoryRequestSchema = z.object({
  tagIds: z.array(z.union([z.number(), z.string()])).min(1),
  targetMetaId: z.union([z.number(), z.string()]),
  onConflict: z.enum(['merge', 'abort']),
})

export const MergeCategoriesRequestSchema = z.object({
  survivorId: z.union([z.number(), z.string()]),
  sourceIds: z.array(z.union([z.number(), z.string()])).min(1),
})

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

export const CamGirlFinderSearchRequestSchema = z.object({
  mode: z.enum(['face', 'name']).optional(),
  query: z.string().trim().optional(),
  cropPath: z.string().trim().optional(),
  imageUrl: z.string().trim().optional(),
  platform: z.string().trim().optional(),
  gender: z.string().trim().optional(),
  includeSimilar: z.boolean().optional(),
  limit: optionalCoercedNumber,
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
  delete_zip_gallery: z.boolean().optional(),
  delete_zip_file: z.boolean().optional(),
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
  metaId: z.union([z.number(), z.string()]).optional(),
  tagIds: z.array(z.union([z.number(), z.string()])).optional(),
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
    metaId: z.number(),
    tagId: z.number().optional(),
    tagName: z.string().optional(),
    willCreate: z.boolean().optional(),
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

export const OpenInExternalPlayerRequestSchema = z.object({
  path: z.string().min(1),
  player: z.enum(['mpv', 'iina']),
  mediaId: z.union([z.number(), z.string()]).optional(),
})

export const GetFileListRequestSchema = z.object({
  path: z.string().min(1),
  filter: z.string().min(1),
  excluded: z.array(z.string()).optional(),
  expandZips: z.boolean().optional(),
  extensions: z.array(z.string()).optional(),
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
  sizes: z.unknown().optional(),
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

export const ImportFromStashRequestSchema = z.object({
  path: z.string().min(1),
  createMissingMedia: optionalCoercedBoolean,
}).passthrough()

export const ListJellyfinLibrariesRequestSchema = z.object({
  baseUrl: z.string().min(1),
  apiKey: z.string().min(1),
}).passthrough()

export const ImportFromJellyfinRequestSchema = z.object({
  baseUrl: z.string().min(1),
  apiKey: z.string().min(1),
  libraryIds: z.array(z.union([z.string(), z.number()])).optional(),
  createMissingMedia: optionalCoercedBoolean,
}).passthrough()

export const ListPlexLibrariesRequestSchema = z.object({
  baseUrl: z.string().min(1),
  token: z.string().min(1),
}).passthrough()

export const ImportFromPlexRequestSchema = z.object({
  baseUrl: z.string().min(1),
  token: z.string().min(1),
  libraryIds: z.array(z.union([z.string(), z.number()])).optional(),
  createMissingMedia: optionalCoercedBoolean,
}).passthrough()

export const ListEmbyLibrariesRequestSchema = ListJellyfinLibrariesRequestSchema
export const ImportFromEmbyRequestSchema = ImportFromJellyfinRequestSchema

export const TmdbSearchRequestSchema = z.object({
  query: z.string().min(1),
  year: z.union([z.string(), z.number()]).optional(),
  limit: z.union([z.string(), z.number()]).optional(),
}).passthrough()

export const TmdbMovieRequestSchema = z.object({
  id: z.union([z.string(), z.number()]),
}).passthrough()

export const TmdbFindImdbRequestSchema = z.object({
  imdbId: z.string().min(1),
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
  tagId: optionalCoercedNumber,
  markIds: z.array(z.coerce.number()).optional(),
  sort: z.enum(['time', 'shuffle']).optional(),
  countOnly: optionalCoercedBoolean,
  limit: optionalCoercedNumber,
  offset: optionalCoercedNumber,
}).passthrough()

export const ExportMarkClipsRequestSchema = z.object({
  markIds: z.array(z.coerce.number()).min(1),
  outputPath: z.string().min(1).optional(),
  sort: z.enum(['time', 'shuffle']).optional(),
}).passthrough()

export const MediaTagCountQuerySchema = z.object({
  mediaTypeId: z.coerce.number(),
  tagId: z.coerce.number(),
})

export const PlaylistWriteRequestSchema = z.object({
  name: z.string().nullable().optional(),
  favorite: z.boolean().optional(),
}).passthrough()

export const TabWriteRequestSchema = z.object({
  name: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  order: optionalCoercedNumber,
  tagId: optionalNullableCoercedNumberSchema,
  metaId: optionalNullableCoercedNumberSchema,
  mediaTypeId: optionalNullableCoercedNumberSchema,
}).passthrough()

export const SavedFilterWriteRequestSchema = z.object({
  name: z.string().nullable().optional(),
  mediaTypeId: optionalNullableCoercedNumberSchema,
  metaId: optionalNullableCoercedNumberSchema,
  tagId: optionalNullableCoercedNumberSchema,
  tabId: optionalNullableCoercedNumberSchema,
}).passthrough()

export const SettingUpdateRequestSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
}).passthrough()

export const WatchedFolderCreateRequestSchema = z.object({
  folder: z.object({
    path: z.string().min(1),
    name: z.string().nullable().optional(),
  }).passthrough(),
  types: z.array(z.union([z.number(), z.string()])).optional().default([]),
}).passthrough()

export const WatchedFolderUpdateRequestSchema = z.object({
  path: z.string().min(1).optional(),
  name: z.string().nullable().optional(),
  watch: z.boolean().optional(),
}).passthrough()

const coercedId = z.coerce.number()

export const TagsInMediaLinkSchema = z.object({
  mediaId: coercedId,
  tagId: coercedId,
  metaId: coercedId,
}).passthrough()

/** Accept flat link or legacy `{ data: link }` wrappers from older clients. */
export const TagsInMediaCreateOneRequestSchema = z.union([
  TagsInMediaLinkSchema,
  z.object({data: TagsInMediaLinkSchema}).passthrough().transform((body) => body.data),
])

export const TagsInMediaBulkCreateRequestSchema = z.array(TagsInMediaLinkSchema)

export const TagsInMediaDeleteFromMediaRequestSchema = z.object({
  mediaId: coercedId,
  tagId: coercedId,
}).passthrough()

export const TagsInMediaDeleteByMetaRequestSchema = z.object({
  itemId: coercedId,
  metaId: coercedId,
}).passthrough()

export const TagsInMediaQuerySchema = z.object({
  mediaId: coercedId,
}).passthrough()

export const TagsInTagLinkSchema = z.object({
  parentTagId: coercedId,
  tagId: coercedId,
  metaId: coercedId,
}).passthrough()

export const TagsInTagBulkCreateRequestSchema = z.array(TagsInTagLinkSchema)

export const TagsInTagDeleteFromTagRequestSchema = z.object({
  parentTagId: coercedId,
  tagId: coercedId,
}).passthrough()

export const TagsInTagDeleteByMetaRequestSchema = TagsInMediaDeleteByMetaRequestSchema

export const TagsInTagQuerySchema = z.object({
  tagId: coercedId,
}).passthrough()

export const ValuesInMediaItemSchema = z.object({
  mediaId: coercedId,
  metaId: coercedId,
  value: z.unknown().optional(),
}).passthrough()

export const ValuesInMediaBulkCreateRequestSchema = z.array(ValuesInMediaItemSchema)

export const ValuesInMediaDeleteRequestSchema = z.object({
  itemId: coercedId,
  metaId: coercedId,
}).passthrough()

export const ValuesInMediaQuerySchema = z.object({
  mediaId: coercedId,
}).passthrough()

export const ValuesInTagItemSchema = z.object({
  tagId: coercedId,
  metaId: coercedId,
  value: z.unknown().optional(),
}).passthrough()

export const ValuesInTagBulkCreateRequestSchema = z.array(ValuesInTagItemSchema)

export const ValuesInTagDeleteRequestSchema = ValuesInMediaDeleteRequestSchema

export const ValuesInTagQuerySchema = z.object({
  tagId: coercedId,
}).passthrough()

export const MediaInPlaylistCreateRequestSchema = z.object({
  mediaId: coercedId,
  playlistId: coercedId,
  order: optionalNullableCoercedNumberSchema,
}).passthrough()

export const MediaInPlaylistsUpdateRequestSchema = z.array(z.object({
  mediaId: coercedId,
  playlistId: coercedId,
  order: optionalNullableCoercedNumberSchema,
}).passthrough())

export const MediaInPlaylistsDeleteRequestSchema = z.object({
  mediaId: coercedId,
  playlistId: coercedId,
}).passthrough()

export const FilterRowCreateRequestSchema = z.object({
  filter: z.object({
    id: z.union([z.number(), z.string()]).nullable().optional(),
    param: z.union([z.string(), z.number()]).nullable().optional(),
    type: z.string().nullable().optional(),
    cond: z.string().nullable().optional(),
    val: z.unknown().optional(),
    note: z.string().nullable().optional(),
    active: optionalCoercedBoolean,
    lock: optionalCoercedBoolean,
    order: optionalNullableCoercedNumberSchema,
    metaId: optionalNullableCoercedNumberSchema,
  }).passthrough(),
  filterId: optionalNullableCoercedNumberSchema,
  rowId: optionalNullableCoercedNumberSchema,
  savedFilterId: optionalNullableCoercedNumberSchema,
}).passthrough()

export const FilterRowUpdateRequestSchema = z.object({
  param: z.union([z.string(), z.number()]).nullable().optional(),
  type: z.string().nullable().optional(),
  cond: z.string().nullable().optional(),
  val: z.unknown().optional(),
  note: z.string().nullable().optional(),
  active: optionalCoercedBoolean,
  lock: optionalCoercedBoolean,
  order: optionalNullableCoercedNumberSchema,
  union: z.unknown().optional(),
  metaId: optionalNullableCoercedNumberSchema,
}).passthrough()

export const FilterRowsInSavedFilterQuerySchema = z.object({
  filterId: coercedId,
}).passthrough()

export const TagsInFilterRowQuerySchema = z.object({
  rowId: coercedId,
}).passthrough()

export const MediaTypeWriteRequestSchema = z.object({
  name: z.string().optional(),
  extensions: z.string().optional(),
  icon: z.string().optional(),
  hidden: z.union([z.boolean(), z.number()]).optional(),
  order: optionalCoercedNumber,
  custom: z.boolean().optional(),
}).passthrough()

export const PinMetaAssignmentRequestSchema = z.object({
  metaId: coercedId,
  mediaTypeId: coercedId,
  order: optionalNullableCoercedNumberSchema,
}).passthrough()

export const PinChildMetaRequestSchema = z.object({
  metaId: coercedId,
  pinnedMetaId: coercedId,
  order: optionalNullableCoercedNumberSchema,
}).passthrough()

export const MetaInMediaTypeOrderRequestSchema = z.object({
  metaId: coercedId,
  mediaTypeId: coercedId,
  data: z.object({
    order: coercedId,
  }).passthrough(),
}).passthrough()

export const PinnedMetaOrderRequestSchema = z.object({
  metaId: coercedId,
  pinnedMetaId: coercedId,
  data: z.object({
    order: coercedId,
  }).passthrough(),
}).passthrough()

export const MetaInMediaTypeFindQuerySchema = z.object({
  mediaTypeId: coercedId.optional(),
  metaId: coercedId.optional(),
}).passthrough()

export const MetaInMediaTypeDeleteQuerySchema = z.object({
  metaId: coercedId,
  mediaTypeId: coercedId,
})

export const PinnedMetaFindQuerySchema = z.object({
  metaId: coercedId.optional(),
  pinnedMetaId: coercedId.optional(),
}).passthrough()

export const PinnedMetaDeleteQuerySchema = z.object({
  metaId: coercedId,
})

export const PluginUninstallRequestSchema = z.object({
  id: z.string().trim().min(1),
}).passthrough()

export const TagsInFolderLinkSchema = z.object({
  path: z.string().min(1),
  tagId: coercedId,
  metaId: coercedId,
}).passthrough()

export const TagsInFolderBulkCreateRequestSchema = z.array(TagsInFolderLinkSchema)

export const TagsInFolderPathQuerySchema = z.object({
  path: z.string().optional(),
}).passthrough()

export const TagsInFolderByPathsRequestSchema = z.object({
  paths: z.array(z.string()).optional().default([]),
}).passthrough()

export const TagsInFolderPathRequestSchema = z.object({
  path: z.string().min(1),
}).passthrough()

export const TagsInFolderDeleteFromFolderRequestSchema = z.object({
  path: z.string().min(1),
  tagId: coercedId,
}).passthrough()

export const TagsInFolderDeleteByMetaRequestSchema = z.object({
  path: z.string().min(1),
  metaId: coercedId,
}).passthrough()

export const TagsInFolderReplaceForMetaRequestSchema = z.object({
  path: z.string().min(1),
  metaId: coercedId,
  tagIds: z.array(z.union([z.number(), z.string()])).optional().default([]),
}).passthrough()

export const TagsInFolderRemapPathsRequestSchema = z.object({
  find: z.string().min(1),
  replace: z.string(),
}).passthrough()

export const BackupNameRequiredRequestSchema = z.object({
  name: z.string().min(1),
}).passthrough()

export const BackupExportRequestSchema = z.object({
  archive: z.string().min(1),
  path: z.string().min(1),
}).passthrough()

export const PageSettingCriteriaSchema = z.object({
  page: optionalCoercedNumber,
  size: optionalCoercedNumber,
  view: z.union([z.number(), z.string()]).optional(),
  limit: optionalCoercedNumber,
  sortBy: z.string().optional(),
  sortDir: z.string().optional(),
  firstChar: z.string().optional(),
  colors: z.unknown().optional(),
  metaId: optionalNullableCoercedNumberSchema,
  mediaTypeId: optionalNullableCoercedNumberSchema,
  tagId: optionalNullableCoercedNumberSchema,
  filterId: optionalNullableCoercedNumberSchema,
  tabId: optionalNullableCoercedNumberSchema,
}).passthrough()

export const PageSettingCreateRequestSchema = PageSettingCriteriaSchema

export const PageSettingFindQuerySchema = z.object({
  metaId: optionalNullableCoercedNumberSchema,
  mediaTypeId: optionalNullableCoercedNumberSchema,
}).passthrough()

export const PageSettingUpdateRequestSchema = z.object({
  query: PageSettingCriteriaSchema,
  data: PageSettingCriteriaSchema,
}).passthrough()

export const VideoMetadataUpdateRequestSchema = z.object({
  duration: optionalNullableCoercedNumberSchema,
  width: optionalNullableCoercedNumberSchema,
  height: optionalNullableCoercedNumberSchema,
  bitrate: optionalNullableCoercedNumberSchema,
  codec: z.string().nullable().optional(),
  fps: optionalNullableCoercedNumberSchema,
}).passthrough()

export const MetaSettingUpdateRequestSchema = MetaSettingSchema

export const CreateTagItemRequestSchema = z.object({
  name: z.string().min(1),
  metaId: optionalNullableCoercedNumberSchema,
  color: z.string().optional(),
  synonyms: z.string().optional(),
}).passthrough()

export const CreateTagsRequestSchema = z.array(CreateTagItemRequestSchema).min(1)

export const TagItemsRequestSchema = ItemsListRequestSchema.extend({
  metaId: coercedId,
  search: z.string().optional(),
  query: z.string().optional(),
  find_duplicates: optionalCoercedBoolean,
})

export const EntityUpdateRequestSchema = z.object({
  name: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  synonyms: z.string().nullable().optional(),
  rating: optionalCoercedNumber,
  favorite: optionalCoercedBoolean,
  views: optionalCoercedNumber,
  bookmark: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  viewedAt: z.string().optional(),
  silent: optionalCoercedBoolean,
}).passthrough()

export const MetaWriteRequestSchema = MetaSchema.omit({id: true}).partial().passthrough()

export const EmptyObjectRequestSchema = z.object({}).passthrough()

export const MarkCreateRequestSchema = z.object({
  type: z.string().nullable().optional(),
  text: z.string().nullable().optional(),
  time: optionalNullableCoercedNumberSchema,
  end: optionalNullableCoercedNumberSchema,
  tagId: optionalNullableCoercedNumberSchema,
  mediaId: optionalNullableCoercedNumberSchema,
}).passthrough()

export const FaceMediaIdRequestSchema = z.object({
  mediaId: coercedId.optional(),
  id: coercedId.optional(),
  force: optionalCoercedBoolean,
  framesPerVideo: optionalCoercedNumber,
  minScore: optionalCoercedNumber,
  match: optionalCoercedBoolean,
  applyTags: z.union([z.boolean(), z.string()]).optional(),
  ensureCrops: z.union([z.boolean(), z.string()]).optional(),
}).passthrough().refine(
  (value) => value.mediaId != null || value.id != null,
  {message: 'mediaId is required'},
)

export const FaceAssignRequestSchema = z.object({
  faceId: coercedId,
  tagId: coercedId,
  enroll: optionalCoercedBoolean,
  applyTag: optionalCoercedBoolean,
  matchScore: optionalCoercedNumber,
}).passthrough()

export const FaceClearRequestSchema = z.object({
  faceId: coercedId,
}).passthrough()

export const FaceTagIdRequestSchema = z.object({
  tagId: coercedId,
  force: optionalCoercedBoolean,
}).passthrough()

export const FaceTagIdQuerySchema = z.object({
  tagId: coercedId,
}).passthrough()

export const FaceStreamDetectionRequestSchema = z.object({
  force: optionalCoercedBoolean,
  mediaIds: z.array(z.union([z.number(), z.string()])).optional(),
  paths: z.array(z.union([
    z.string(),
    z.object({path: z.string()}).passthrough(),
  ])).optional(),
  applyTags: z.union([z.boolean(), z.string()]).optional(),
  framesPerVideo: optionalCoercedNumber,
  minScore: optionalCoercedNumber,
}).passthrough()

export const AutoChapterStreamRequestSchema = z.object({
  force: optionalCoercedBoolean,
  mediaIds: z.array(z.union([z.number(), z.string()])).optional(),
  threshold: optionalCoercedNumber,
  minGapSec: optionalCoercedNumber,
  maxChapters: optionalCoercedNumber,
}).passthrough()

export const GenerateAutoChaptersRequestSchema = z.object({
  mediaId: z.union([z.number(), z.string()]),
  force: optionalCoercedBoolean,
  threshold: optionalCoercedNumber,
  minGapSec: optionalCoercedNumber,
  maxChapters: optionalCoercedNumber,
}).passthrough()

export const FaceStreamEnrollmentRequestSchema = z.object({
  force: optionalCoercedBoolean,
  metaId: optionalCoercedNumber,
}).passthrough()

export const FaceStreamMatchingRequestSchema = z.object({
  force: optionalCoercedBoolean,
  mediaIds: z.array(z.union([z.number(), z.string()])).optional(),
}).passthrough()

export const FaceEnrollmentQualityReportRequestSchema = z.object({
  metaId: optionalCoercedNumber,
}).passthrough()

export type ParsedItemsListRequest = z.infer<typeof ItemsListRequestSchema>
export type ParsedBulkMetaApplyRequest = z.infer<typeof BulkMetaApplyRequestSchema>
export type ParsedGlobalSearchRequest = z.infer<typeof GlobalSearchRequestSchema>
export type ParsedPathPayload = z.infer<typeof PathPayloadSchema>
export type ParsedAddMediaRequest = z.infer<typeof AddMediaRequestSchema>
export type ParsedParsePathTagsRequest = z.infer<typeof ParsePathTagsRequestSchema>
export type ParsedApplyParseLibraryTagsRequest = z.infer<typeof ApplyParseLibraryTagsRequestSchema>
export type ParsedPlaylistWriteRequest = z.infer<typeof PlaylistWriteRequestSchema>
export type ParsedTabWriteRequest = z.infer<typeof TabWriteRequestSchema>
export type ParsedSavedFilterWriteRequest = z.infer<typeof SavedFilterWriteRequestSchema>
export type ParsedSettingUpdateRequest = z.infer<typeof SettingUpdateRequestSchema>
export type ParsedWatchedFolderCreateRequest = z.infer<typeof WatchedFolderCreateRequestSchema>
export type ParsedWatchedFolderUpdateRequest = z.infer<typeof WatchedFolderUpdateRequestSchema>
