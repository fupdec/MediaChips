import {z} from 'zod'

export const LocalAiStatusSchema = z.object({
  status: z.string(),
  model: z.string().optional(),
  path: z.string().optional(),
  message: z.string().optional(),
  enabled: z.boolean().optional(),
  downloaded: z.boolean().optional(),
  sizeMb: z.number().optional(),
  filename: z.string().optional(),
}).passthrough()

export const LocalAiDeleteResponseSchema = z.object({
  deleted: z.boolean(),
  status: LocalAiStatusSchema,
}).passthrough()

export const LocalAiSetEnabledRequestSchema = z.object({
  enabled: z.boolean(),
})

export const LocalAiChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
})

export const LocalAiChatRequestSchema = z.object({
  mode: z.string().optional(),
  locale: z.string().optional(),
  messages: z.array(LocalAiChatMessageSchema).optional(),
  context: z.unknown().optional(),
  system: z.string().optional(),
  toolCall: z.record(z.unknown()).optional(),
  confirmTool: z.boolean().optional(),
}).passthrough()

export type ParsedLocalAiStatus = z.infer<typeof LocalAiStatusSchema>
export type ParsedLocalAiDeleteResponse = z.infer<typeof LocalAiDeleteResponseSchema>
