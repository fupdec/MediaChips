import { z } from 'zod'

export const PlayableInfoSchema = z.object({
  mode: z.string().optional(),
  url: z.string().optional(),
  transcodeRequired: z.boolean().optional(),
  transcodeEnabled: z.boolean().optional(),
  transcodeStatus: z.string().optional(),
  streamPlayback: z.boolean().optional(),
  remuxCopy: z.boolean().optional(),
  progress: z.number().optional(),
  error: z.unknown().nullable().optional(),
  reason: z.string().optional(),
  playability: z.unknown().optional(),
})

export const TranscodeCacheStatsSchema = z.object({
  bytes: z.number().optional(),
  files: z.number().optional(),
  entries: z.number().optional(),
  removed: z.number().optional(),
})

export const LiveTranscodeStopSchema = z.object({
  stopped: z.boolean(),
})

export type PlayableInfo = z.infer<typeof PlayableInfoSchema>
export type TranscodeCacheStats = z.infer<typeof TranscodeCacheStatsSchema>
export type LiveTranscodeStopResult = z.infer<typeof LiveTranscodeStopSchema>
