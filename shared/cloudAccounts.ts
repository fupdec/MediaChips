import {z} from 'zod'

export const CloudProviderSchema = z.enum(['gdrive', 'onedrive', 'dropbox'])
export type CloudProvider = z.infer<typeof CloudProviderSchema>
export const CloudKeySchema = z.string().min(1).max(2048).refine(v => !/[\x00-\x1f\x7f]/.test(v))
export const CloudAccountInputSchema = z.object({
  provider: CloudProviderSchema, name: z.string().trim().min(1).max(120),
  clientId: z.string().trim().min(1).max(1024), clientSecret: z.string().max(4096).optional(),
  redirectUri: z.string().url().max(2048).refine(v => {
    const u = new URL(v)
    return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password && !u.search && !u.hash
      // Google accounts may share the main Drive client and its callback.
      && ['/api/cloud-accounts/oauth/callback', '/api/drive/oauth/callback'].includes(u.pathname)
  }),
}).strict()
export type CloudAccountInput = z.infer<typeof CloudAccountInputSchema>
export type CloudAccount = {id: string; provider: CloudProvider; name: string; authenticated: boolean; redirectUri: string}
export const cloudMediaPath = (provider: CloudProvider, connectionId: string, key: string) =>
  `${CloudProviderSchema.parse(provider)}://${z.string().uuid().parse(connectionId)}/${encodeURIComponent(CloudKeySchema.parse(key))}`
export function parseCloudMediaPath(value: unknown): {provider: CloudProvider; connectionId: string; resourceKey: string} | null {
  if (typeof value !== 'string') return null
  const match = /^(gdrive|onedrive|dropbox):\/\/([0-9a-f-]{36})\/([^?#/]+)$/i.exec(value)
  if (!match) return null
  try {
    return {provider: CloudProviderSchema.parse(match[1]), connectionId: z.string().uuid().parse(match[2]),
      resourceKey: CloudKeySchema.parse(decodeURIComponent(match[3]))}
  } catch { return null }
}
export const isCloudMediaPath = (value: unknown) => parseCloudMediaPath(value) !== null

/** Persisted card fields; reading this snapshot never contacts a cloud provider. */
export type CloudMediaMetadataSnapshot = {
  id: number
  path: string
  filesize: number
  width: number
  height: number
  duration: number
  bitrate: number
  fps: number
  codec: string | null
  orientation?: number
  thumbnailState?: 'pending' | 'ready' | 'unavailable'
  thumbnailVersion?: number
  title?: string | null
  artist?: string | null
  album?: string | null
}
