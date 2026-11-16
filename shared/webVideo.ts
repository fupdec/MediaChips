import {z} from 'zod'

/** Only video pages, never arbitrary URLs or pasted HTML. */
export function normalizeXHamsterUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
    if (!/^(?:[a-z]{2}\.|www\.|m\.)?xhamster(?:\d+)?\.(?:com|desi|one)$/i.test(url.hostname)) return null
    const match = url.pathname.match(/^\/videos\/(?:[\w%-]+-)?([a-zA-Z0-9]+)\/?$/)
      || url.pathname.match(/^\/movies\/([a-zA-Z0-9]+)\/[^/]*\.html$/)
      || url.pathname.match(/^\/embed\/([a-zA-Z0-9]+)\/?$/)
    if (!match) return null
    // A stable identity across locale, title, tracking parameters and embed links.
    return `https://xhamster.com/videos/video-${match[1]}`
  } catch {
    return null
  }
}

/** Syntactic check shared with the UI. The server also validates resolved IP addresses. */
export function isPublicWebHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  return host.includes('.') && !host.includes(':') && !host.startsWith('[')
    && !/^[\d.]+$/.test(host)
    && !/(?:^|\.)(?:localhost|local|internal|lan|home|invalid|test)$/.test(host)
}

/** Keep video identifiers/query parameters; discard only known tracking and fragment data. */
export function normalizeWebVideoUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048 || /[\x00-\x1f\x7f]/.test(value)) return null
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !isPublicWebHostname(url.hostname)) return null
    const xhamster = normalizeXHamsterUrl(value)
    if (xhamster) return xhamster
    url.hash = ''
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_.+|fbclid|gclid|yclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key)
    }
    return url.href
  } catch {
    return null
  }
}

export function isWebVideoPath(path: unknown): boolean {
  return normalizeWebVideoUrl(path) !== null
}

export const WebVideoImportSchema = z.object({
  url: z.string().refine((value) => normalizeWebVideoUrl(value) !== null, 'Invalid public HTTPS video page URL'),
})

export const WebVideoPlayableSchema = z.object({
  url: z.string(),
  kind: z.enum(['mp4', 'hls']),
  title: z.string(),
  qualities: z.array(z.number().int().positive()).default([]),
  quality: z.number().int().positive().nullable().default(null),
  adaptive: z.boolean().default(false),
})

export const WebVideoPlaybackQuerySchema = z.object({
  quality: z.coerce.number().int().positive().max(16384).optional(),
  fresh: z.enum(['1']).optional(),
})

export const WebVideoFrameSchema = z.object({
  image: z.string().max(3_000_000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/),
  target: z.enum(['poster', 'mark']),
  markId: z.number().int().positive().optional(),
}).refine((data) => data.target !== 'mark' || data.markId != null, 'markId is required')

export type WebVideoPlayable = z.infer<typeof WebVideoPlayableSchema>
