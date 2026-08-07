export type GalleryPerfCounters = {
  mountedItems: number
  thumbInFlight: number
  regenInFlight: number
  regenQueued: number
  regenCompleted: number
}

export const galleryPerfCounters: GalleryPerfCounters = {
  mountedItems: 0,
  thumbInFlight: 0,
  regenInFlight: 0,
  regenQueued: 0,
  regenCompleted: 0,
}

export function bumpMountedItems(delta: number): void {
  galleryPerfCounters.mountedItems = Math.max(0, galleryPerfCounters.mountedItems + delta)
}

export function getGalleryPerfSnapshot(): GalleryPerfCounters {
  return {...galleryPerfCounters}
}

export function resetGalleryPerfCounters(): void {
  galleryPerfCounters.mountedItems = 0
  galleryPerfCounters.thumbInFlight = 0
  galleryPerfCounters.regenInFlight = 0
  galleryPerfCounters.regenQueued = 0
  galleryPerfCounters.regenCompleted = 0
}
