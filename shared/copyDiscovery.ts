import {z} from 'zod'
import type {CopyVerificationMethod} from './copyVerification'

export const CopyDiscoveryInputSchema = z.object({
  roots: z.array(z.object({connectionId: z.string().min(1).optional(), key: z.string().trim().max(4096), excluded: z.array(z.string().min(1)).max(256).optional()}).strict()).min(1).max(32),
  mediaId: z.number().int().positive().optional(),
}).strict()
export type CopyDiscoveryInput = z.infer<typeof CopyDiscoveryInputSchema>
export type CopyDiscoveryTrigger = 'import' | 'folder_update' | 'reconnect'
export type CopyDiscoveryState = 'queued' | 'discovering' | 'verifying' | 'paused' | 'completed' | 'cancelled' | 'failed'
export type CopyDiscoveryItemState = 'candidate' | 'checking' | 'attached' | 'unmatched' | 'ambiguous' | 'existing' | 'failed' | 'dismissed'
export type CopyDiscoveryItem = {
  id: string; path: string; name: string; size: number; version: string
  state: CopyDiscoveryItemState; candidateIds: number[]; mediaId: number | null; copyId: string | null; error: string | null
  candidates?: Array<{id: number; name: string | null; path: string}>
}
export type CopyDiscoveryJob = {
  triggers?: CopyDiscoveryTrigger[]
  id: string; state: CopyDiscoveryState; method: CopyVerificationMethod; roots: CopyDiscoveryInput['roots']
  mediaId: number | null; createdAt: string; updatedAt: string; error: string | null
  counts: Partial<Record<CopyDiscoveryItemState, number>>; total: number; items: CopyDiscoveryItem[]; truncated: boolean
}
