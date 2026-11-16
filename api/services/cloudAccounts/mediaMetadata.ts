import type {CloudProvider} from '../../../shared/cloudAccounts'

/** Technical fields supported by our library. Unavailable values remain absent. */
export type CloudMediaMetadata = {
  duration?: number
  width?: number
  height?: number
  bitrate?: number
  fps?: number
  codec?: string
  title?: string
  artist?: string
  album?: string
}
const positive = (value: unknown): number | undefined => {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : undefined
}
const text = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value.trim().slice(0, 1000) : undefined

export function cloudMediaMetadata(provider: CloudProvider, item: Record<string, any>): CloudMediaMetadata | undefined {
  const data = provider === 'gdrive' ? item.videoMediaMetadata || item.imageMediaMetadata
    : provider === 'onedrive' ? item.video || item.audio || item.image : item.media_info?.metadata
  if (!data) return undefined
  const milliseconds = positive(provider === 'gdrive' ? data.durationMillis : data.duration)
  const values: CloudMediaMetadata = {
    duration: milliseconds === undefined ? undefined : milliseconds / 1000,
    width: positive(data.width ?? data.dimensions?.width),
    height: positive(data.height ?? data.dimensions?.height),
    bitrate: positive(data.bitrate), fps: positive(data.frameRate),
    codec: text(data.fourCC || (!item.video && data.audioFormat)),
    title: text(data.title), artist: text(data.artist || data.albumArtist), album: text(data.album),
  }
  return Object.values(values).some(value => value !== undefined) ? values : undefined
}
