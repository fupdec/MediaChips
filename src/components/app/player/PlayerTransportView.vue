<template>
  <v-btn-group variant="tonal"
      :density="density"
      rounded="xl"
      style="overflow: visible"
      dark
      class="px-0 mr-2">
      <v-btn @click="emit('toggleFullscreen')" icon dark>
        <v-icon v-if="player.fullscreen">mdi-fullscreen-exit</v-icon>
        <v-icon v-else>mdi-fullscreen</v-icon>
        <div class="tip">
          <span
            class="mr-2"
            v-html="player.fullscreen ? t('player.controls.exit_fullscreen') : t('player.controls.fullscreen')"
          />
          <v-hotkey keys="f"/>
        </div>
      </v-btn>

      <v-btn
        v-if="!isAudioMode"
        @click="emit('togglePictureInPicture')"
        class="toggle-picture-in-picture"
        icon
        dark
      >
        <v-icon size="20">mdi-picture-in-picture-bottom-right</v-icon>
        <div class="tip" v-html="t('player.controls.picture_in_picture')"/>
      </v-btn>
    </v-btn-group>

    <v-btn-group @wheel.prevent="handleVolumeWheel"
      variant="tonal"
      :density="density"
      rounded="xl"
      style="overflow: visible"
      dark
      class="volume px-0">
      <v-btn @click="toggleMute" icon dark>
        <v-icon>mdi-{{ volumeIcon }}</v-icon>
        <div class="tip">
          <span class="mr-2" v-html="t('player.controls.mute')"/>
          <v-hotkey keys="m"/>
        </div>
      </v-btn>
      <v-slider
        v-model="displayVolume"
        @wheel.prevent.stop="handleVolumeSliderWheel"
        class="volume-slider ma-0 pl-2 pr-6"
        color="white"
        width="100"
        min="0"
        step="0.05"
        max="1"
        track-size="1"
        hide-details
      />
    </v-btn-group>
</template>

<script setup lang="ts">
import {computed, inject} from 'vue'
import {useI18n} from 'vue-i18n'
import {PLAYER_TRANSPORT_KEY} from '@/composable/playerTransportKey'

const {t} = useI18n()
const {
  player,
  playerStore,
  isAudioMode,
  density,
  volumeIcon,
  toggleMute,
  handleVolumeWheel,
  handleVolumeSliderWheel,
  emit,
} = inject(PLAYER_TRANSPORT_KEY)!

const displayVolume = computed({
  get: () => playerStore.muted ? 0 : playerStore.volume,
  set: (volume: number) => {
    playerStore.volume = volume
    if (volume > 0) playerStore.muted = false
  },
})
</script>
