<template>
  <section v-if="!isAudioMode" class="player-menu__section">
    <div class="player-menu__label">{{ t('player.aspect_ratio_label') }}</div>
    <div class="player-menu__chips">
      <button
        v-for="mode in aspectModes"
        :key="mode"
        @click="playerStore.aspectMode = mode"
        :class="{'is-active': playerStore.aspectMode === mode}"
        type="button"
        class="player-menu__chip"
      >{{ aspectLabel(mode) }}</button>
    </div>
  </section>

  <section v-if="!isAudioMode" class="player-menu__section player-menu__section--inline">
    <div class="player-menu__label">{{ t('player.orientation_label') }}</div>
    <div class="player-menu__chips">
      <button
        @click="playerStore.rotation = rotateBy(playerStore.rotation, -90)"
        :title="t('player.rotate_left')"
        :aria-label="t('player.rotate_left')"
        type="button"
        class="player-menu__chip"
      ><v-icon size="18">mdi-rotate-left</v-icon></button>
      <button
        @click="playerStore.rotation = rotateBy(playerStore.rotation, 90)"
        :title="t('player.rotate_right')"
        :aria-label="t('player.rotate_right')"
        type="button"
        class="player-menu__chip"
      ><v-icon size="18">mdi-rotate-right</v-icon></button>
      <button
        @click="playerStore.flipH = !playerStore.flipH"
        :class="{'is-active': playerStore.flipH}"
        :title="t('player.flip_horizontal')"
        :aria-label="t('player.flip_horizontal')"
        type="button"
        class="player-menu__chip"
      ><v-icon size="18">mdi-flip-horizontal</v-icon></button>
      <button
        @click="playerStore.flipV = !playerStore.flipV"
        :class="{'is-active': playerStore.flipV}"
        :title="t('player.flip_vertical')"
        :aria-label="t('player.flip_vertical')"
        type="button"
        class="player-menu__chip"
      ><v-icon size="18">mdi-flip-vertical</v-icon></button>
      <button
        v-if="!isDefaultOrientation(playerStore)"
        @click="resetOrientation"
        type="button"
        class="player-menu__chip"
      >{{ playerStore.rotation ? `${playerStore.rotation}° · ` : '' }}{{ t('player.orientation_reset') }}</button>
    </div>
  </section>

  <section v-if="!isAudioMode" class="player-menu__section player-menu__section--inline">
    <div class="player-menu__label">{{ t('player.zoom_label') }}</div>
    <div class="player-menu__slider player-menu__slider--zoom player-menu__slider--zoom-area">
      <v-slider
        v-model="playerStore.zoom"
        :min="PLAYER_ZOOM_MIN"
        :max="PLAYER_ZOOM_MAX"
        :step="0.05"
        :track-size="3"
        color="white"
        density="compact"
        hide-details
      />
      <span class="player-menu__slider-value">{{ zoomPercent(playerStore.zoom) }}</span>
      <button
        @click="startAreaSelect"
        :title="t('player.area_select')"
        :aria-label="t('player.area_select')"
        type="button"
        class="player-menu__icon-btn"
      ><v-icon size="18">mdi-selection-drag</v-icon></button>
      <button
        @click="playerStore.zoom = 1"
        :class="{'is-hidden': playerStore.zoom === 1}"
        :disabled="playerStore.zoom === 1"
        :title="t('player.zoom_reset')"
        :aria-label="t('player.zoom_reset')"
        type="button"
        class="player-menu__icon-btn"
      ><v-icon size="18">mdi-restore</v-icon></button>
    </div>
  </section>

  <section v-if="!isAudioMode && playerStore.subtitleTracks.length > 0" class="player-menu__section">
    <div class="player-menu__label">{{ t('player.subtitles_label') }}</div>
    <div class="player-menu__chips mb-2">
      <button
        @click="playerStore.subtitleTrackName = null"
        :class="{'is-active': playerStore.subtitleTrackName == null}"
        type="button"
        class="player-menu__chip"
      >{{ t('player.subtitles_off') }}</button>
      <button
        v-for="track in playerStore.subtitleTracks"
        :key="track.name"
        @click="playerStore.subtitleTrackName = track.name"
        :class="{'is-active': playerStore.subtitleTrackName === track.name}"
        :title="track.name"
        type="button"
        class="player-menu__chip"
      >{{ subtitleLabel(track) }}</button>
    </div>
    <template v-if="playerStore.subtitleTrackName != null">
      <div class="player-menu__subtitle-delay">
        <span class="player-menu__slider-label">{{ t('player.subtitles_delay') }}</span>
        <button @click="shiftDelay(-SUBTITLE_DELAY_STEP)" type="button" class="player-menu__icon-btn"><v-icon size="18">mdi-minus</v-icon></button>
        <span class="player-menu__slider-value">{{ formatSubtitleDelay(playerStore.subtitleDelay) }}</span>
        <button @click="shiftDelay(SUBTITLE_DELAY_STEP)" type="button" class="player-menu__icon-btn"><v-icon size="18">mdi-plus</v-icon></button>
        <button
          @click="playerStore.subtitleDelay = 0"
          :class="{'is-hidden': playerStore.subtitleDelay === 0}"
          :disabled="playerStore.subtitleDelay === 0"
          :title="t('player.subtitles_reset')"
          :aria-label="t('player.subtitles_reset')"
          type="button"
          class="player-menu__icon-btn"
        ><v-icon size="18">mdi-restore</v-icon></button>
      </div>
      <div class="player-menu__slider player-menu__slider--zoom">
        <v-slider
          v-model="playerStore.subtitleScale"
          :min="SUBTITLE_SCALE_MIN"
          :max="SUBTITLE_SCALE_MAX"
          :step="0.1"
          :track-size="3"
          :aria-label="t('player.subtitles_size')"
          color="white"
          density="compact"
          hide-details
        />
        <span class="player-menu__slider-value">{{ Math.round(playerStore.subtitleScale * 100) }}%</span>
        <button
          @click="playerStore.subtitleScale = 1"
          :class="{'is-hidden': playerStore.subtitleScale === 1}"
          :disabled="playerStore.subtitleScale === 1"
          :title="t('player.subtitles_reset')"
          :aria-label="t('player.subtitles_reset')"
          type="button"
          class="player-menu__icon-btn"
        ><v-icon size="18">mdi-restore</v-icon></button>
      </div>
    </template>
  </section>

  <section v-if="!isAudioMode" class="player-menu__section">
    <button
      @click="pictureOpen = !pictureOpen"
      :aria-expanded="pictureOpen"
      type="button"
      class="player-menu__toggle"
    >
      <span class="player-menu__label">{{ t('player.picture_label') }}</span>
      <span v-if="!pictureOpen && !isDefaultPlayerFilters(playerStore.videoFilters)" class="player-menu__toggle-dot"/>
      <v-icon size="18">{{ pictureOpen ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
    </button>
    <template v-if="pictureOpen">
    <div class="player-menu__chips mb-2">
      <button
        v-for="preset in filterPresets"
        :key="preset"
        @click="playerStore.videoFilters.preset = preset"
        :class="{'is-active': playerStore.videoFilters.preset === preset}"
        type="button"
        class="player-menu__chip"
      >{{ t(`player.picture_preset_${preset}`) }}</button>
      <button
        v-if="!isDefaultPlayerFilters(playerStore.videoFilters)"
        @click="resetFilters"
        :title="t('player.picture_reset')"
        type="button"
        class="player-menu__chip"
      >{{ t('player.picture_preset_default') }}</button>
    </div>
    <div v-for="slider in filterSliders" :key="slider.key" class="player-menu__slider">
      <span class="player-menu__slider-label" :title="t(`player.picture_${slider.key}`)">{{ t(`player.picture_${slider.key}`) }}</span>
      <v-slider
        v-model="playerStore.videoFilters[slider.key]"
        :min="slider.min"
        :max="slider.max"
        :step="slider.step"
        :track-size="3"
        color="white"
        density="compact"
        hide-details
      />
      <span class="player-menu__slider-value">{{ formatFilterValue(slider.key, playerStore.videoFilters[slider.key]) }}</span>
      <button
        @click="resetFilter(slider.key)"
        :class="{'is-hidden': !isFilterChanged(slider.key)}"
        :disabled="!isFilterChanged(slider.key)"
        :title="t('player.picture_slider_reset')"
        :aria-label="t('player.picture_slider_reset')"
        tabindex="-1"
        type="button"
        class="player-menu__slider-reset"
      ><v-icon size="16">mdi-restore</v-icon></button>
    </div>
    </template>
  </section>

  <section v-if="!isWebVideo" class="player-menu__section">
    <button
      @click="equalizerOpen = !equalizerOpen"
      :aria-expanded="equalizerOpen"
      type="button"
      class="player-menu__toggle"
    >
      <span class="player-menu__label">{{ t('player.equalizer_label') }}</span>
      <span v-if="!equalizerOpen && !isFlatEqualizer(playerStore.equalizerGains)" class="player-menu__toggle-dot"/>
      <v-icon size="18">{{ equalizerOpen ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
    </button>
    <template v-if="equalizerOpen">
      <div class="player-menu__chips mb-2">
        <button
          v-for="preset in eqPresets"
          :key="preset"
          @click="applyEqPreset(preset)"
          :class="{'is-active': activeEqPreset === preset}"
          type="button"
          class="player-menu__chip"
        >{{ t(`player.eq_preset_${preset}`) }}</button>
      </div>
      <div class="player-menu__eq">
        <div v-for="(frequency, index) in eqBands" :key="frequency" class="player-menu__eq-band">
          <span class="player-menu__eq-gain">{{ formatEqGain(playerStore.equalizerGains[index]) }}</span>
          <v-slider
            v-model="playerStore.equalizerGains[index]"
            :min="EQ_GAIN_MIN"
            :max="EQ_GAIN_MAX"
            :step="EQ_GAIN_STEP"
            :track-size="3"
            :thumb-size="12"
            :aria-label="`${formatEqBand(frequency)} Hz`"
            direction="vertical"
            color="white"
            density="compact"
            hide-details
          />
          <span class="player-menu__eq-freq">{{ formatEqBand(frequency) }}</span>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import {computed, inject, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {PLAYER_TRANSPORT_KEY} from '@/composable/playerTransportKey'
import {PLAYER_ASPECT_MODES, type PlayerAspectMode} from '@/utils/playerAspect'
import {isDefaultOrientation, rotateBy} from '@/utils/playerVideoGeometry'
import {aspectModeLabel} from '@/utils/playerPictureActions'
import {PLAYER_ZOOM_MAX, PLAYER_ZOOM_MIN, zoomPercent} from '@/utils/playerZoom'
import {
  formatSubtitleDelay,
  shiftSubtitleDelay,
  subtitleTrackLabel,
  SUBTITLE_DELAY_STEP,
  SUBTITLE_SCALE_MAX,
  SUBTITLE_SCALE_MIN,
} from '@/utils/playerSubtitleActions'
import type {SubtitleTrack} from '@shared/subtitles'
import {
  PLAYER_EQ_BANDS,
  PLAYER_EQ_GAIN_MAX,
  PLAYER_EQ_GAIN_MIN,
  PLAYER_EQ_GAIN_STEP,
  PLAYER_EQ_PRESETS,
  PLAYER_EQ_PRESET_GAINS,
  formatEqBand,
  formatEqGain,
  isFlatEqualizer,
  matchEqPreset,
  type PlayerEqPreset,
} from '@/utils/playerEqualizer'
import {
  DEFAULT_PLAYER_FILTERS,
  PLAYER_FILTER_PRESETS,
  PLAYER_FILTER_SLIDERS,
  createDefaultPlayerFilters,
  isDefaultPlayerFilters,
  type PlayerFilterSliderKey,
} from '@/utils/playerVideoFilters'

const {t} = useI18n()
const emit = defineEmits<{ close: [] }>()
const PICTURE_OPEN_KEY = 'mediachips.player.pictureMenuOpen'
const readPictureOpen = () => {
  try { return localStorage.getItem(PICTURE_OPEN_KEY) === '1' } catch { return false }
}
// The long list of picture sliders is folded by default so the menu fits on small screens.
const pictureOpen = ref(readPictureOpen())
watch(pictureOpen, open => {
  try { localStorage.setItem(PICTURE_OPEN_KEY, open ? '1' : '0') } catch { /* only this session */ }
})
const {
  playerStore,
  density,
  isAudioMode,
  isWebVideo,
} = inject(PLAYER_TRANSPORT_KEY)!

const aspectModes = PLAYER_ASPECT_MODES
const startAreaSelect = () => {
  playerStore.areaSelecting = true
  emit('close')
}
const eqBands = PLAYER_EQ_BANDS
const eqPresets = PLAYER_EQ_PRESETS
const EQ_GAIN_MIN = PLAYER_EQ_GAIN_MIN
const EQ_GAIN_MAX = PLAYER_EQ_GAIN_MAX
const EQ_GAIN_STEP = PLAYER_EQ_GAIN_STEP
const EQUALIZER_OPEN_KEY = 'mediachips.player.equalizerMenuOpen'
const equalizerOpen = ref((() => { try { return localStorage.getItem(EQUALIZER_OPEN_KEY) === '1' } catch { return false } })())
watch(equalizerOpen, open => {
  try { localStorage.setItem(EQUALIZER_OPEN_KEY, open ? '1' : '0') } catch { /* only this session */ }
})
const activeEqPreset = computed(() => matchEqPreset(playerStore.equalizerGains))
const applyEqPreset = (preset: PlayerEqPreset) => { playerStore.equalizerGains = [...PLAYER_EQ_PRESET_GAINS[preset]] }
const subtitleLabel = (track: SubtitleTrack) => subtitleTrackLabel(track, key => t(key))
const shiftDelay = (delta: number) => shiftSubtitleDelay(playerStore, delta)
const filterPresets = PLAYER_FILTER_PRESETS
const filterSliders = PLAYER_FILTER_SLIDERS
const resetFilters = () => { playerStore.videoFilters = createDefaultPlayerFilters() }
const isFilterChanged = (key: PlayerFilterSliderKey) => Math.abs(playerStore.videoFilters[key] - DEFAULT_PLAYER_FILTERS[key]) > 1e-6
const resetFilter = (key: PlayerFilterSliderKey) => { playerStore.videoFilters[key] = DEFAULT_PLAYER_FILTERS[key] }
const formatFilterValue = (key: PlayerFilterSliderKey, value: number) => (
  key === 'hue' ? `${Math.round(value)}°` : key === 'blur' ? `${value.toFixed(1)}px` : value.toFixed(2)
)
const resetOrientation = () => {
  playerStore.rotation = 0
  playerStore.flipH = false
  playerStore.flipV = false
}
const aspectLabel = (mode: PlayerAspectMode) => aspectModeLabel(mode, key => t(key))
</script>
