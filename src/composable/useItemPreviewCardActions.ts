import {toValue, type MaybeRefOrGetter, type Ref} from 'vue'
import type {useVideoBigPreview} from '@/composable/useVideoBigPreview'
import type {MediaItem} from '@/types/stores'

/** Delay single-click play so a double-click can cancel and open the system player. */
export const PREVIEW_PLAY_CLICK_DELAY_MS = 220

export type PreviewPlayer = 'builtin' | 'system'

export function resolvePreviewPlayer(value: unknown): PreviewPlayer {
  return value === 'system' ? 'system' : 'builtin'
}

export type PreviewClickAction = 'ignore' | 'dismiss-big-preview' | 'play'

export type PreviewClickInput = {
  isCollapsing: boolean
  isShrinking: boolean
  isBigPreviewVisual: boolean
}

/**
 * Thumb / hover-video click always plays.
 * Browser-layout "inspect" stays on the card description, not the preview surface.
 */
export function resolvePreviewClickAction(input: PreviewClickInput): PreviewClickAction {
  if (input.isCollapsing || input.isShrinking) return 'ignore'
  if (input.isBigPreviewVisual) return 'dismiss-big-preview'
  return 'play'
}

export function resolveMediaClickAction(input: PreviewClickInput): PreviewClickAction {
  return resolvePreviewClickAction(input)
}

export type PreviewDblClickAction = 'ignore' | 'dismiss-big-preview' | 'play-system'

export function resolvePreviewDblClickAction(input: {
  isCollapsing: boolean
  isShrinking: boolean
  isBigPreviewVisual: boolean
}): PreviewDblClickAction {
  if (input.isCollapsing || input.isShrinking) return 'ignore'
  if (input.isBigPreviewVisual) return 'dismiss-big-preview'
  return 'play-system'
}

export type ItemPreviewCardActionsOptions = {
  media: MaybeRefOrGetter<MediaItem>
  playTime: MaybeRefOrGetter<number | undefined>
  isShrinking: MaybeRefOrGetter<boolean>
  isBigPreviewOpen: MaybeRefOrGetter<boolean>
  gridBigPreview: ReturnType<typeof useVideoBigPreview>
  bigPreviewMenuActive: Ref<boolean>
  stopPlayingPreview: (options?: {force?: boolean}) => void
  clearContextMenu: () => void
  playVideo: (payload: {
    video: MediaItem
    time?: number
    player?: 'default' | 'builtin' | 'system'
  }) => void
  syncMediaItem: (mediaId: number) => void
}

export function useItemPreviewCardActions(options: ItemPreviewCardActionsOptions) {
  let playClickTimer: ReturnType<typeof setTimeout> | undefined

  const clickInput = (): PreviewClickInput => ({
    isCollapsing: options.gridBigPreview.isCollapsing.value,
    isShrinking: toValue(options.isShrinking),
    isBigPreviewVisual: options.gridBigPreview.isVisual.value,
  })

  const clearPlayClickTimer = () => {
    if (!playClickTimer) return
    clearTimeout(playClickTimer)
    playClickTimer = undefined
  }

  const dismissBigPreview = () => {
    clearPlayClickTimer()
    options.clearContextMenu()
    options.bigPreviewMenuActive.value = false
    options.stopPlayingPreview()
  }

  const play = (player: 'default' | 'builtin' | 'system' | unknown = 'builtin') => {
    clearPlayClickTimer()
    // Always open the real player from an explicit thumb click / dblclick.
    options.stopPlayingPreview({force: true})
    const media = toValue(options.media)
    const playTime = toValue(options.playTime)
    options.playVideo({
      video: media,
      player: resolvePreviewPlayer(player),
      ...(playTime != null ? {time: playTime} : {}),
    })
  }

  const scheduleBuiltinPlay = () => {
    clearPlayClickTimer()
    playClickTimer = setTimeout(() => {
      playClickTimer = undefined
      play('builtin')
    }, PREVIEW_PLAY_CLICK_DELAY_MS)
  }

  const runClickAction = (action: PreviewClickAction) => {
    if (action === 'ignore') return
    if (action === 'dismiss-big-preview') {
      dismissBigPreview()
      return
    }
    scheduleBuiltinPlay()
  }

  const handlePreviewClick = () => {
    runClickAction(resolvePreviewClickAction(clickInput()))
  }

  const handleMediaClick = () => {
    runClickAction(resolveMediaClickAction(clickInput()))
  }

  const handlePreviewDblClick = () => {
    const action = resolvePreviewDblClickAction(clickInput())
    if (action === 'ignore') return
    if (action === 'dismiss-big-preview') {
      dismissBigPreview()
      return
    }
    play('system')
  }

  const handlePreviewBlur = () => {
    if (toValue(options.isBigPreviewOpen)) return
    clearPlayClickTimer()
    options.stopPlayingPreview()
  }

  const restartImageGeneration = () => {
    options.syncMediaItem(Number(toValue(options.media).id))
  }

  return {
    handlePreviewClick,
    handleMediaClick,
    handlePreviewDblClick,
    handlePreviewBlur,
    play,
    restartImageGeneration,
    clearPlayClickTimer,
  }
}
