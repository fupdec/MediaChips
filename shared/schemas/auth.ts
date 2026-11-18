import { z } from 'zod'

export const AuthStatusSchema = z.object({
  required: z.boolean(),
  authenticated: z.boolean(),
  resetPath: z.string().optional(),
})

export const AuthLoginSchema = z.object({
  token: z.string(),
  required: z.boolean(),
})

export type ParsedAuthStatus = z.infer<typeof AuthStatusSchema>
export type ParsedAuthLogin = z.infer<typeof AuthLoginSchema>
