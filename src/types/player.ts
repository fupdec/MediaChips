import type { ComputedRef, Ref } from 'vue'
import type { MediaItem } from './stores'
import type { MarkForVideo } from '@shared/api/responses'

export type PlayerMark = MarkForVideo & {
  thumb?: string
  'tag.icon'?: string
  'tag.color'?: string
}

export type MarkDisplayVariant = 'list' | 'timeline'

export interface PlayerControlsRef {
  resize?: () => void
  togglePause?: () => void
  prev?: () => void
  next?: () => void
  [key: string]: unknown
}

export interface PlayerMarksComponentRef {
  getThumbs?: () => Promise<void>
  [key: string]: unknown
}

export interface UsePlayerPlaybackOptions {
  isReady: Ref<boolean | null>
  videoPlayer: Ref<HTMLVideoElement | null>
  controls: Ref<PlayerControlsRef | null>
  marks: Ref<PlayerMarksComponentRef | null>
  isPlayerWindow: ComputedRef<boolean>
  updateItemVideo: (id: number | string, patch?: Record<string, unknown>) => void
  updatePlayerWindowTitle: (item: MediaItem) => void
}

export interface PlayVideoSwitch {
  n: MediaItem
  o: MediaItem | undefined
}

export interface ResolvedPlayableVideo {
  video: MediaItem
  index: number
}

export interface UsePlayerWindowBridgeOptions {
  onInvalidPlayData?: () => void
}

export interface PlayerWindowBridgeAttachOptions {
  onPlayVideo: (
    media: MediaItem,
    videos: MediaItem[],
    time?: number,
  ) => void | Promise<void>
  onStopPlaying: () => void | Promise<void>
}

export type PlayerTransportEmit = {
  (event: 'toggleFullscreen'): void
  (event: 'togglePictureInPicture'): void
  (event: 'play', payload: PlayVideoSwitch): void
  (event: 'changeVolume', payload: { deltaY?: number; volume?: number }): void
  (event: 'showControls'): void
  (event: 'addMark'): void
  (event: 'removeMark', mark: PlayerMark): void
  (event: 'close'): void
  (event: 'updateVideo', id: number | string): void
}
