<template>
  <div class="player-settings ml-1">
    <v-menu
      v-model="menuOpen"
      attach=".player-settings"
      location="top"
      :offset="8"
      :close-on-content-click="false"
      content-class="player-menu-card"
      min-width="340"
    >
      <template #activator="{ props: menuProps }">
        <v-btn v-bind="menuProps"
          :density="density"
          :class="{'player-settings__btn--speed': player.speed !== 1}"
          variant="tonal"
          icon
          dark
        >
          <span v-if="player.speed !== 1" class="player-settings__speed">{{ player.speed }}×</span>
          <v-icon v-else>mdi-tune-variant</v-icon>
          <div class="tip" :class="{'tip--suppressed': menuOpen}">{{ t('player.settings') }}</div>
        </v-btn>
      </template>

      <!-- The wheel scrolls the menu; without .stop it would bubble to the surface and change the volume. -->
      <div class="player-menu player-menu--settings" @wheel.stop>
        <PlayerPictureSections @close="menuOpen = false"/>
        <v-divider v-if="!isAudioMode" class="player-menu__divider"/>

        <section class="player-menu__section">
          <div class="player-menu__label">{{ t('player.playback_speed_label') }}</div>
          <div class="player-menu__chips">
            <button
              v-for="speed in speeds"
              :key="speed"
              @click="changeSpeed(speed)"
              :class="{'is-active': player.speed === speed}"
              type="button"
              class="player-menu__chip"
            >{{ speed === 1 ? t('common.normal') : `${speed}×` }}</button>
          </div>
        </section>

        <section v-if="audioTracks.length > 1" class="player-menu__section">
          <div class="player-menu__label">{{ t('player.controls.audio_track') }}</div>
          <div class="player-menu__chips">
            <button
              v-for="track in audioTracks"
              :key="`a${track.id}`"
              @click="selectTrack('aid', track.id)"
              :class="{'is-active': track.selected}"
              type="button"
              class="player-menu__chip"
            >{{ labelOf(track) }}</button>
          </div>
        </section>

        <section v-if="subtitleTracks.length > 0" class="player-menu__section">
          <div class="player-menu__label">{{ t('player.controls.subtitle_track') }}</div>
          <div class="player-menu__chips">
            <button
              @click="selectTrack('sid', 'no')"
              :class="{'is-active': !subtitleTracks.some(track => track.selected)}"
              type="button"
              class="player-menu__chip"
            >{{ t('player.controls.track_off') }}</button>
            <button
              v-for="track in subtitleTracks"
              :key="`s${track.id}`"
              @click="selectTrack('sid', track.id)"
              :class="{'is-active': track.selected}"
              type="button"
              class="player-menu__chip"
            >{{ labelOf(track) }}</button>
          </div>
        </section>

        <section v-if="showWebQuality" class="player-menu__section">
          <div class="player-menu__label">{{ t('player.controls.web_video_quality') }}</div>
          <div class="player-menu__chips">
            <button
              @click="changeWebVideoQuality(null)"
              :class="{'is-active': player.webVideoQuality == null}"
              type="button"
              class="player-menu__chip"
            >{{ t('player.controls.web_video_quality_auto') }}</button>
            <button
              v-for="height in player.webVideoQualities"
              :key="height"
              @click="changeWebVideoQuality(height)"
              :class="{'is-active': player.webVideoQuality === height}"
              type="button"
              class="player-menu__chip"
            >{{ height }}p</button>
          </div>
        </section>

        <section v-if="showTranscodeMenu" class="player-menu__section">
          <div class="player-menu__label">{{ t('player.controls.transcode_quality') }}</div>
          <div class="player-menu__chips">
            <button
              @click="disableLiveTranscode"
              :class="{'is-active': playerStore.liveTranscodeDisabled}"
              type="button"
              class="player-menu__chip"
            >{{ t('player.controls.transcode_off') }}</button>
            <button
              v-for="height in transcodeHeights"
              :key="height"
              @click="changeTranscodeMaxHeight(height)"
              :class="{'is-active': !playerStore.liveTranscodeDisabled && playerStore.liveTranscodeMaxHeight === height}"
              type="button"
              class="player-menu__chip"
            >{{ transcodeQualityLabel(height) }}</button>
          </div>
        </section>

        <v-list v-if="showRefresh || showPip" density="compact" class="player-menu__list">
          <v-list-item
            v-if="showRefresh"
            @click="refresh"
            :title="t('player.controls.web_video_refresh')"
            prepend-icon="mdi-refresh"
          />
          <v-list-item
            v-if="showPip"
            @click="pip"
            :title="t('player.controls.picture_in_picture')"
            class="toggle-picture-in-picture"
            prepend-icon="mdi-picture-in-picture-bottom-right"
          />
        </v-list>
      </div>
    </v-menu>
  </div>
</template>

<script setup lang="ts">
import {computed, inject, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {PLAYER_TRANSPORT_KEY} from '@/composable/playerTransportKey'
import PlayerPictureSections from '@/components/app/player/PlayerPictureSections.vue'
import {fetchNativeTracks, selectNativeTrack, type NativeTrack} from '@/services/nativePlayer'
import {audioTracksOf, subtitleTracksOf, trackLabel} from '@/utils/mpvTracks'
const {t} = useI18n()
const menuOpen = ref(false)
const {
  player,
  playerStore,
  speeds,
  transcodeHeights,
  density,
  isAudioMode,
  isWebVideo,
  changeSpeed,
  changeWebVideoQuality,
  refreshWebVideo,
  transcodeQualityLabel,
  changeTranscodeMaxHeight,
  disableLiveTranscode,
  emit,
} = inject(PLAYER_TRANSPORT_KEY)!

const showWebQuality = computed(() => (
  isWebVideo.value && !player.value.webVideoLoading && player.value.webVideoQualities.length > 1
))
const showRefresh = computed(() => isWebVideo.value && !player.value.webVideoLoading)
// Native mpv draws below the web layer, so the browser's picture-in-picture is not available.
const showPip = computed(() => !isAudioMode.value && !playerStore.nativeEngine)
const showTranscodeMenu = computed(() => (
  !isAudioMode.value
  && !isWebVideo.value
  // Only while live is active, or after the user turned it off (so they can re-enable).
  && (playerStore.usesLiveTranscode || playerStore.liveTranscodeDisabled)
))

// Native mpv knows the file's audio and subtitle tracks; read them whenever the menu opens.
const nativeTracks = ref<NativeTrack[]>([])
const audioTracks = computed(() => playerStore.nativeEngine ? audioTracksOf(nativeTracks.value) : [])
const subtitleTracks = computed(() => playerStore.nativeEngine ? subtitleTracksOf(nativeTracks.value) : [])
const refreshTracks = async () => { nativeTracks.value = await fetchNativeTracks() }
watch(menuOpen, open => { if (open && playerStore.nativeEngine) void refreshTracks() })
const labelOf = (track: NativeTrack) => trackLabel(track, id => t('player.controls.track_number', {n: id}))
const selectTrack = (kind: 'aid' | 'sid', id: number | 'no') => {
  selectNativeTrack(kind, id)
  // mpv applies the change asynchronously; read the list again once it has.
  setTimeout(() => { void refreshTracks() }, 200)
}

const refresh = () => {
  menuOpen.value = false
  refreshWebVideo()
}
const pip = () => {
  menuOpen.value = false
  emit('togglePictureInPicture')
}
</script>
