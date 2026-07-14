/** At most one grid hover <video> may decode at a time. */

type StopFn = () => void

let activeMediaId: number | null = null
let activeStop: StopFn | null = null

export function claimHoverVideoPreview(mediaId: number, stop: StopFn): void {
  if (activeMediaId === mediaId) {
    activeStop = stop
    return
  }

  const previousStop = activeStop
  activeMediaId = mediaId
  activeStop = stop
  previousStop?.()
}

export function releaseHoverVideoPreview(mediaId: number): void {
  if (activeMediaId !== mediaId) return
  activeMediaId = null
  activeStop = null
}
