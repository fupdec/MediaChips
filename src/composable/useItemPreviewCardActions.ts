import {toValue, type MaybeRefOrGetter, type Ref} from 'vue'
import type {useVideoBigPreview} from '@/composable/useVideoBigPreview'
import type {MediaItem} from '@/types/stores'

/** Delay single-click play so a double-click can open the system player instead. */
export const PREVIEW_PLAY_CLICK_DELAY_MS = 220

export type PreviewPlayer = 'default' | 'builtin' | 'system'

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

export function resolvePreviewKeyAction(input: {
  key: string
  isCollapsing: boolean
  isBigPreviewVisual: boolean
}): PreviewClickAction {
  if (input.key !== 'Escape') return 'ignore'
  if (input.isCollapsing || !input.isBigPreviewVisual) return 'ignore'
  return 'dismiss-big-preview'
}

export function resolvePreviewPlayer(player: unknown): PreviewPlayer {
  if (player === 'system' || player === 'default' || player === 'builtin') return player
  return 'builtin'
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
    player?: PreviewPlayer
  }) => void
  syncMediaItem: (mediaId: number) => void
}

export function useItemPreviewCardActions(options: ItemPreviewCardActionsOptions) {
  let playClickTimer: ReturnType<typeof setTimeout> | undefined

  const clearPlayClickTimer = () => {
    if (playClickTimer == null) return
    clearTimeout(playClickTimer)
    playClickTimer = undefined
  }

  const clickInput = (): PreviewClickInput => ({
    isCollapsing: options.gridBigPreview.isCollapsing.value,
    isShrinking: toValue(options.isShrinking),
    isBigPreviewVisual: options.gridBigPreview.isVisual.value,
  })

  const dismissBigPreview = () => {
    clearPlayClickTimer()
    options.clearContextMenu()
    options.bigPreviewMenuActive.value = false
    options.stopPlayingPreview()
  }

  const play = (player?: unknown) => {
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

  const schedulePlay = (player: PreviewPlayer = 'builtin') => {
    clearPlayClickTimer()
    playClickTimer = setTimeout(() => {
      playClickTimer = undefined
      play(player)
    }, PREVIEW_PLAY_CLICK_DELAY_MS)
  }

  const runClickAction = (action: PreviewClickAction, event?: MouseEvent) => {
    if (action === 'ignore') return
    if (action === 'dismiss-big-preview') {
      dismissBigPreview()
      return
    }
    // Second click of a double-click — wait for dblclick handler.
    if (event && event.detail > 1) return
    schedulePlay('builtin')
  }

  const handlePreviewClick = (event?: MouseEvent) => {
    runClickAction(resolvePreviewClickAction(clickInput()), event)
  }

  const handleMediaClick = (event?: MouseEvent) => {
    runClickAction(resolveMediaClickAction(clickInput()), event)
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

  const handlePreviewKeydown = (event: KeyboardEvent) => {
    const action = resolvePreviewKeyAction({
      key: event.key,
      isCollapsing: options.gridBigPreview.isCollapsing.value,
      isBigPreviewVisual: options.gridBigPreview.isVisual.value,
    })
    if (action === 'ignore') return
    event.preventDefault()
    event.stopPropagation()
    runClickAction(action)
  }

  const handlePreviewBlur = () => {
    if (toValue(options.isBigPreviewOpen)) return
    options.stopPlayingPreview()
  }

  const restartImageGeneration = () => {
    options.syncMediaItem(Number(toValue(options.media).id))
  }

  return {
    handlePreviewClick,
    handleMediaClick,
    handlePreviewDblClick,
    handlePreviewKeydown,
    handlePreviewBlur,
    play,
    restartImageGeneration,
  }
}
