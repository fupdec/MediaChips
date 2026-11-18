<template>
  <div
    v-if="subtitleHtml"
    :style="{fontSize: `${fontSize}px`}"
    class="player-subtitles"
    aria-live="off"
  >
    <span class="player-subtitles__text" v-html="subtitleHtml"/>
  </div>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {usePlayerStore} from '@/stores/player'
import {usePlayerSubtitles} from '@/composable/usePlayerSubtitles'

const playerStore = usePlayerStore()
const {subtitleHtml} = usePlayerSubtitles(playerStore)

/** Scales with the player's height, so the text stays readable in fullscreen and in a small window. */
const props = defineProps<{ surfaceHeight: number }>()
const fontSize = computed(() => Math.max(12, Math.round(props.surfaceHeight * 0.045 * playerStore.subtitleScale)))
</script>
