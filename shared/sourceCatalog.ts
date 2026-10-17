import {z} from 'zod'

export const CatalogRootInputSchema = z.object({
  name: z.string().max(256).default(''),
  connectionId: z.string().min(1).max(100), rootKey: z.string().max(8192),
  intervalMinutes: z.number().int().min(0).max(525600).refine(n => n === 0 || n >= 15).default(0),
}).strict()
export type CatalogRootInput = z.infer<typeof CatalogRootInputSchema>
export type CatalogChange = {kind: 'new' | 'changed' | 'missing'; resourceKey: string; name: string; mediaId: number}
export type CatalogResult = {new: number; changed: number; missing: number; scanned: number; changes: CatalogChange[]; truncated: boolean}
export type CatalogRoot = CatalogRootInput & {id: string; lastCompletedAt: string | null; nextRunAt: number | null; lastResult: CatalogResult | null; lastError: string | null}
export type SourceJob = {id: string; kind: 'catalog' | 'offline'; targetId: string; state: 'running' | 'completed' | 'cancelled' | 'failed'; processed: number; result?: CatalogResult; error?: string}
export const OfflineLimitSchema = z.object({limitBytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)}).strict()
export type OfflineStatus = {state: 'absent' | 'ready' | 'stale'; size: number; version?: string; usedBytes: number; limitBytes: number}
