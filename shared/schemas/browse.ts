import {z} from 'zod'

export const BrowsePlaceSchema = z.object({
  id: z.string(),
  path: z.string(),
  name: z.string(),
  icon: z.string(),
}).passthrough()

export const BrowsePlacesResponseSchema = z.object({
  places: z.array(BrowsePlaceSchema).default([]),
  container: z.boolean().optional(),
}).passthrough()

export const BrowseDirectoryEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  isDirectory: z.boolean(),
  size: z.number().nullable().optional(),
  mtimeMs: z.number().nullable().optional(),
  extension: z.string().nullable().optional(),
  inLibrary: z.boolean().optional(),
  addable: z.boolean().optional(),
  mediaId: z.number().nullable().optional(),
}).passthrough()

export const BrowseDirectoryResultSchema = z.object({
  currentPath: z.string(),
  parentPath: z.string().nullable().optional(),
  rootPath: z.string().nullable().optional(),
  truncated: z.boolean().optional(),
  platform: z.string().optional(),
  entries: z.array(BrowseDirectoryEntrySchema).default([]),
}).passthrough()

export const MediaRootEntrySchema = z.object({
  path: z.string(),
  name: z.string(),
  children: z.array(z.object({
    path: z.string(),
    name: z.string(),
  }).passthrough()).default([]),
}).passthrough()

export const MediaRootsResponseSchema = z.object({
  roots: z.array(MediaRootEntrySchema).default([]),
}).passthrough()

export const MediaFolderBrowseFolderSchema = z.object({
  path: z.string(),
  name: z.string(),
  mediaCount: z.number(),
  coverMediaIds: z.array(z.number()).optional(),
}).passthrough()

export const MediaFolderBrowseBreadcrumbSchema = z.object({
  path: z.string(),
  name: z.string(),
}).passthrough()

export const MediaFolderBrowseResponseSchema = z.object({
  currentPath: z.string().nullable(),
  parentPath: z.string().nullable(),
  breadcrumbs: z.array(MediaFolderBrowseBreadcrumbSchema).default([]),
  folders: z.array(MediaFolderBrowseFolderSchema).default([]),
  media: z.array(z.object({
    id: z.number(),
  }).passthrough()).default([]),
  coverMediaTypeById: z.record(z.string(), z.number()).optional(),
}).passthrough()
