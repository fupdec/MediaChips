<template>
  <v-theme-provider theme="dark">
    <aside
      v-show="playerStore.playlistVisible"
      class="player-sidebar player-sidebar--playlist"
    >
      <div class="player-sidebar__header">
        <v-icon size="small" class="player-sidebar__header-icon">mdi-format-list-bulleted</v-icon>
        <div class="player-sidebar__header-text">
          <span class="player-sidebar__title">{{ t('player.playlist') }}</span>
          <span class="player-sidebar__subtitle" v-text="title"/>
        </div>
        <v-spacer/>
        <v-btn
          @click="player.playlistVisible = false"
          variant="text"
          icon
          size="small"
          density="comfortable"
        >
          <v-icon size="small">mdi-close</v-icon>
        </v-btn>
      </div>

      <div class="player-sidebar__modes">
        <v-btn-toggle
          v-model="player.playlistMode"
          color="primary"
          class="player-sidebar__mode-toggle"
          multiple
          rounded="pill"
          density="compact"
          variant="outlined"
        >
          <v-btn value="loop" :title="t('player.playlist_modes.loop')" size="small">
            <v-icon size="small">mdi-sync</v-icon>
          </v-btn>
          <v-btn value="autoplay" :title="t('player.playlist_modes.autoplay')" size="small">
            <v-icon size="small">mdi-play-pause</v-icon>
          </v-btn>
          <v-btn value="shuffle" :title="t('player.playlist_modes.shuffle')" size="small">
            <v-icon size="small">mdi-shuffle-variant</v-icon>
          </v-btn>
        </v-btn-toggle>
      </div>

      <div class="player-sidebar__body" id="scroller">
        <template v-if="player.playlist.length > 0">
          <PlaylistItem
            v-for="(item, index) in player.playlist"
            @play="play(index)"
            :video="item"
            :index="index"
            :key="item.key || `clip-${item.markId || item.id}-${index}`"
          />
        </template>

        <div v-else class="player-sidebar__empty">
          <v-icon size="40" color="medium-emphasis">mdi-playlist-remove</v-icon>
          <span>{{ t('playlists.no_videos_added') }}</span>
        </div>
      </div>
    </aside>
  </v-theme-provider>
</template>

<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import {usePlayerPlaylist} from '@/composable/usePlayerPlaylist'
import PlaylistItem from '@/components/app/player/PlaylistItem.vue'
import type { PlayVideoSwitch } from '@/types/player'

const emit = defineEmits<{
  play: [payload: PlayVideoSwitch]
}>()
const {t} = useI18n()

const {
  playerStore,
  player,
  title,
  play,
} = usePlayerPlaylist({emit})
</script>
