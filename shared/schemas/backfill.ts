import {z} from 'zod'

export const BackfillStatusSchema = z.object({
  total: z.number().optional(),
  pending: z.number().optional(),
  hashed: z.number().optional(),
  filled: z.number().optional(),
  modelStatus: z.string().optional(),
  model: z.string().optional(),
}).passthrough()

export type ParsedBackfillStatus = z.infer<typeof BackfillStatusSchema>
