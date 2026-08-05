import {z} from 'zod'

export const PingResponseSchema = z.object({
  pong: z.union([z.number(), z.string()]).optional(),
  ip: z.string().optional(),
  port: z.union([z.number(), z.string()]).optional(),
  message: z.string().optional(),
}).passthrough()

export const ServerConfigSchema = z.object({
  appVersion: z.string().optional(),
  path: z.string().optional(),
  databases: z.array(z.unknown()).optional(),
  ip: z.string().optional(),
  port: z.union([z.number(), z.string()]).optional(),
  allowLanAccess: z.boolean().optional(),
  allowLanAccessEnvLocked: z.boolean().optional(),
  registration: z.string().optional(),
}).passthrough()

export const MachineIdSchema = z.string().min(1)

export type ParsedPingResponse = z.infer<typeof PingResponseSchema>
export type ParsedServerConfig = z.infer<typeof ServerConfigSchema>
