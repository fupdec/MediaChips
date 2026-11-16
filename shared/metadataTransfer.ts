import {z} from 'zod'

export const METADATA_FORMAT = 'mediachips.metadata' as const
export const METADATA_VERSION = 1 as const
export const METADATA_EXTENSION = '.mediachips.json'
const id = z.number().int().positive().safe()
const scalar = z.union([z.string(), z.number().finite(), z.boolean(), z.null()])
export type MetadataScalar = z.infer<typeof scalar>
// Column names and column types are additionally checked against the server's schema.
const row = z.record(scalar).and(z.object({id}))
const value = z.object({metaId: id, value: scalar, rawValue: z.string().nullable()}).strict()
const rows = <T extends z.ZodTypeAny>(schema: T) => z.array(schema).max(100_000)
export const MetadataBundleSchema = z.object({
  format: z.literal(METADATA_FORMAT), version: z.literal(METADATA_VERSION),
  exportedAt: z.string(),
  fields: rows(row), tags: rows(row), media: rows(row), mediaTypes: rows(row),
  marks: rows(row),
  mediaTags: rows(z.object({mediaId: id, tagId: id, metaId: id}).strict()),
  tagTags: rows(z.object({parentTagId: id, tagId: id, metaId: id}).strict()),
  mediaValues: rows(value.extend({mediaId: id})),
  tagValues: rows(value.extend({tagId: id})),
  fieldAssignments: rows(z.object({metaId: id, mediaTypeId: id, scraper: z.string().nullable(), show: z.boolean().nullable(), order: z.number().nullable()}).strict()),
  fieldPins: rows(z.object({metaId: id, pinnedMetaId: id, scraper: z.string().nullable(), show: z.boolean().nullable(), order: z.number().nullable()}).strict()),
}).strict()
export type MetadataBundle = z.infer<typeof MetadataBundleSchema>
export type MetadataRow = z.infer<typeof row>
export type MetadataResolution = 'keep' | 'replace'
export interface MetadataConflict {
  key: string
  entity: string
  name: string
  blocked: boolean
  current: Record<string, unknown>
  incoming: Record<string, unknown>
}
export interface MetadataPreview {
  token: string
  conflicts: MetadataConflict[]
  counts: {media: number; fields: number; tags: number; marks: number}
}
export const MetadataSelectionSchema = z.object({mediaIds: z.array(id).min(1).max(10_000)}).strict()
export const MetadataImportSchema = z.object({
  bundle: MetadataBundleSchema,
  token: z.string().length(64),
  resolutions: z.record(z.enum(['keep', 'replace'])),
}).strict()

/** Preserve original SQLite spelling as well as native JSON numbers/booleans. */
export function metadataNativeValue(type: string, raw: string | null): MetadataScalar {
  if (raw === null || raw === '') return raw
  if ((type === 'number' || type === 'rating') && Number.isFinite(Number(raw))) return Number(raw)
  if (type === 'boolean') {
    if (raw === 'true' || raw === '1') return true
    if (raw === 'false' || raw === '0') return false
  }
  return raw
}
