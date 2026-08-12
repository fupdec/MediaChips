import { z } from 'zod'
import { MediaIdsResponseSchema } from './responses-schemas'
import { MediaTypeSchema } from './entities'

export const WatchedFolderSchema = z.object({
  path: z.string().optional(),
  name: z.string().optional(),
  watch: z.boolean().optional(),
  icon: z.string().nullable().optional(),
  excludedPaths: z.array(z.string()).optional(),
}).passthrough()

export const WatchedFolderLinkSchema = z.object({
  folderId: z.number(),
  mediaTypeId: z.number().optional(),
  mediaType: MediaTypeSchema.optional(),
  watchedFolder: WatchedFolderSchema.optional(),
}).passthrough()

export const DatabaseSizesResponseSchema = z.object({
  sizes: z.record(z.string(), z.number()).optional(),
  backupCounts: z.record(z.string(), z.number()).optional(),
}).passthrough()

export const DuplicateDbResponseSchema = z.object({
  database: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    active: z.boolean(),
    createdAt: z.number(),
    icon: z.string().optional(),
  }),
}).passthrough()

export const FileExistsResponseSchema = z.object({
  exists: z.boolean().optional(),
}).passthrough()

export const CheckFilesRequestSchema = z.object({
  paths: z.array(z.string().min(1)).min(1).max(100),
})

export const CheckFilesResponseSchema = z.object({
  results: z.record(z.string(), z.boolean()),
})

export const ResolvePathResponseSchema = z.object({
  exists: z.boolean().optional(),
}).passthrough()

export const FileListResponseSchema = z.object({
  files: z.array(z.string()),
  skippedZips: z.array(z.object({
    path: z.string(),
    reason: z.string(),
    message: z.string().optional(),
  }).passthrough()).optional().default([]),
}).passthrough()

export const FolderSizeResponseSchema = z.object({
  size: z.number(),
}).passthrough()

export const ClipModelStatusSchema = z.object({
  status: z.string().optional(),
}).passthrough()

export const BackupEntrySchema = z.object({
  name: z.string().optional(),
  path: z.string().optional(),
  date: z.string().optional(),
  size: z.union([z.number(), z.string()]).optional(),
}).passthrough()

export const MediaPathFileSchema = z.object({
  id: z.number(),
  path: z.string().optional(),
}).passthrough()

export const AddMediaResponseSchema = z.object({
  id: z.number().optional(),
  message: z.string().optional(),
  duplicate: z.object({
    parameter: z.string().optional(),
    path: z.string().optional(),
    id: z.number().optional(),
  }).passthrough().optional(),
}).passthrough()

export const BackupListSchema = z.array(BackupEntrySchema)

export const GenerationCountStatusSchema = z.object({
  total: z.number().optional(),
  pending: z.number().optional(),
  generated: z.number().optional(),
}).passthrough()

export const VideoImagesGenerationStatusSchema = z.object({
  preview: GenerationCountStatusSchema.optional(),
  grid: GenerationCountStatusSchema.optional(),
  marks: GenerationCountStatusSchema.optional(),
}).passthrough()

export const ImageThumbsGenerationStatusSchema = GenerationCountStatusSchema

export const TagImageAiUpscaleStatusSchema = z.object({
  done: z.boolean().optional(),
  pendingCount: z.number().optional(),
  byType: z.record(z.string(), z.number()).optional(),
  downloadSizeMb: z.number().optional(),
  suggested: z.boolean().optional(),
}).passthrough()

export const RelinkMissingMediaResponseSchema = z.object({
  updated: z.number().optional(),
}).passthrough()

export { MediaIdsResponseSchema }

export type ParsedFileExistsResponse = z.infer<typeof FileExistsResponseSchema>
export type ParsedResolvePathResponse = z.infer<typeof ResolvePathResponseSchema>
export type ParsedFolderSizeResponse = z.infer<typeof FolderSizeResponseSchema>
export type ParsedClipModelStatus = z.infer<typeof ClipModelStatusSchema>
export type ParsedBackupEntry = z.infer<typeof BackupEntrySchema>
export type ParsedMediaPathFile = z.infer<typeof MediaPathFileSchema>
export type ParsedAddMediaResponse = z.infer<typeof AddMediaResponseSchema>
export type ParsedMediaIdsResponse = z.infer<typeof MediaIdsResponseSchema>
export type ParsedWatchedFolderLink = z.infer<typeof WatchedFolderLinkSchema>
export type ParsedDatabaseSizesResponse = z.infer<typeof DatabaseSizesResponseSchema>
