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
        'player-body--playlist': player.playlistVisible,
      }"
    >
      <Marks
        @removeMark="removeMark"
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
          @click="togglePause"
          @dblclick="toggleFullscreen"
          @click.middle="toggleFullscreen"
          @mousedown="clickOnVideo($event)"
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
            :autoplay="!player.usesLiveTranscode"
          />

          <div v-if="isAudioMode && !showPlaybackError" class="audio-overlay">
            <v-img
              :src="audioThumb"
              class="audio-cover"
              cover
            />
            <div class="audio-info">
              <v-icon class="audio-icon" size="48">mdi-music-circle</v-icon>
              <div class="audio-title" :title="currentPlaying">{{ currentPlaying }}</div>
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
            <v-btn
              v-if="player.is_file_exists"
              @click.stop="openPath"
              class="mt-4"
              color="primary"
              rounded
            >
              <v-icon left>mdi-play-circle-outline</v-icon>
              <span>{{ t('actions.open_system_player') }}</span>
            </v-btn>
            <v-btn @click.stop="nextVideo" class="mt-4 ml-2" color="primary" rounded>
              <v-icon left>mdi-skip-next</v-icon>
              <span>{{ t('actions.play_next_video') }}</span>
            </v-btn>
          </div>

          <div v-if="!reg && player.nowPlaying > 14" class="reg-block">
            <div class="mb-2">{{ t('registration.application_not_registered') }}</div>
            <div class="caption">
              {{ t('registration.unregistered_playlist_limit') }}
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
            @removeMark="removeMark"
            @close="closePlayer"
            @updateVideo="updateItemVideo"
            :ref="setControlsRef"
          />
        </div>
      </div>

      <Playlist @play="playVideoObject($event)"/>
    </div>

    <DialogMarkAdding
      v-if="dialogsStore.markAdding.show"
      @togglePause="togglePause"
      @addMark="addMark($event)"
    />
  </div>
</template>

<script setup lang="ts">
import {inject} from 'vue'
import {useI18n} from 'vue-i18n'
import Controls from '@/components/app/player/Controls.vue'
import Playlist from '@/components/app/player/Playlist.vue'
import Marks from '@/components/app/player/Marks.vue'
import SystemBarPlayer from '@/components/app/SystemBarPlayer.vue'
import DialogMarkAdding from '@/components/dialogs/DialogMarkAdding.vue'
import {PLAYER_SESSION_KEY} from '@/composable/usePlayerSession'

const {t} = useI18n()
const session = inject(PLAYER_SESSION_KEY)!

const {
  player,
  dialogsStore,
  isPlayerWindow,
  reg,
  videoPlayer,
  controls,
  marks,
  bindVideoElement,
  currentPlaying,
  isAudioMode,
  audioThumb,
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
  removeMark,
  openPath,
  nextVideo,
  updateItemVideo,
} = session

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
