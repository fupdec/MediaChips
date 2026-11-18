<template>
  <v-btn @click="!player.webVideoLoading && togglePause()"
      :disabled="player.webVideoLoading"
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
        v-if="!isPrevDisabled"
        @click="prev()"
        @mouseenter="prevHover = true"
        @mouseleave="prevHover = false"
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
        v-if="!isNextDisabled"
        @click="next()"
        @mouseenter="nextHover = true"
        @mouseleave="nextHover = false"
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
      <span v-if="!player.timeRemain">{{ msToTime(player.currentTime) }}</span>
      <span v-else>- {{ msToTime(player.duration - player.currentTime) }}</span>
      <span class="mx-1">/</span>
      <span>{{ msToTime(player.duration) }}</span>
      <div
        v-html="t('player.controls.switch_time')"
        class="tip body-2"
        style="left: 0"
      />
    </v-btn>
</template>

<script setup lang="ts">
import {inject, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {PLAYER_TRANSPORT_KEY} from '@/composable/playerTransportKey'
import {usePlayerNeighborPreview} from '@/composable/usePlayerNeighborPreview'
import PlayerNeighborPreview from '@/components/app/player/PlayerNeighborPreview.vue'

const {t} = useI18n()
const {
  player,
  playerStore,
  density,
  isPrevDisabled,
  isNextDisabled,
  msToTime,
  togglePause,
  stop,
  prev,
  next,
} = inject(PLAYER_TRANSPORT_KEY)!

const {
  prevItem,
  nextItem,
  prevThumb,
  nextThumb,
} = usePlayerNeighborPreview()

const prevHover = ref(false)
const nextHover = ref(false)
</script>
