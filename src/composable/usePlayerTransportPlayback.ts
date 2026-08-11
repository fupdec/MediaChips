export interface PlaylistNavOptions {
  playlistMode: string[]
  playlistShuffle: number[]
  nowPlaying: number
  playlistLength: number
  direction: 'prev' | 'next'
}

/** Show the up-next card this many seconds before EOF. */
export const UP_NEXT_SECONDS = 5

export function isPlaylistNavDisabled({
  playlistMode,
  playlistShuffle,
  nowPlaying,
  playlistLength,
  direction,
}: PlaylistNavOptions): boolean {
  const isLoopMode = playlistMode.includes('loop')
  if (isLoopMode) return false

  if (playlistMode.includes('shuffle')) {
    const shuffleIndex = playlistShuffle.indexOf(nowPlaying)
    if (direction === 'prev') return shuffleIndex === 0
    return shuffleIndex + 1 >= playlistLength
  }

  if (direction === 'prev') return nowPlaying === 0
  return nowPlaying + 1 >= playlistLength
}

export function resolvePlaylistIndex({
  playlistMode,
  playlistShuffle,
  nowPlaying,
  playlistLength,
  direction,
}: PlaylistNavOptions): number | undefined {
  const isLoopMode = playlistMode.includes('loop')
  const isShuffle = playlistMode.includes('shuffle')

  if (isShuffle) {
    let shuffleIndex = playlistShuffle.indexOf(nowPlaying)
    shuffleIndex += direction === 'prev' ? -1 : 1

    if (isLoopMode) {
      if (shuffleIndex < 0) shuffleIndex = playlistLength - 1
      if (shuffleIndex >= playlistLength) shuffleIndex = 0
    }

    return playlistShuffle[shuffleIndex]
  }

  let index = nowPlaying + (direction === 'prev' ? -1 : 1)

  if (isLoopMode) {
    if (index < 0) index = playlistLength - 1
    if (index >= playlistLength) index = 0
  }

  return index
}

export function getRemainingPlaybackSeconds(currentTime: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return Number.POSITIVE_INFINITY
  if (!Number.isFinite(currentTime)) return duration
  return Math.max(0, duration - currentTime)
}

/** Timeline scrub preview is off in the same end window as the up-next card. */
export function shouldDisableTimelineHoverPreview(remainingSeconds: number): boolean {
  return remainingSeconds <= UP_NEXT_SECONDS
}

export function shouldShowUpNextPreview(input: {
  remainingSeconds: number
  hasNext: boolean
}): boolean {
  if (!input.hasNext) return false
  return input.remainingSeconds > 0 && input.remainingSeconds <= UP_NEXT_SECONDS
}
