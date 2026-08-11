<template>
  <div
    class="neighbor-preview"
    :class="[
      `neighbor-preview--${variant}`,
      {'neighbor-preview--clickable': clickable},
    ]"
    role="group"
    @click.stop="onClick"
  >
    <div class="neighbor-preview__media">
      <img
        v-if="thumb"
        :src="thumb"
        :alt="title"
        class="neighbor-preview__thumb"
        loading="lazy"
        decoding="async"
      >
      <div v-else class="neighbor-preview__placeholder">
        <v-icon size="36" color="white">mdi-movie-open-outline</v-icon>
      </div>

      <div class="neighbor-preview__shade"/>

      <div class="neighbor-preview__badge">
        <v-icon
          v-if="variant === 'up-next'"
          size="14"
          start
        >
          mdi-skip-next
        </v-icon>
        {{ label }}
        <span
          v-if="variant === 'up-next' && countdown != null"
          class="neighbor-preview__countdown"
        >
          {{ countdown }}
        </span>
      </div>

      <div
        v-if="durationLabel"
        class="neighbor-preview__duration"
      >
        {{ durationLabel }}
      </div>
    </div>

    <div class="neighbor-preview__meta">
      <div
        class="neighbor-preview__title"
        :title="title"
      >
        {{ title }}
      </div>
      <div
        v-if="variant === 'up-next'"
        class="neighbor-preview__hint"
      >
        {{ hint }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {getReadableDuration} from '@/services/formatUtils'
import {getSegmentEnd, getSegmentStart} from '@/utils/mediaItem'
import type {MediaItem} from '@/types/stores'

const props = withDefaults(defineProps<{
  item: MediaItem
  thumb?: string | null
  label: string
  variant?: 'hover' | 'up-next'
  remainingSeconds?: number | null
  clickable?: boolean
}>(), {
  thumb: null,
  variant: 'hover',
  remainingSeconds: null,
  clickable: false,
})

const emit = defineEmits<{
  select: []
}>()

const {t} = useI18n()

const title = computed(() => props.item.name || props.item.basename || '')

const durationLabel = computed(() => {
  const start = getSegmentStart(props.item)
  const end = getSegmentEnd(props.item)
  if (start != null && end != null) {
    return getReadableDuration(Math.max(0, end - start))
  }
  if (props.item.duration) return getReadableDuration(Number(props.item.duration))
  return ''
})

const countdown = computed(() => {
  if (props.remainingSeconds == null) return null
  return `${Math.max(1, Math.ceil(props.remainingSeconds))}s`
})

const hint = computed(() => t('player.controls.up_next_hint'))

const onClick = () => {
  if (!props.clickable) return
  emit('select')
}
</script>
