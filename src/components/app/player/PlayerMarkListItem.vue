<template>
  <div
    @click="selectable ? emit('toggleSelect', mark) : jumpTo(mark.time)"
    class="mark-item"
    :class="{'mark-item--selectable': selectable, 'mark-item--selected': selected}"
    :style="{'--mark-accent': getColor(mark)}"
  >
    <v-checkbox-btn
      v-if="selectable"
      :model-value="selected"
      class="mark-item__select"
      @click.stop="emit('toggleSelect', mark)"
    />

    <div class="mark-item__thumb-wrap">
      <v-img
        v-if="isThumbsLoaded"
        :src="mark.thumb ?? undefined"
        :aspect-ratio="16 / 9"
        class="mark-item__thumb"
        cover
      />
      <v-skeleton-loader v-else type="image" class="mark-item__thumb"/>
    </div>

    <div class="mark-item__info">
      <div class="mark-item__label">
        <v-icon :color="getColor(mark)" size="x-small" class="mr-1">mdi-{{ getIcon(mark) }}</v-icon>
        <span
          v-if="mark.type == 'meta'"
          class="mark-item__name"
          v-tooltip="playerTooltip(markLabel)"
          v-html="mark['tag.name'] || mark.tag?.name"
        />
        <span
          v-else-if="mark.text"
          class="mark-item__name"
          v-tooltip="playerTooltip(markLabel)"
          v-html="mark.text"
        />
        <span
          v-else
          class="mark-item__name"
          v-tooltip="playerTooltip(markLabel)"
          v-html="mark.name"
        />
      </div>
      <div class="mark-item__meta">
        <span class="mark-item__time">
          {{ getDuration(mark.time) }}<template v-if="mark.end"> – {{ getDuration(mark.end) }}</template>
        </span>
      </div>
    </div>

    <div v-if="!selectable" class="mark-item__actions">
      <v-btn
        v-tooltip="playerTooltip(t('common.delete'))"
        @click.stop="remove(mark)"
        class="mark-item__delete"
        variant="text"
        color="error"
        size="x-small"
        icon
      >
        <v-icon size="small">mdi-delete-outline</v-icon>
      </v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import type {PlayerMark} from '@/types/player'
import {playerTooltip} from '@/utils/playerOverlay'

const props = defineProps<{
  mark: PlayerMark
  isThumbsLoaded?: boolean
  getIcon: (mark: PlayerMark) => string
  getColor: (mark: PlayerMark) => string
  getDuration: (time: number) => string
  jumpTo: (time: number) => void
  remove: (mark: PlayerMark) => void
  selectable?: boolean
  selected?: boolean
}>()

const emit = defineEmits<{
  toggleSelect: [mark: PlayerMark]
}>()

const {t} = useI18n()

const markLabel = computed(() => {
  if (props.mark.type == 'meta') {
    return String(props.mark['tag.name'] || props.mark.tag?.name || '')
  }
  return String(props.mark.text || props.mark.name || '')
})
</script>
