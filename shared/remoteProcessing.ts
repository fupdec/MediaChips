import {z} from 'zod'
export const RemoteProcessingInputSchema = z.object({mediaId: z.number().int().positive(), kind: z.enum(['transcode', 'storyboard', 'frame']),
  seconds: z.number().min(0).max(86400).default(0), intervalSeconds: z.number().min(1).max(3600).default(10)}).strict()
export type RemoteProcessingInput = z.infer<typeof RemoteProcessingInputSchema>
export type RemoteProcessingJob = {id: string; mediaId: number; kind: RemoteProcessingInput['kind']; state: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'; error?: string; resultUrl?: string}
