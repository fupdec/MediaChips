import {z} from 'zod'

export const OriginalTargetSchema = z.object({
  connectionId: z.union([z.string().uuid(), z.literal('google-drive')]).optional(),
  key: z.string().min(1).max(4096),
  name: z.string().min(1).max(255).refine(value => !/[\/\\\x00-\x1f]/.test(value) && value !== '.' && value !== '..').optional(),
}).strict()
export const OriginalOperationSchema = z.object({
  kind: z.enum(['download', 'transfer', 'rename', 'mkdir', 'upload', 'move', 'delete']),
  mediaId: z.number().int().positive().optional(),
  target: OriginalTargetSchema.optional(),
  conflict: z.enum(['fail', 'skip', 'keep-both']).default('fail'),
  uploadSize: z.number().int().min(0).max(1024 ** 4).optional(),
  confirmDelete: z.literal(true).optional(),
  removeSource: z.boolean().optional(),
}).strict().superRefine((item, ctx) => {
  if (!['mkdir', 'upload'].includes(item.kind) && !item.mediaId) ctx.addIssue({code: 'custom', message: 'mediaId required'})
  if (item.kind !== 'delete' && !item.target) ctx.addIssue({code: 'custom', message: 'target required'})
  if (item.kind === 'delete' && !item.confirmDelete) ctx.addIssue({code: 'custom', message: 'Explicit original deletion confirmation required'})
  if (item.kind === 'upload' && item.uploadSize === undefined) ctx.addIssue({code: 'custom', message: 'uploadSize required'})
  if (item.kind === 'download' && item.target?.connectionId) ctx.addIssue({code: 'custom', message: 'Downloads require a local destination on the server'})
  if (item.removeSource && item.kind !== 'transfer') ctx.addIssue({code: 'custom', message: 'removeSource is only valid for transfers'})
  if (item.removeSource && !item.confirmDelete) ctx.addIssue({code: 'custom', message: 'Explicit source deletion confirmation required'})
})
export const OriginalBatchSchema = z.object({items: z.array(OriginalOperationSchema).min(1).max(500)}).strict()
export type OriginalOperation = z.infer<typeof OriginalOperationSchema>
export type OriginalTarget = z.infer<typeof OriginalTargetSchema>
export type OriginalItem = OriginalOperation & {
  id: string
  state: 'pending' | 'running' | 'failed' | 'completed' | 'skipped'
  phase: 'pending' | 'prepared' | 'mutating' | 'published' | 'linked' | 'removed'
  bytes: number
  total: number
  error?: string
  source?: OriginalTarget
  sourcePath?: string
  version?: string
  digest?: string
  readyUpload?: boolean
  localLink?: boolean
  /** Hashes cover consecutive 8 MiB blocks (the final block may be shorter). */
  resume?: {sourceVersion: string; sourceSize: number; bytes: number; blocks: string[]}
  drive?: {fileId?: string; parentId: string; name: string; checksum?: string; sourceName?: string; etag?: string;
    uploadSession?: string; uploadBytes?: number; spoolVersion?: string}
  transfer?: {upload: OriginalItem; destination?: OriginalTarget; destinationVersion?: string}
}
export type OriginalJob = {
  id: string
  state: 'queued' | 'awaiting_upload' | 'running' | 'failed' | 'completed' | 'interrupted'
  createdAt: string
  items: OriginalItem[]
  connectionVersions?: Record<string, string>
}
