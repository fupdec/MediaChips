<template>
  <div @click="jumpTo"
       @mouseover="playerStore.is_mark_hover = true"
       @mouseleave="playerStore.is_mark_hover = false"
       class="mark"
       :class="{'mark--range': !!mark.end, 'mark--muted': mutedColors}"
       :style="`${position}--mark-color-raw:${color};`"
  >
    <div v-if="mark.end" :style="timeline_width" class="timeline"></div>

    <div class="mark-dot" @mouseenter="clampTooltip">
      <v-icon :color="colorMetaIcon" class="mark-dot__icon" size="11">
        mdi-{{ dotIcon }}
      </v-icon>
    </div>

    <v-sheet ref="tooltipRef" :style="tooltipStyle" class="tooltip text-caption text-center pa-0">
      <v-img :src="thumb ?? undefined" class="thumb" cover height="100%" width="100%">
        <div v-if="mark.type !== 'favorite'" class="mark-name">
          <span class="mark-name__swatch"/>
          <div class="name">
            <span v-if="mark.type === 'meta'" v-html="sanitizeInlineHtml(mark['tag.name'] || mark.tag?.name)"/>
            <span v-else-if="mark.text" v-html="sanitizeInlineHtml(mark.text)" :title="mark.text"/>
            <span v-else v-html="sanitizeInlineHtml(mark.name)"/>
          </div>
        </div>

        <div class="mark-actions">
          <v-btn
            @click.stop="edit"
            class="mark-action"
            size="x-small"
            variant="text"
            icon
          >
            <v-icon size="16">mdi-pencil</v-icon>
          </v-btn>
          <v-btn
            @click.stop="remove"
            class="mark-action mark-action--danger"
            size="x-small"
            variant="text"
            icon
          >
            <v-icon size="16">mdi-delete</v-icon>
          </v-btn>
        </div>

        <div class="time" v-html="time"/>
      </v-img>
    </v-sheet>
  </div>
</template>

<script setup lang="ts">
import {sanitizeInlineHtml} from '@/utils/sanitizeHtml'
import {computed, ref} from 'vue'
import {usePlayerMark} from '@/composable/usePlayerMark'
import {applyPlayerEdgeShift} from '@/utils/playerEdgeClamp'
import {getMarkListIcon} from '@/composable/playerMarkDisplay'
import {useSettingsStore} from '@/stores/settings'
import type {PlayerMark} from '@/types/player'

const props = defineProps<{
  mark: PlayerMark
  controls_width: number
}>()

const emit = defineEmits<{
  removeMark: [mark: PlayerMark]
}>()

const {
  playerStore,
  thumb,
  color,
  colorMetaIcon,
  time,
  position,
  timeline_width,
  tooltipStyle,
  jumpTo,
  edit,
  remove,
} = usePlayerMark(props, emit)

const settingsStore = useSettingsStore()
// Same switch as the muted tag colors on media cards.
const mutedColors = computed(() => settingsStore.mute_card_tag_colors !== '0')

const dotIcon = computed(() => getMarkListIcon(props.mark))

const tooltipRef = ref<{$el?: HTMLElement} | null>(null)
const clampTooltip = () => applyPlayerEdgeShift(tooltipRef.value?.$el)

</script>
