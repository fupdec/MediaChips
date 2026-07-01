<template>
  <component
    :is="isPlayerWindow ? 'div' : VDialog"
    v-bind="playerWrapperProps"
  >
    <PlayerSurface />
  </component>
</template>

<script setup lang="ts">
import {provide, watch, onBeforeUnmount} from 'vue'
import {VDialog} from 'vuetify/components/VDialog'
import PlayerSurface from '@/components/app/player/PlayerSurface.vue'
import {PLAYER_SESSION_KEY, usePlayerSession} from '@/composable/usePlayerSession'
import {isPlayerUiActive} from '@/utils/playerShellState'

const session = usePlayerSession()
provide(PLAYER_SESSION_KEY, session)

const {isPlayerWindow, playerWrapperProps, playerStore} = session

const stopPlayerUiSync = watch(
  () => playerStore.active,
  (active) => {
    isPlayerUiActive.value = active
  },
  {immediate: true},
)
onBeforeUnmount(() => stopPlayerUiSync())
</script>

<style lang="scss">
.dialog-player {
  border-radius: 15px;
  display: flex;
  flex-direction: column;
  width: min(2000px, 96vw) !important;
  height: 80vh;
  max-height: 80vh;
  overflow: hidden;

  .player {
    flex: 1 1 auto;
    min-height: 0;
    height: 100%;
  }
}

.player-standalone {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #000;

  .player {
    height: 100%;
    border-radius: 0;
  }

  .player .video-wrapper {
    flex: 1;
    max-height: none;
    min-height: 0;
    height: auto;
  }
}

.player-standalone--win {
  --player-window-radius: 8px;
  overflow: hidden;
  border-radius: var(--player-window-radius);

  &:has(.player.fullscreen),
  &:has(.system-bar-player.maximized) {
    --player-window-radius: 0px;
    border-radius: 0;
  }
}

.not-macos {
  .player-standalone {
    .status-text {
      left: 0;
    }
  }
}
</style>
