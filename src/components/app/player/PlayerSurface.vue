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
          size="x-small"
          icon
        >
          <v-icon>mdi-close</v-icon>
        </v-btn>

        <div
          :ref="setSurfaceEl"
          @click="onSurfaceClick"
          @dblclick="onSurfaceDblClick"
          @click.middle="toggleFullscreen"
          @mousedown="clickOnVideo($event)"
          @pointerdown="onSurfacePointerDown"
          @pointermove="onSurfacePointerMove"
          @pointerup="onSurfacePointerUp"
          @pointercancel="onSurfacePointerCancel"
          @wheel="onVideoWheel"
          tabindex="-1"
          :class="{
            'playback-error': showPlaybackError,
            'audio-mode': isAudioMode,
          }"
          class="video-wrapper"
        >
          <video
            :ref="setVideoPlayerRef"
            :class="{ 'audio-hidden': isAudioMode }"
            :autoplay="!player.usesLiveTranscode && !player.paused"
            :poster="videoPoster"
            preload="metadata"
            playsinline
          />

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
            <v-alert color="error" variant="text">
              <v-icon size="24" color="error" left>mdi-alert</v-icon>
              {{ t('common.error') }}:
              <div class="filename" v-text="t('player.file') + ' ' + currentPlaying"></div>
              <div v-if="player.is_file_exists">
                {{ formatErrorMessage }}
                <div v-if="fileExtension" class="error-detail">
                  {{ t('player.error_extension', { ext: fileExtension }) }}
                </div>
                <div v-if="player.metadata.codec" class="error-detail">
                  {{ t('player.error_codec', { codec: player.metadata.codec }) }}
                </div>
              </div>
              <div v-else>{{ t('player.file_is_missing') }}</div>
            </v-alert>
            <v-btn v-if="player.isWebVideo && !player.webVideoLoading" @click.stop="reloadWebVideo({fresh: true})"
              class="mt-4 mr-2" color="primary" rounded>
              <v-icon left>mdi-refresh</v-icon>
              <span>{{ t('player.controls.web_video_refresh') }}</span>
            </v-btn>
            <v-btn v-if="isNasMediaPath(player.media?.path) && nasDownloadUrl" :href="nasDownloadUrl"
              :download="currentPlaying" @click.stop class="mt-4 mr-2" color="primary" rounded>
              <v-icon left>mdi-download</v-icon>
              <span>{{ t('actions.download') }}</span>
            </v-btn>
            <v-btn v-if="driveViewUrl" @click.stop="openDrivePlayer" class="mt-4 mr-2" color="primary" rounded>
              <v-icon left>mdi-google-drive</v-icon>
              <span>{{ t('drive.open_in_drive') }}</span>
            </v-btn>
            <v-btn
              v-if="player.is_file_exists && !isNasMediaPath(player.media?.path) && !isDriveMediaPath(player.media?.path) && !isCloudMediaPath(player.media?.path)"
              @click.stop="openPath"
              class="mt-4"
              color="primary"
              rounded
            >
              <v-icon left>mdi-play-circle-outline</v-icon>
              <span>{{ t(isWebVideoPath(player.media?.path) ? 'media.adding.web_video_open' : 'actions.open_system_player') }}</span>
            </v-btn>
            <v-btn v-if="canPlayNext" @click.stop="nextVideo" class="mt-4 ml-2" color="primary" rounded>
              <v-icon left>mdi-skip-next</v-icon>
              <span>{{ t('actions.play_next_video') }}</span>
            </v-btn>
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
            }"
          >
            <div class="status-text__content">
              <v-icon
                v-if="player.displayStatusIcon && player.statusProgress == null"
                dark
                start
              >
                mdi-{{ player.displayStatusIcon }}
              </v-icon>
              {{ player.displayStatusText }}
            </div>
            <div v-if="player.statusProgress != null" class="status-text__progress">
              <div
                class="status-text__progress-fill"
                :style="{width: `${player.statusProgress}%`}"
              />
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
import {computed, inject} from 'vue'
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
  || (player.value.isWebVideo && player.value.isStreamWaiting && !player.value.paused)
))

const remoteDownloadSpeed = useRemotePlaybackSpeed(
  computed(() => player.value.player),
  computed(() => player.value.active && player.value.isWebVideo),
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
  if (player.value.isWebVideo && player.value.isStreamWaiting && !player.value.paused) {
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
