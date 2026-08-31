<template>
  <div class="player-trim-studio" data-ignore-player-hotkeys>
    <div class="player-trim-studio__dock">
      <div class="player-trim-studio__brand" :title="t('player.controls.trim')">
        <v-icon size="18">mdi-content-cut</v-icon>
      </div>

      <button
        type="button"
        class="player-trim-studio__point"
        :title="t('player.trim.set_start')"
        @click="setTrimPoint('start')"
      >
        <kbd class="player-trim-studio__kbd">I</kbd>
        <span class="player-trim-studio__copy">
          <span class="player-trim-studio__label">{{ t('player.trim.in') }}</span>
          <span class="player-trim-studio__time">{{ startLabel }}</span>
        </span>
      </button>

      <div class="player-trim-studio__span">
        <span class="player-trim-studio__span-line"/>
        <span class="player-trim-studio__keep">
          <span class="player-trim-studio__keep-label">{{ t('player.trim.keep') }}</span>
          <span class="player-trim-studio__keep-time">{{ durationLabel }}</span>
        </span>
        <span class="player-trim-studio__span-line"/>
      </div>

      <button
        type="button"
        class="player-trim-studio__point"
        :title="t('player.trim.set_end')"
        @click="setTrimPoint('end')"
      >
        <span class="player-trim-studio__copy player-trim-studio__copy--end">
          <span class="player-trim-studio__label">{{ t('player.trim.out') }}</span>
          <span class="player-trim-studio__time">{{ endLabel }}</span>
        </span>
        <kbd class="player-trim-studio__kbd">O</kbd>
      </button>

      <div class="player-trim-studio__actions">
        <v-btn
          class="player-trim-studio__cancel"
          size="small"
          variant="text"
          rounded="xl"
          @click="exitTrimMode"
        >
          {{ t('player.trim.cancel') }}
        </v-btn>
        <v-btn
          class="player-trim-studio__apply"
          size="small"
          color="primary"
          variant="flat"
          rounded="xl"
          :disabled="!canTrim || player.trimBusy"
          @click="applyTrim"
        >
          <v-icon start size="16">mdi-content-cut</v-icon>
          {{ t('player.trim.apply') }}
        </v-btn>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed, inject} from 'vue'
import {useI18n} from 'vue-i18n'
import {PLAYER_TRANSPORT_KEY} from '@/composable/playerTransportKey'
import {getReadableDuration} from '@/services/formatUtils'

const {t} = useI18n()
const {
  player,
  canTrim,
  setTrimPoint,
  exitTrimMode,
  applyTrim,
  trimDuration,
} = inject(PLAYER_TRANSPORT_KEY)!

const startLabel = computed(() => getReadableDuration(player.value.trimStart))
const endLabel = computed(() => getReadableDuration(player.value.trimEnd))
const durationLabel = computed(() => getReadableDuration(trimDuration.value))
</script>
