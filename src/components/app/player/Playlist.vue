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

      <div class="player-sidebar__body" :style="bodyStyle">
        <div ref="stickyEl" class="player-sidebar__sticky">
          <v-chip
            v-if="similarRadioActive"
            v-tooltip="playerTooltip(t('player.similar_radio_stop'))"
            class="player-sidebar__radio-chip"
            color="primary"
            variant="tonal"
            size="small"
            closable
            close-icon="mdi-stop"
            @click:close="onStopRadio"
          >
            <v-icon start size="small">mdi-radio-tower</v-icon>
            {{ t('player.similar_radio') }}
          </v-chip>
          <v-btn-toggle
            v-model="player.playlistMode"
            color="primary"
            class="player-sidebar__mode-toggle"
            multiple
            rounded="pill"
            density="compact"
            variant="outlined"
          >
            <v-btn
              value="loop"
              v-tooltip="playerTooltip(t('player.playlist_modes.loop'))"
              size="small"
              :disabled="similarRadioActive"
            >
              <v-icon size="small">mdi-sync</v-icon>
            </v-btn>
            <v-btn
              value="autoplay"
              v-tooltip="playerTooltip(t('player.playlist_modes.autoplay'))"
              size="small"
            >
              <v-icon size="small">mdi-play-pause</v-icon>
            </v-btn>
            <v-btn
              value="shuffle"
              v-tooltip="playerTooltip(t('player.playlist_modes.shuffle'))"
              size="small"
              :disabled="similarRadioActive"
            >
              <v-icon size="small">mdi-shuffle-variant</v-icon>
            </v-btn>
          </v-btn-toggle>
        </div>
        <v-virtual-scroll
          v-if="playerStore.playlistVisible && player.playlist.length > 0"
          ref="playlistScroll"
          :items="player.playlist"
          :item-height="PLAYLIST_ROW_HEIGHT"
          item-key="key"
          :bench="12"
          height="100%"
          class="player-sidebar__virtual-scroll"
        >
          <template #default="{ item, index }">
            <PlaylistItem
              :video="item"
              :index="index"
              @play="play"
            />
          </template>
        </v-virtual-scroll>

        <div v-else-if="player.playlist.length === 0" class="player-sidebar__empty">
          <v-icon size="40" color="medium-emphasis">mdi-playlist-remove</v-icon>
          <span>{{ t('playlists.no_videos_added') }}</span>
        </div>
      </div>
    </aside>
  </v-theme-provider>
</template>

<script setup lang="ts">
import {ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {usePlayerPlaylist} from '@/composable/usePlayerPlaylist'
import {usePlayerSidebarSticky} from '@/composable/usePlayerSidebarSticky'
import PlaylistItem from '@/components/app/player/PlaylistItem.vue'
import {playerTooltip} from '@/utils/playerOverlay'
import {similarRadioActive, stopSimilarRadio} from '@/services/similarRadio'
import type { PlayVideoSwitch } from '@/types/player'

const PLAYLIST_ROW_HEIGHT = 57

const emit = defineEmits<{
  play: [payload: PlayVideoSwitch]
}>()
const {t} = useI18n()

const playlistScroll = ref<{scrollToIndex: (index: number) => void} | null>(null)
const {stickyEl, bodyStyle} = usePlayerSidebarSticky()

const {
  playerStore,
  player,
  title,
  play,
} = usePlayerPlaylist({
  emit,
  scrollToIndex: (index) => playlistScroll.value?.scrollToIndex(index),
})

function onStopRadio() {
  stopSimilarRadio()
}
</script>
