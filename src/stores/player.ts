import { defineStore } from 'pinia'
import { getReadableDuration } from '@/services/formatUtils'
import {
  getAbsoluteBufferedRanges,
  getAbsolutePlaybackTime,
} from '@/utils/playerBuffer'
import type { MediaItem, PlayerPlaylistItem } from '@/types/stores'
import type { PlayerMark } from '@/types/player'
import {isRemoteMediaPath} from '@shared/remoteMedia'
import { playlistItemKey } from '@/utils/mediaItem'
import type { PlayerAspectMode } from '@/utils/playerAspect'
import type { PlayerRotation } from '@/utils/playerVideoGeometry'
import { createDefaultPlayerFilters, type PlayerVideoFilters } from '@/utils/playerVideoFilters'
import { createAbLoop, type AbLoop } from '@/utils/playerAbLoop'
import type { SubtitleTrack } from '@shared/subtitles'

type TimeoutHandle = ReturnType<typeof setTimeout>
type IntervalHandle = ReturnType<typeof setInterval>

export const usePlayerStore = defineStore('player', {
  state: () => ({
    player: null as HTMLVideoElement | null,
    active: false,
    fullscreen: false,
    statusText: '',
    statusIcon: '',
    statusSubtitleKey: null as string | null,
    statusProgress: null as number | null,
    statusLarge: false,
    backgroundStatusText: '',
    backgroundStatusIcon: '',
    statusTimeout: -1 as TimeoutHandle | number,
    playlistVisible: false,
    marksVisible: false,
    mouseOverControls: false,
    isControlsVisible: true,
    keyboardBlockers: {} as Record<string, boolean>,

    usesLiveTranscode: false,
    liveTranscodeStarted: false,
    liveTranscodeMediaId: null as number | null,
    liveTranscodeMaxHeight: '1080',
    /** Current media can use live transcode (unsupported format / container layout). */
    liveTranscodeOfferable: false,
    /** User turned live transcode off for this playback session. */
    liveTranscodeDisabled: false,
    liveStreamSeekHandler: null as ((time: number) => void) | null,
    liveStreamOffset: 0,
    bufferedRanges: [] as Array<{ start: number; end: number }>,
    isLiveStreamSeeking: false,
    isStreamWaiting: false,
    webVideoLoading: false,
    cancelRemoteLoadHandler: null as (() => void) | null,
    resumeRemoteLoadHandler: null as (() => void) | null,
    webVideoQualities: [] as number[],
    webVideoQuality: null as number | null,
    webVideoAdaptive: false,
    webVideoFrameReady: false,

    duration: 1,
    volume: 1,
    speed: 1,
    /** Display aspect ratio override; remembered per library file, see usePlayerVideoGeometry. */
    aspectMode: 'auto' as PlayerAspectMode,
    /** Picture orientation; remembered per library file like aspectMode. */
    rotation: 0 as PlayerRotation,
    flipH: false,
    flipV: false,
    /** Zoom 1-4 and pan in px; session only, reset when another media starts. */
    /** A-B loop points in seconds; cleared when another media starts. */
    abLoop: createAbLoop() as AbLoop,
    /** External subtitle files of the current local video, see usePlayerSubtitles. */
    subtitleTracks: [] as SubtitleTrack[],
    /** File name of the shown track; null = subtitles off. */
    subtitleTrackName: null as string | null,
    /** Seconds; positive shows the subtitles later. Resets with the media. */
    subtitleDelay: 0,
    /** Text size factor, remembered between sessions. */
    subtitleScale: 1,
    /** "Zoom to area" mode: the next drag over the picture selects the area to zoom into. */
    areaSelecting: false,
    /** Equalizer gains in dB, one per band of PLAYER_EQ_BANDS; global, see usePlayerEqualizer. */
    equalizerGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] as number[],
    zoom: 1,
    panX: 0,
    panY: 0,
    /** Colour adjustments; kept between files of one playback session, reset when the player closes. */
    videoFilters: createDefaultPlayerFilters() as PlayerVideoFilters,
    muted: false,
    paused: false,
    currentTime: 0,
    currentTimeTimeout: -1 as IntervalHandle | number,
    seekTime: 0,
    seeking: false,
    playbackError: false,
    transcodeStatus: 'none' as string,
    transcodeError: null as string | null,
    timeRemain: false,
    media: null as MediaItem | null,
    progress_hover: null as number | null,
    is_mark_hover: false,
    metadata: {} as Record<string, unknown>,
    is_file_exists: false,
    isAudioMode: false,

    nowPlaying: 0,
    playlist: [] as PlayerPlaylistItem[],
    playlistShuffle: [] as number[],
    playlistMode: ['autoplay'] as string[],

    marks: [] as PlayerMark[],
    mediaWindowTitle: '',

    studioMode: false,
    trimMode: false,
    trimStart: 0,
    trimEnd: 0,
    trimBusy: false,
    selectedMarkId: null as number | null,
    markDraft: null as { id: number; time: number; end: number | null } | null,
    creatingMarkDraft: null as { time: number; end: number } | null,
    studioSnapTime: null as number | null,
  }),
  getters: {
    isLibraryMedia(state): boolean {
      return Number(state.media?.id) > 0
    },
    isWebVideo(state): boolean {
      return isRemoteMediaPath(state.media?.path)
    },
    isKeyboardBlocked(state): boolean {
      return Object.keys(state.keyboardBlockers).length > 0
    },
    displayStatusText(state): string {
      return state.statusText || state.backgroundStatusText
    },
    displayStatusIcon(state): string {
      return state.statusIcon || state.backgroundStatusIcon
    },
  },
  actions: {
    setKeyboardBlocked(reason: string, blocked: boolean) {
      if (blocked) {
        this.keyboardBlockers = { ...this.keyboardBlockers, [reason]: true }
      } else {
        const next = { ...this.keyboardBlockers }
        delete next[reason]
        this.keyboardBlockers = next
      }
    },
    trackCurrentTime() {
      clearInterval(this.currentTimeTimeout as IntervalHandle)
      let timeout = 100
      if (this.duration > 200) timeout = 1000
      this.currentTimeTimeout = setInterval(() => {
        this.syncPlaybackState()
      }, timeout)
    },
    syncPlaybackState() {
      if (!this.player || this.webVideoLoading || this.playbackError) return

      this.currentTime = getAbsolutePlaybackTime({
        usesLiveTranscode: this.usesLiveTranscode,
        liveStreamOffset: this.liveStreamOffset,
        playerCurrentTime: this.player.currentTime,
      })

      this.bufferedRanges = getAbsoluteBufferedRanges(
        this.player,
        this.usesLiveTranscode ? this.liveStreamOffset : 0,
      )
    },
    playerPlay() {
      if (this.resumeRemoteLoadHandler) {
        this.resumeRemoteLoadHandler()
        return
      }
      if (!this.player || this.webVideoLoading) return
      const video = this.player
      const source = video.src
      void video.play().catch(() => {
        if (this.player !== video || video.src !== source) return
        this.paused = video.paused
        if (this.paused) clearInterval(this.currentTimeTimeout as IntervalHandle)
      })
      this.paused = false
      this.showTimedStatus(this.currentTime, {subtitleKey: 'player.controls.play', icon: 'play'})
      this.trackCurrentTime()
    },
    playerPause() {
      if (!this.player || this.webVideoLoading) return
      this.player.pause()
      this.paused = true
      this.showTimedStatus(this.currentTime, {subtitleKey: 'player.controls.pause', icon: 'pause'})
      clearInterval(this.currentTimeTimeout as IntervalHandle)
    },
    playerStop() {
      if (this.webVideoLoading) {
        this.cancelRemoteLoadHandler?.()
        this.showTimedStatus(0, {subtitleKey: 'player.controls.stop', icon: 'stop'})
        return
      }
      if (!this.player) return
      this.player.pause()
      this.paused = true
      this.bufferedRanges = []
      clearInterval(this.currentTimeTimeout as IntervalHandle)

      if (this.usesLiveTranscode && this.liveStreamSeekHandler) {
        this.currentTime = 0
        this.liveStreamSeekHandler(0)
        this.showTimedStatus(0, {subtitleKey: 'player.controls.stop', icon: 'stop'})
        return
      }

      this.player.currentTime = 0
      this.currentTime = 0
      this.showTimedStatus(0, {subtitleKey: 'player.controls.stop', icon: 'stop'})
    },
    /** `silent` skips the on-screen position status, e.g. for the A-B loop wrapping around. */
    playerJumpTo(time: number, { silent = false }: { silent?: boolean } = {}) {
      if (!this.player || this.webVideoLoading || !Number.isFinite(time)) return
      if (time < 0) time = 0
      else if (time > this.duration) time = this.duration

      if (this.usesLiveTranscode && this.liveStreamSeekHandler) {
        this.liveStreamSeekHandler(time)
        this.currentTime = time
        if (!silent) this.showSeekStatus(time)
        return
      }

      this.player.currentTime = time
      this.currentTime = time
      if (!silent) this.showSeekStatus(time)
    },
    showSeekStatus(time: number) {
      this.showTimedStatus(time, {icon: 'arrow-u-down-right'})
    },
    showTimedStatus(
      time: number,
      {
        subtitleKey = null,
        icon = '',
      }: {
        subtitleKey?: string | null
        icon?: string
      } = {},
    ) {
      const current = getReadableDuration(time)
      const duration = getReadableDuration(this.duration)
      const progress = this.duration > 0 ? (time / this.duration) * 100 : 0
      this.changePlayerStatusText({
        text: `${current} / ${duration}`,
        icon,
        subtitleKey,
        progress,
      })
    },
    changePlayerStatusText({
      text,
      icon,
      subtitleKey = null,
      progress = null,
      large = false,
    }: {
      text: string
      icon: string
      subtitleKey?: string | null
      progress?: number | null
      large?: boolean
    }) {
      clearTimeout(this.statusTimeout as TimeoutHandle)
      this.statusText = text
      this.statusIcon = icon
      this.statusSubtitleKey = subtitleKey
      this.statusProgress = progress
      this.statusLarge = large
      this.statusTimeout = setTimeout(() => {
        this.statusText = ''
        this.statusIcon = ''
        this.statusSubtitleKey = null
        this.statusProgress = null
        this.statusLarge = false
      }, 3000)
    },
    setBackgroundStatus({ text, icon }: { text: string; icon: string }) {
      this.backgroundStatusText = text
      this.backgroundStatusIcon = icon
    },
    clearBackgroundStatus() {
      this.backgroundStatusText = ''
      this.backgroundStatusIcon = ''
    },
    setPlaylistItems(videos: MediaItem[] | null | undefined, { host = '' }: { host?: string } = {}) {
      const currentKey = this.playlist[this.nowPlaying]?.key
      const currentId = this.playlist[this.nowPlaying]?.id
      this.playlist = (videos || []).map((item, index) => ({
        ...item,
        key: playlistItemKey(item, index),
        thumb: item.thumb?.startsWith?.('http')
          ? item.thumb
          : (item.thumb ? `${host}${item.thumb}` : '/images/unavailable.png'),
      }))

      if (currentKey != null) {
        const nextIndex = this.playlist.findIndex((item) => item.key === currentKey)
        if (nextIndex >= 0) {
          this.nowPlaying = nextIndex
          return
        }
      }

      if (currentId != null) {
        const nextIndex = this.playlist.findIndex((item) => item.id === currentId)
        if (nextIndex >= 0) this.nowPlaying = nextIndex
      }
    },
  },
})

export default usePlayerStore
