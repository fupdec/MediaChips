import { z } from 'zod'
import type { FilterObject, SavedFilter } from '../entities/filter'
import {
  FilterObjectSchema,
  MediaItemSchema,
  MediaListResponseSchema,
  MediaTypeSchema,
  MetaSchema,
  PlaylistSchema,
  SettingEntrySchema,
  TabSchema,
  TagSchema,
} from './entities'
import {
  ExtendedStatsSchema,
  GlobalSearchMediaResponseSchema,
  GlobalSearchTagsResponseSchema,
  GlobalSearchResponseSchema,
  HomeHealthSchema,
  HomeMarkersSchema,
  HomeMediaResponseSchema,
  HomeMediaStatsSchema,
  HomeTagCountSchema,
  MediaThumbsResponseSchema,
  MissingMediaStatusSchema,
  SqlQueryMediaResultSchema,
  SqlQueryTagResultSchema,
  SuggestTagsResponseSchema,
  TagThumbsResponseSchema,
} from './home'
import { AuthLoginSchema, AuthStatusSchema } from './auth'
import {
  BackupListSchema,
  ClipModelStatusSchema,
  DatabaseSizesResponseSchema,
  FileExistsResponseSchema,
  CheckFilesResponseSchema,
  FileListResponseSchema,
  FolderSizeResponseSchema,
  MediaIdsResponseSchema,
  MediaPathFileSchema,
  AddMediaResponseSchema,
  ResolvePathResponseSchema,
  WatchedFolderLinkSchema,
} from './tasks'
import {
  DynamicPlaylistSummarySchema,
  FilterRowInSavedFilterSchema,
  SavedFilterBasicSchema,
  SavedFilterFindOrCreateHydratedSchema,
  SavedFilterMediaResponseSchema,
  SavedFilterSchema,
  SavedFilterSummaryResponseSchema,
  TagInFilterRowSchema,
} from './filters'
import {
  PageSettingsFindOrCreateSchema,
  PageSettingsRecordSchema,
  PlaylistCreateResponseSchema,
} from './pages'
import type { PageSettingsRecord, SettingEntry, DatabaseSizesResponse, BackupEntry, MediaPathFile, AddMediaResponse, ParsePathTagEntry, MarkForVideo, MarkClipsResponse } from '../api/responses'
import type { SavedFilterBasic } from '../entities/filter'
import type { MediaType } from '../entities/media'
import type { MediaItem } from '../entities/media'
import type { AssignedMeta, Meta, MetaSetting, MetaInMediaTypeAssignmentRow, MetaInMediaTypeRow, PinnedChildMetaAssignmentRow, Tag } from '../entities/meta'
import type { Playlist, PlaylistMediaLink } from '../entities/playlist'
import type { Tab } from '../entities/tab'
import type { WatchedFolderLink } from '../entities/watched-folder'
import type {
  TagInTagEntry,
  ValueInTagEntry,
} from '../api/responses'
import {
  AssignedMetaSchema,
  FilterRowResponseSchema,
  MarkForVideoSchema,
  MarkClipsResponseSchema,
  MediaCountWithTagSchema,
  MetaSettingSchema,
  PinnedMetaLinkSchema,
  PlaylistMediaLinkSchema,
  ParsePathTagEntrySchema,
  TagFilterResponseSchema,
  TagInTagEntrySchema,
  TagItemsResponseSchema,
  TagsInMediaCreateOneSchema,
  UpdatedEntitySchema,
  ValueInTagEntrySchema,
  VideoMetadataSchema,
} from './media-meta'

export function parseMediaTypes(data: unknown) {
  return z.array(MediaTypeSchema).parse(data)
}

export function parseTags(data: unknown) {
  return z.array(TagSchema).parse(data)
}

export function parseTag(data: unknown) {
  return TagSchema.parse(data)
}

export function parseMetaList(data: unknown) {
  return z.array(MetaSchema).parse(data)
}

export function parseTabs(data: unknown) {
  return z.array(TabSchema).parse(data)
}

export function parseTab(data: unknown): Tab {
  return TabSchema.parse(data) as Tab
}

export function parsePlaylists(data: unknown) {
  return z.array(PlaylistSchema).parse(data)
}

export function parseSettings(data: unknown) {
  return z.array(SettingEntrySchema).parse(data)
}

export function parseMediaListResponse(data: unknown) {
  return MediaListResponseSchema.parse(data)
}

export function parseMediaItems(data: unknown) {
  return z.array(MediaItemSchema).parse(data)
}

export function parseFilterObjects(data: unknown): FilterObject[] {
  return z.array(FilterObjectSchema).parse(data) as FilterObject[]
}

export function parseHomeMediaStats(data: unknown) {
  return HomeMediaStatsSchema.parse(data)
}

export function parseHomeTagCount(data: unknown) {
  return HomeTagCountSchema.parse(data)
}

export function parseExtendedStats(data: unknown) {
  return ExtendedStatsSchema.parse(data)
}

export function parseHomeHealth(data: unknown) {
  return HomeHealthSchema.parse(data)
}

export function parseHomeMarkers(data: unknown) {
  return HomeMarkersSchema.parse(data)
}

export function parseHomeMediaResponse(data: unknown) {
  return HomeMediaResponseSchema.parse(data)
}

export function parseMissingMediaStatus(data: unknown) {
  return MissingMediaStatusSchema.parse(data)
}

export function parseMediaThumbsResponse(data: unknown) {
  return MediaThumbsResponseSchema.parse(data)
}

export function parseTagThumbsResponse(data: unknown) {
  return TagThumbsResponseSchema.parse(data)
}

export function parseSuggestTagsResponse(data: unknown) {
  return SuggestTagsResponseSchema.parse(data)
}

export function parseAuthStatusResponse(data: unknown) {
  return AuthStatusSchema.parse(data)
}

export function parseAuthLoginResponse(data: unknown) {
  return AuthLoginSchema.parse(data)
}

export function parseGlobalSearchMediaResponse(data: unknown): MediaItem[] {
  return GlobalSearchMediaResponseSchema.parse(data).items as MediaItem[]
}

export function parseGlobalSearchTagsResponse(data: unknown): Tag[] {
  return GlobalSearchTagsResponseSchema.parse(data).items as Tag[]
}

export function parseGlobalSearchResponse(data: unknown) {
  return GlobalSearchResponseSchema.parse(data)
}

export function parseSqlQueryMediaRows(data: unknown): MediaItem[] {
  return SqlQueryMediaResultSchema.parse(data)[0] as MediaItem[]
}

export function parseSqlQueryTagRows(data: unknown): Tag[] {
  return SqlQueryTagResultSchema.parse(data)[0] as Tag[]
}

export function parseFileExistsResponse(data: unknown) {
  return FileExistsResponseSchema.parse(data)
}

export function parseCheckFilesResponse(data: unknown) {
  return CheckFilesResponseSchema.parse(data)
}

export function parseResolvePathResponse(data: unknown) {
  return ResolvePathResponseSchema.parse(data)
}

export function parseFileListResponse(data: unknown) {
  return FileListResponseSchema.parse(data)
}

export function parseFolderSizeResponse(data: unknown) {
  return FolderSizeResponseSchema.parse(data)
}

export function parseMediaIdsResponse(data: unknown) {
  return MediaIdsResponseSchema.parse(data)
}

export function parseClipModelStatus(data: unknown) {
  return ClipModelStatusSchema.parse(data)
}

export function parseBackupList(data: unknown): BackupEntry[] {
  return BackupListSchema.parse(data) as BackupEntry[]
}

export function parseMediaPathSearchResults(data: unknown): MediaPathFile[] {
  return z.array(MediaPathFileSchema).parse(data) as MediaPathFile[]
}

export function parseAddMediaResponse(data: unknown): AddMediaResponse {
  return AddMediaResponseSchema.parse(data) as AddMediaResponse
}

export function parseSavedFilters(data: unknown): SavedFilter[] {
  return z.array(SavedFilterSchema).parse(data) as SavedFilter[]
}

export function parseSavedFilterFindOrCreateHydrated(
  data: unknown,
): [SavedFilter, boolean] {
  return SavedFilterFindOrCreateHydratedSchema.parse(data) as [SavedFilter, boolean]
}

export function parseDynamicPlaylistSummaries(data: unknown) {
  return z.array(DynamicPlaylistSummarySchema).parse(data)
}

export function parseSavedFilterMediaResponse(data: unknown) {
  return SavedFilterMediaResponseSchema.parse(data)
}

export function parseSavedFilterSummaryResponse(data: unknown) {
  return SavedFilterSummaryResponseSchema.parse(data)
}

export function parseFilterRowsInSavedFilter(data: unknown) {
  return z.array(FilterRowInSavedFilterSchema).parse(data)
}

export function parseTagsInFilterRow(data: unknown) {
  return z.array(TagInFilterRowSchema).parse(data)
}

export function parsePageSettingsRecord(data: unknown): PageSettingsRecord {
  return PageSettingsRecordSchema.parse(data) as PageSettingsRecord
}

export function parsePageSettingsFindOrCreate(
  data: unknown,
): [PageSettingsRecord | null, boolean?] {
  return PageSettingsFindOrCreateSchema.parse(data) as [PageSettingsRecord | null, boolean?]
}

export function parsePlaylistCreateResponse(data: unknown): Playlist {
  return PlaylistCreateResponseSchema.parse(data) as Playlist
}

export function parseMeta(data: unknown): Meta {
  return MetaSchema.parse(data) as Meta
}

export function parseMetaSetting(data: unknown): MetaSetting {
  return MetaSettingSchema.parse(data) as MetaSetting
}

export function parseMediaType(data: unknown): MediaType {
  return MediaTypeSchema.parse(data) as MediaType
}

export function parseAssignedMetaList(data: unknown): AssignedMeta[] {
  return z.array(AssignedMetaSchema).parse(data) as AssignedMeta[]
}

export function parseMetaInMediaTypeAssignments(data: unknown): MetaInMediaTypeAssignmentRow[] {
  return parseAssignedMetaList(data) as MetaInMediaTypeAssignmentRow[]
}

export function parseMetaInMediaTypeRows(data: unknown): MetaInMediaTypeRow[] {
  return parseAssignedMetaList(data) as MetaInMediaTypeRow[]
}

export function parsePinnedChildMetaAssignments(data: unknown): PinnedChildMetaAssignmentRow[] {
  return parseAssignedMetaList(data) as PinnedChildMetaAssignmentRow[]
}

export function parseTagInTagEntries(data: unknown): TagInTagEntry[] {
  return z.array(TagInTagEntrySchema).parse(data) as TagInTagEntry[]
}

export function parseValueInTagEntries(data: unknown): ValueInTagEntry[] {
  return z.array(ValueInTagEntrySchema).parse(data) as ValueInTagEntry[]
}

export function parsePinnedMetaLinks(data: unknown): Array<{ metaId: number }> {
  return z.array(PinnedMetaLinkSchema).parse(data)
}

export function parseTagFilterResponse(data: unknown): { items: Tag[] } {
  const parsed = TagFilterResponseSchema.parse(data)
  return {
    items: parseTags(parsed.items ?? []) as Tag[],
  }
}

export function parseTagItemsResponse(data: unknown): { items: Tag[] } {
  const parsed = TagItemsResponseSchema.parse(data)
  return {
    items: parseTags(parsed.items ?? []) as Tag[],
  }
}

export function parsePlaylistMediaLinks(data: unknown): PlaylistMediaLink[] {
  return z.array(PlaylistMediaLinkSchema).parse(data) as PlaylistMediaLink[]
}

export function parseFilterRowResponse(data: unknown) {
  return FilterRowResponseSchema.parse(data)
}

export function parseMarksForVideo(data: unknown): MarkForVideo[] {
  return z.array(MarkForVideoSchema).parse(data) as MarkForVideo[]
}

export function parseMark(data: unknown): MarkForVideo {
  return MarkForVideoSchema.parse(data) as MarkForVideo
}

export function parseMarkClipsResponse(data: unknown): MarkClipsResponse {
  return MarkClipsResponseSchema.parse(data) as MarkClipsResponse
}

export function parseVideoMetadata(data: unknown) {
  return VideoMetadataSchema.parse(data)
}

export function parseMediaCountWithTag(data: unknown) {
  return MediaCountWithTagSchema.parse(data)
}

export function parseSetting(data: unknown): SettingEntry {
  return SettingEntrySchema.parse(data) as SettingEntry
}

export function parseUpdatedEntity(data: unknown) {
  return UpdatedEntitySchema.parse(data)
}

export function parseTagsInMediaCreateOne(data: unknown) {
  return TagsInMediaCreateOneSchema.parse(data)
}

export function parseSavedFilterBasicList(data: unknown): SavedFilterBasic[] {
  return z.array(SavedFilterBasicSchema).parse(data) as SavedFilterBasic[]
}

export function parsePathTagEntries(data: unknown): ParsePathTagEntry[] {
  return z.array(ParsePathTagEntrySchema).parse(data) as ParsePathTagEntry[]
}

export function parseDatabaseSizesResponse(data: unknown): DatabaseSizesResponse {
  return DatabaseSizesResponseSchema.parse(data) as DatabaseSizesResponse
}

export function parseWatchedFolderLinks(data: unknown): WatchedFolderLink[] {
  return z.array(WatchedFolderLinkSchema).parse(data) as WatchedFolderLink[]
}

export {
  FilterObjectSchema,
  MediaItemSchema,
  MediaListResponseSchema,
  MediaTypeSchema,
  MetaSchema,
  PlaylistSchema,
  SettingEntrySchema,
  TabSchema,
  TagSchema,
} from './entities'

export {
  ExtendedStatsSchema,
  HomeHealthSchema,
  HomeMarkersSchema,
  HomeMediaResponseSchema,
  HomeMediaStatsSchema,
  HomeTagCountSchema,
  MediaThumbsResponseSchema,
  MissingMediaStatusSchema,
  SuggestTagsResponseSchema,
} from './home'

export {
  BackupListSchema,
  ClipModelStatusSchema,
  DatabaseSizesResponseSchema,
  FileExistsResponseSchema,
  CheckFilesResponseSchema,
  FileListResponseSchema,
  FolderSizeResponseSchema,
  MediaIdsResponseSchema,
  MediaPathFileSchema,
  AddMediaResponseSchema,
  ResolvePathResponseSchema,
  WatchedFolderLinkSchema,
} from './tasks'

export {
  DynamicPlaylistSummarySchema,
  FilterRowInSavedFilterSchema,
  SavedFilterBasicSchema,
  SavedFilterFindOrCreateHydratedSchema,
  SavedFilterMediaResponseSchema,
  SavedFilterSchema,
  SavedFilterSummaryResponseSchema,
  TagInFilterRowSchema,
} from './filters'

export {
  PageSettingsFindOrCreateSchema,
  PageSettingsRecordSchema,
  PlaylistCreateResponseSchema,
} from './pages'

export {
  AssignedMetaSchema,
  FilterRowResponseSchema,
  MarkForVideoSchema,
  MarkClipsResponseSchema,
  MediaCountWithTagSchema,
  MetaSettingSchema,
  PinnedMetaLinkSchema,
  PlaylistMediaLinkSchema,
  ParsePathTagEntrySchema,
  TagFilterResponseSchema,
  TagInTagEntrySchema,
  TagItemsResponseSchema,
  TagsInMediaCreateOneSchema,
  UpdatedEntitySchema,
  ValueInTagEntrySchema,
  VideoMetadataSchema,
} from './media-meta'
