<template>
  <Teleport to="body">
    <svg
      v-if="spotlight.show"
      class="element-spotlight"
      :width="spotlight.viewportWidth"
      :height="spotlight.viewportHeight"
      :viewBox="`0 0 ${spotlight.viewportWidth} ${spotlight.viewportHeight}`"
      aria-hidden="true"
      @click="spotlight.dismiss()"
    >
      <defs>
        <mask :id="maskId">
          <rect
            x="0"
            y="0"
            :width="spotlight.viewportWidth"
            :height="spotlight.viewportHeight"
            fill="white"
          />
          <rect
            v-for="(hole, index) in spotlight.holes"
            :key="index"
            :x="hole.left"
            :y="hole.top"
            :width="hole.width"
            :height="hole.height"
            :rx="hole.radius"
            :ry="hole.radius"
            fill="black"
          />
        </mask>
      </defs>
      <rect
        x="0"
        y="0"
        :width="spotlight.viewportWidth"
        :height="spotlight.viewportHeight"
        :fill="`rgba(0, 0, 0, ${spotlight.opacity})`"
        :mask="`url(#${maskId})`"
      />
    </svg>
  </Teleport>
</template>

<script setup lang="ts">
import {onBeforeUnmount, onMounted} from 'vue'
import {useElementSpotlightStore} from '@/stores/elementSpotlight'

const SPOTLIGHT_Z_INDEX = 35000
const maskId = `element-spotlight-mask-${Math.random().toString(36).slice(2, 9)}`

const spotlight = useElementSpotlightStore()

const onKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && spotlight.show) {
    spotlight.dismiss()
  }
}

const onViewportChange = () => {
  if (!spotlight.show) return
  spotlight.refreshHoles()
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('resize', onViewportChange)
  window.addEventListener('scroll', onViewportChange, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('scroll', onViewportChange, true)
})
</script>

<style scoped>
.element-spotlight {
  position: fixed;
  inset: 0;
  z-index: v-bind(SPOTLIGHT_Z_INDEX);
  width: 100vw;
  height: 100vh;
  pointer-events: auto;
  cursor: default;
}
</style>
