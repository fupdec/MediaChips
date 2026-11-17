<template>
  <div
    class="media-thumb-placeholder"
    :class="`media-thumb-placeholder--${type}`"
    aria-hidden="true"
  >
    <v-icon class="media-thumb-placeholder__icon" :icon="icon" />
    <span v-if="label" class="media-thumb-placeholder__label">{{ label }}</span>
  </div>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import path from 'path-browserify'

// Card tile for media without a thumbnail — same calm look as the tag card
// initials tile (see `.tag-thumb-placeholder`), with a type icon instead.
const props = withDefaults(defineProps<{
  type: 'image' | 'video' | 'audio'
  /** Source file path; its extension is shown as a small caption. */
  filePath?: string | null
}>(), {
  filePath: null,
})

const ICONS = {
  image: 'mdi-image-outline',
  video: 'mdi-movie-open-outline',
  audio: 'mdi-music-note-outline',
} as const

const icon = computed(() => ICONS[props.type])

const label = computed(() => {
  const ext = path.extname(String(props.filePath ?? '')).replace('.', '')
  return /^[a-z0-9]{1,5}$/i.test(ext) ? ext.toUpperCase() : ''
})
</script>

<style scoped>
.media-thumb-placeholder {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  overflow: hidden;
  user-select: none;
  background:
    radial-gradient(circle at 30% 20%, rgba(var(--v-theme-primary), 0.14), transparent 60%),
    rgba(var(--v-theme-on-surface), 0.06);
}

.media-thumb-placeholder__icon {
  font-size: 3.4em;
  color: rgba(var(--v-theme-primary), 0.35);
}

.media-thumb-placeholder__label {
  font-size: 0.7em;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: rgba(var(--v-theme-on-surface), 0.4);
}
</style>
