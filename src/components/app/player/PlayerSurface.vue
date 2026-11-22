<template>
  <div
    @mousedown="stopSmoothScroll($event)"
    @mousemove="moveOverPlayer"
    :class="{
      fullscreen: player.fullscreen,
      'no-cursor': !player.isControlsVisible,
      'player--window': isPlayerWindow,
    }"
    class="player"
    ref="player"
    id="player"
  >
    <SystemBarPlayer
      v-if="isPlayerWindow"
      v-show="!player.fullscreen"
    />

    <div
      class="player-body"
      :class="{
        'player-body--marks': player.marksVisible,
        'player-body--playlist': player.playlistVisible && player.playlist.length > 1,
      }"
    >
      <Marks
        @removeMark="removeMark"
        @editMark="editMark"
        :ref="setMarksRef"
      />

      <div class="player-main">
        <v-btn
          v-if="!isPlayerWindow && !player.fullscreen"
          @click="closePlayer"
          class="player-close-btn"
          variant="text"
          color="white"
          icon
        >
          <v-icon>mdi-close</v-icon>
        </v-btn>

        <div
          :ref="bindSurfaceEl"
          @click.capture="panClickCapture"
          @click="onSurfaceClick"
          @dblclick="onSurfaceDblClick"
          @click.middle="toggleFullscreen"
          @mousedown="clickOnVideo($event)"
          @pointerdown="onSurfacePointerDown($event); panPointerDown($event)"
          @pointermove="onSurfacePointerMove"
          @pointerup="onSurfacePointerUp"
          @pointercancel="onSurfacePointerCancel"
          @wheel="onVideoWheel"
          tabindex="-1"
          :class="{
            'playback-error': showPlaybackError,
            'audio-mode': isAudioMode,
            'video-wrapper--zoomed': playerStore.zoom > 1,
            'video-wrapper--panning': panning,
          }"
          class="video-wrapper"
        >
          <svg class="player-filter-defs" width="0" height="0" aria-hidden="true" focusable="false">
            <filter :id="PLAYER_GAMMA_FILTER_ID" color-interpolation-filters="sRGB">
              <feComponentTransfer>
                <feFuncR type="gamma" :exponent="gammaFilterExponent"/>
                <feFuncG type="gamma" :exponent="gammaFilterExponent"/>
                <feFuncB type="gamma" :exponent="gammaFilterExponent"/>
              </feComponentTransfer>
            </filter>
            <filter :id="PLAYER_SHARPEN_FILTER_ID" color-interpolation-filters="sRGB">
              <feConvolveMatrix order="3" :kernelMatrix="sharpenKernelMatrix" divisor="1" preserveAlpha="true"/>
            </filter>
          </svg>

          <video
            :ref="setVideoPlayerRef"
            :style="videoStyle"
            :class="{ 'audio-hidden': isAudioMode }"
            :autoplay="!player.usesLiveTranscode && !player.paused"
            :poster="videoPoster"
            preload="metadata"
            playsinline
          />

          <PlayerSubtitles v-if="!isAudioMode" :surface-height="surfaceSize.height"/>
          <PlayerAreaSelect v-if="!isAudioMode" :size="surfaceSize"/>

          <div v-if="isAudioMode && !showPlaybackError" class="audio-overlay">
            <v-img
              v-if="audioThumb"
              :src="audioThumb"
              class="audio-cover"
              cover
            />
            <div class="audio-info">
              <v-icon class="audio-icon" size="48">mdi-music-circle</v-icon>
              <div class="audio-title" :title="currentPlaying">{{ currentPlaying }}</div>
              <div
                v-if="audioMetaLine"
                class="audio-meta text-caption"
              >
                {{ audioMetaLine }}
              </div>
            </div>
          </div>

          <div v-if="showPlaybackError" class="video-error">
            <div class="video-error__message" role="alert">
              <div class="video-error__title">
                <v-icon size="20">mdi-alert-circle-outline</v-icon>
                {{ t('common.error') }}
              </div>
              <div class="video-error__filename" :title="currentPlaying" v-text="t('player.file') + ' ' + currentPlaying"></div>
              <div v-if="player.is_file_exists">
                {{ formatErrorMessage }}
                <div v-if="fileExtension" class="video-error__detail">
                  {{ t('player.error_extension', { ext: fileExtension }) }}
                </div>
                <div v-if="player.metadata.codec" class="video-error__detail">
                  {{ t('player.error_codec', { codec: player.metadata.codec }) }}
                </div>
              </div>
              <div v-else>{{ t('player.file_is_missing') }}</div>
            </div>
            <div class="video-error__actions">
              <v-btn v-if="player.isWebVideo && !player.webVideoLoading" @click.stop="reloadWebVideo({fresh: true})">
                <v-icon start>mdi-refresh</v-icon>
                <span>{{ t('player.controls.web_video_refresh') }}</span>
              </v-btn>
              <v-btn v-if="isNasMediaPath(player.media?.path) && nasDownloadUrl" :href="nasDownloadUrl"
                :download="currentPlaying" @click.stop>
                <v-icon start>mdi-download</v-icon>
                <span>{{ t('actions.download') }}</span>
              </v-btn>
              <v-btn v-if="driveViewUrl" @click.stop="openDrivePlayer">
                <v-icon start>mdi-google-drive</v-icon>
                <span>{{ t('drive.open_in_drive') }}</span>
              </v-btn>
              <v-btn
                v-if="player.is_file_exists && !isNasMediaPath(player.media?.path) && !isDriveMediaPath(player.media?.path) && !isCloudMediaPath(player.media?.path)"
                @click.stop="openPath"
              >
                <v-icon start>mdi-play-circle-outline</v-icon>
                <span>{{ t(isWebVideoPath(player.media?.path) ? 'media.adding.web_video_open' : 'actions.open_system_player') }}</span>
              </v-btn>
              <v-btn v-if="canPlayNext" @click.stop="nextVideo">
                <v-icon start>mdi-skip-next</v-icon>
                <span>{{ t('actions.play_next_video') }}</span>
              </v-btn>
            </div>
          </div>

          <div v-if="showTranscodeSpinner" class="transcode-spinner" role="status" aria-live="polite">
            <v-progress-circular
              indeterminate
              size="56"
              width="3"
              color="white"
            />
            <div v-if="remoteConnectionStatus" class="transcode-spinner__status">
              {{ remoteConnectionStatus }}
            </div>
          </div>

          <div
            v-show="player.displayStatusText"
            class="status-text"
            :class="{
              'status-text--timed': player.statusProgress != null,
              'status-text--title': player.statusLarge,
              'status-text--detailed': !!player.statusDetails,
              'status-text--captioned': !!player.statusSubtitleKey && player.statusProgress == null,
            }"
          >
            <div class="status-text__content">
              <v-icon
                v-if="player.displayStatusIcon && player.statusProgress == null"
                dark
                start
                :style="player.statusColor ? {color: player.statusColor} : undefined"
              >
                mdi-{{ player.displayStatusIcon }}
              </v-icon>
              <span class="status-text__label" :title="player.displayStatusText">
                {{ player.displayStatusText }}
              </span>
            </div>
            <div v-if="player.statusProgress != null" class="status-text__progress">
              <div
                class="status-text__progress-fill"
                :style="{width: `${player.statusProgress}%`}"
              />
            </div>
            <div v-if="player.statusDetails" class="status-text__details">
              {{ player.statusDetails }}
            </div>
            <div v-if="player.statusSubtitleKey" class="status-text__subtitle">
              {{ t(player.statusSubtitleKey) }}
            </div>
          </div>

          <Controls
            @toggleFullscreen="toggleFullscreen"
            @togglePictureInPicture="togglePictureInPicture"
            @play="playVideoObject($event)"
            @changeVolume="changeVolume($event)"
            @showControls="showControls"
            @addMark="openAddingMark"
            @saveMark="addMark($event)"
            @removeMark="removeMark"
            @close="closePlayer"
            @updateVideo="updateItemVideo"
            :ref="setControlsRef"
          />
        </div>
      </div>

      <Playlist @play="playVideoObject($event)"/>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed, inject, shallowRef} from 'vue'
import {useRemotePlaybackSpeed} from '@/composable/useRemotePlaybackSpeed'
import {useAppStore} from '@/stores/app'
import {resolveMediaThumbDisplayUrl} from '@/utils/thumbSource'
import {isWebVideoPath} from '@shared/webVideo'
import {isCloudMediaPath} from '@shared/cloudAccounts'
import {driveFileViewUrl, isDriveMediaPath} from '@shared/cloudDrive'
import {openExternal} from '@/services/shellService'
import {isNasMediaPath} from '@shared/remoteMedia'
import {useI18n} from 'vue-i18n'
import Controls from '@/components/app/player/Controls.vue'
import Playlist from '@/components/app/player/Playlist.vue'
import Marks from '@/components/app/player/Marks.vue'
import SystemBarPlayer from '@/components/app/SystemBarPlayer.vue'
import {PLAYER_SESSION_KEY} from '@/composable/usePlayerSession'
import {usePlayerSurfaceGestures} from '@/composable/usePlayerSurfaceGestures'
import {usePlayerVideoGeometry} from '@/composable/usePlayerVideoGeometry'
import {usePlayerVideoPan} from '@/composable/usePlayerVideoPan'
import {usePlayerAbLoop} from '@/composable/usePlayerAbLoop'
import {usePlayerEqualizer} from '@/composable/usePlayerEqualizer'
import PlayerSubtitles from '@/components/app/player/PlayerSubtitles.vue'
import PlayerAreaSelect from '@/components/app/player/PlayerAreaSelect.vue'
import {PLAYER_GAMMA_FILTER_ID, PLAYER_SHARPEN_FILTER_ID} from '@/utils/playerVideoFilters'
import {isTranscodeBusy} from '@/utils/playerTranscodeStatus'
import {isPlaylistNavDisabled} from '@/composable/usePlayerTransportPlayback'

const {t} = useI18n()
const session = inject(PLAYER_SESSION_KEY)!

const {
  player,
  playerStore,
  isPlayerWindow,
  videoPlayer,
  controls,
  marks,
  bindVideoElement,
  currentPlaying,
  isAudioMode,
  audioThumb,
  audioMetaLine,
  fileExtension,
  formatErrorMessage,
  showPlaybackError,
  closePlayer,
  stopSmoothScroll,
  moveOverPlayer,
  togglePause,
  toggleFullscreen,
  togglePictureInPicture,
  onVideoWheel,
  clickOnVideo,
  playVideoObject,
  changeVolume,
  showControls,
  openAddingMark,
  addMark,
  editMark,
  removeMark,
  openPath,
  nextVideo,
  reloadWebVideo,
  updateItemVideo,
} = session

const canPlayNext = computed(() => !isPlaylistNavDisabled({
  playlistMode: player.value.playlistMode,
  playlistShuffle: player.value.playlistShuffle,
  nowPlaying: player.value.nowPlaying,
  playlistLength: player.value.playlist.length,
  direction: 'next',
}))

const appStore = useAppStore()
const videoPoster = computed(() => {
  const media = player.value.media
  if (!media || isAudioMode.value) return undefined
  const thumb = player.value.playlist[player.value.nowPlaying]?.thumb
  if (thumb && !thumb.includes('unavailable.png')) return thumb
  return media.id > 0 ? resolveMediaThumbDisplayUrl(appStore.mediaPath, 'videos', media.id) || undefined : undefined
})
const nasDownloadUrl = computed(() => {
  const src = player.value.player?.src
  if (!src || !isNasMediaPath(player.value.media?.path)) return undefined
  const url = new URL(src, window.location.href)
  url.searchParams.set('download', '1')
  return url.href
})

const driveViewUrl = computed(() => driveFileViewUrl(player.value.media?.path))
async function openDrivePlayer() {
  if (driveViewUrl.value) await openExternal(driveViewUrl.value)
}

const showTranscodeSpinner = computed(() => !player.value.playbackError && (
  isTranscodeBusy(player.value) || player.value.webVideoLoading
  || ((player.value.isWebVideo || player.value.usesCopySource) && player.value.isStreamWaiting && !player.value.paused)
))

const remoteDownloadSpeed = useRemotePlaybackSpeed(
  computed(() => player.value.player),
  computed(() => player.value.active && (player.value.isWebVideo || player.value.usesCopySource)),
)
const remoteDownloadSpeedText = computed(() => {
  const speed = remoteDownloadSpeed.value
  if (speed == null) return ''
  const unit = speed >= 1024 * 1024 ? 'MB' : 'KB'
  const value = speed / (unit === 'MB' ? 1024 * 1024 : 1024)
  return `${value.toFixed(1)} ${unit}/s`
})

const remoteConnectionStatus = computed(() => {
  if (player.value.webVideoLoading) return t('player.remote_connecting')
  if ((player.value.isWebVideo || player.value.usesCopySource) && player.value.isStreamWaiting && !player.value.paused) {
    return t('player.remote_buffering') + (remoteDownloadSpeedText.value ? ` · ${remoteDownloadSpeedText.value}` : '')
  }
  return ''
})

const {
  setSurfaceEl,
  onPointerDown: onSurfacePointerDown,
  onPointerMove: onSurfacePointerMove,
  onPointerUp: onSurfacePointerUp,
  onPointerCancel: onSurfacePointerCancel,
  onClick: onSurfaceClick,
  onDblClick: onSurfaceDblClick,
} = usePlayerSurfaceGestures({
  playerStore,
  controls,
  togglePause,
  toggleFullscreen,
  showControls,
})

const surfaceEl = shallowRef<HTMLElement | null>(null)
const bindSurfaceEl = (el: unknown) => {
  surfaceEl.value = (el as HTMLElement | null) ?? null
  setSurfaceEl(el)
}
const {videoStyle, gammaFilterExponent, sharpenKernelMatrix, size: surfaceSize} = usePlayerVideoGeometry(playerStore, surfaceEl)
const {panning, onPointerDown: panPointerDown, onClickCapture: panClickCapture} = usePlayerVideoPan(playerStore, surfaceSize)
usePlayerAbLoop(playerStore)
usePlayerEqualizer(playerStore)

const setVideoPlayerRef = (el: unknown) => {
  const video = el as HTMLVideoElement | null
  videoPlayer.value = video
  bindVideoElement(video)
}

const setControlsRef = (el: unknown) => {
  controls.value = el as typeof controls.value
}

const setMarksRef = (el: unknown) => {
  marks.value = el as typeof marks.value
}
</script>
