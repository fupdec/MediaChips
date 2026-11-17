<template>
  <div v-if="visible" class="timeline-ab-loop" aria-hidden="true">
    <div v-if="loop.b != null" class="timeline-ab-loop__range" :style="rangeStyle"/>
    <div class="timeline-ab-loop__tick" :style="{left: `${aPercent}%`}"><span>A</span></div>
    <div v-if="loop.b != null" class="timeline-ab-loop__tick" :style="{left: `${bPercent}%`}"><span>B</span></div>
  </div>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {usePlayerStore} from '@/stores/player'

const player = usePlayerStore()
const loop = computed(() => player.abLoop)

const visible = computed(() => (
  loop.value.a != null && player.duration > 0 && !player.trimMode && !player.studioMode
))
const toPercent = (seconds: number | null) => (
  seconds == null || !(player.duration > 0)
    ? 0
    : Math.min(100, Math.max(0, seconds / player.duration * 100))
)
const aPercent = computed(() => toPercent(loop.value.a))
const bPercent = computed(() => toPercent(loop.value.b))
const rangeStyle = computed(() => ({
  left: `${aPercent.value}%`,
  width: `${Math.max(0, bPercent.value - aPercent.value)}%`,
}))
</script>
