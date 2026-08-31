<template>
  <v-btn-group variant="tonal"
      :density="density"
      rounded="xl"
      style="overflow: visible"
      dark
      class="mark-buttons px-0">
      <v-btn
        @click="toggleMarks"
        :color="player.marksVisible ? 'primary' : undefined"
        icon
        dark
      >
        <v-icon size="20" v-if="player.marksVisible">mdi-tooltip</v-icon>
        <v-icon size="20" v-else>mdi-tooltip-outline</v-icon>
        <div class="tip">
          <span class="mr-2">{{ t('player.marks_list') }}</span>
          <v-hotkey keys="i"/>
        </div>
      </v-btn>

      <v-btn
        @click="toggleStudioMode"
        :color="player.studioMode ? 'primary' : undefined"
        icon
        dark
      >
        <v-icon size="20">mdi-movie-open-edit-outline</v-icon>
        <div class="tip">
          <span class="mr-2">{{ t(player.studioMode ? 'player.studio_mode_on' : 'player.studio_mode') }}</span>
          <v-hotkey keys="shift+m"/>
          <span class="mx-1">·</span>
          <v-hotkey keys="1"/>
          ,
          <v-hotkey keys="2"/>
        </div>
      </v-btn>

      <v-btn
        @click="jumpToMark('prev')"
        :disabled="player.marks.length == 0"
        class="mark-prev"
        icon
        dark
      >
        <v-icon>mdi-chevron-left</v-icon>
        <div class="tip">
          <span class="mr-2">{{ t('player.previous_mark') }}</span>
          <v-hotkey keys="<"/>
        </div>
      </v-btn>

      <v-btn
        @click="jumpToMark('next')"
        :disabled="player.marks.length == 0"
        class="mark-next"
        icon
        dark
      >
        <v-icon>mdi-chevron-right</v-icon>
        <div class="tip">
          <span class="mr-2">{{ t('player.next_mark') }}</span>
          <v-hotkey keys=">"/>
        </div>
      </v-btn>
    </v-btn-group>

    <v-btn
      @click="togglePlaylist"
      variant="tonal"
      :density="density"
      :color="playerStore.playlistVisible ? 'primary' : undefined"
      class="playlist-buttons mx-1"
      icon
      dark
    >
      <v-icon v-if="playerStore.playlistVisible">mdi-view-list</v-icon>
      <v-icon v-else>mdi-format-list-bulleted</v-icon>
      <div class="tip">
        <span class="mr-2">{{ t('player.playlist') }}</span>
        <v-hotkey keys="p"/>
      </div>
    </v-btn>
</template>

<script setup lang="ts">
import {inject} from 'vue'
import {useI18n} from 'vue-i18n'
import {PLAYER_TRANSPORT_KEY} from '@/composable/playerTransportKey'

const {t} = useI18n()
const {
  player,
  playerStore,
  density,
  toggleMarks,
  toggleStudioMode,
  jumpToMark,
  togglePlaylist,
} = inject(PLAYER_TRANSPORT_KEY)!
</script>
