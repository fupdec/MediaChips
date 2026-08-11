<template>
  <v-btn @click="togglePause"
      icon
      variant="tonal"
      :density="density"
      dark>
      <v-icon v-if="player.paused" large>mdi-play</v-icon>
      <v-icon v-else large>mdi-pause</v-icon>
      <div class="tip" style="left: 0">
        <span class="mr-2"
          v-html="player.paused ? t('player.controls.play') : t('player.controls.pause')"/>
        <v-hotkey keys="Space"/>
      </div>
    </v-btn>

    <v-btn-group variant="tonal"
      :density="density"
      style="overflow: visible"
      rounded="xl"
      dark
      class="px-0 ml-3 neighbor-nav">
      <v-btn
        @click="prev"
        @mouseenter="prevHover = true"
        @mouseleave="prevHover = false"
        :disabled="isPrevDisabled"
        class="neighbor-nav__btn neighbor-nav__btn--prev"
        icon
        dark
      >
        <v-icon>mdi-skip-previous</v-icon>
        <div class="tip tip--keys" :class="{'tip--suppressed': prevHover && prevItem}">
          <span class="mr-2" v-html="t('player.controls.previous')"/>
          <v-hotkey keys="z"/>
          {{ t('common.or') }}
          <v-hotkey keys="alt+left"/>
        </div>
        <Transition name="neighbor-preview-pop">
          <PlayerNeighborPreview
            v-if="prevItem && prevHover"
            :item="prevItem"
            :thumb="prevThumb"
            :label="t('player.controls.previous')"
            class="neighbor-preview--anchor-prev"
          />
        </Transition>
      </v-btn>

      <v-btn @click="stop" icon dark>
        <v-icon>mdi-stop</v-icon>
        <div class="tip">
          <span class="mr-2" v-html="t('player.controls.stop')"/>
          <v-hotkey keys="x"/>
        </div>
      </v-btn>

      <v-btn
        @click="next"
        @mouseenter="nextHover = true"
        @mouseleave="nextHover = false"
        :disabled="isNextDisabled"
        class="neighbor-nav__btn neighbor-nav__btn--next"
        icon
        dark
      >
        <v-icon>mdi-skip-next</v-icon>
        <div class="tip tip--keys" :class="{'tip--suppressed': nextHover && nextItem}">
          <span class="mr-2" v-html="t('player.controls.next')"/>
          <v-hotkey keys="c"/>
          {{ t('common.or') }}
          <v-hotkey keys="alt+right"/>
        </div>
        <Transition name="neighbor-preview-pop">
          <PlayerNeighborPreview
            v-if="nextItem && nextHover"
            :item="nextItem"
            :thumb="nextThumb"
            :label="t('player.controls.next')"
            class="neighbor-preview--anchor-next"
          />
        </Transition>
      </v-btn>
    </v-btn-group>

    <v-btn
      @click="player.timeRemain = !player.timeRemain"
      class="time px-2 mx-1 body-2"
      variant="tonal"
      :density="density"
      rounded
      small
      dark
    >
      <div v-if="!player.timeRemain">{{ msToTime(player.currentTime) }}</div>
      <div v-else>- {{ msToTime(player.duration - player.currentTime) }}</div>
      <span class="mx-1">/</span>
      <div>{{ msToTime(player.duration) }}</div>
      <div
        v-html="t('player.controls.switch_time')"
        class="tip body-2"
        style="left: 0"
      />
    </v-btn>

    <div class="speed">
      <v-menu
        attach=".speed"
        nudge-top="45"
        nudge-left="10"
        min-width="120"
        top
      >
        <template #activator="{ props: menuProps }">
          <v-btn v-bind="menuProps"
            icon
            variant="tonal"
            :density="density"
            dark>
            <v-icon>mdi-play-speed</v-icon>
            <div class="tip" v-html="t('player.playback_speed_label')"/>
          </v-btn>
        </template>

        <v-list density="compact" class="py-1">
          <v-list-item
            v-for="speed in speeds"
            :key="speed"
            :value="speed"
            :active="player.speed === speed"
            color="primary"
            @click="changeSpeed(speed)"
          >
            <v-list-item-title v-text="speed == 1 ? t('common.normal') : speed"/>
          </v-list-item>
        </v-list>
      </v-menu>
    </div>

    <div
      v-if="showTranscodeMenu"
      class="transcode-quality ml-1"
    >
      <v-menu
        attach=".transcode-quality"
        nudge-top="45"
        nudge-left="10"
        min-width="160"
        top
      >
        <template #activator="{ props: menuProps }">
          <v-btn v-bind="menuProps"
            icon
            variant="tonal"
            :density="density"
            dark>
            <v-icon>{{ playerStore.liveTranscodeDisabled ? 'mdi-video-off' : 'mdi-high-definition-box' }}</v-icon>
            <div class="tip" v-html="t('player.controls.transcode_quality')"/>
          </v-btn>
        </template>

        <v-list density="compact" class="py-1">
          <v-list-item
            :active="playerStore.liveTranscodeDisabled"
            color="primary"
            @click="disableLiveTranscode"
          >
            <v-list-item-title v-text="t('player.controls.transcode_off')"/>
          </v-list-item>
          <v-list-item
            v-for="height in transcodeHeights"
            :key="height"
            :value="height"
            :active="!playerStore.liveTranscodeDisabled && playerStore.liveTranscodeMaxHeight === height"
            color="primary"
            @click="changeTranscodeMaxHeight(height)"
          >
            <v-list-item-title v-text="transcodeQualityLabel(height)"/>
          </v-list-item>
        </v-list>
      </v-menu>
    </div>
</template>

<script setup lang="ts">
import {computed, inject, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {PLAYER_TRANSPORT_KEY} from '@/composable/playerTransportKey'
import {usePlayerNeighborPreview} from '@/composable/usePlayerNeighborPreview'
import PlayerNeighborPreview from '@/components/app/player/PlayerNeighborPreview.vue'

const {t} = useI18n()
const {
  player,
  playerStore,
  speeds,
  transcodeHeights,
  density,
  isPrevDisabled,
  isNextDisabled,
  isAudioMode,
  msToTime,
  togglePause,
  stop,
  prev,
  next,
  changeSpeed,
  transcodeQualityLabel,
  changeTranscodeMaxHeight,
  disableLiveTranscode,
} = inject(PLAYER_TRANSPORT_KEY)!

const {
  prevItem,
  nextItem,
  prevThumb,
  nextThumb,
} = usePlayerNeighborPreview()

const prevHover = ref(false)
const nextHover = ref(false)

const showTranscodeMenu = computed(() => (
  !isAudioMode.value
  // Only while live is active, or after the user turned it off (so they can re-enable).
  // Do not show for direct play just because fallback is offerable — that looked like
  // "already transcoding".
  && (playerStore.usesLiveTranscode || playerStore.liveTranscodeDisabled)
))
</script>
