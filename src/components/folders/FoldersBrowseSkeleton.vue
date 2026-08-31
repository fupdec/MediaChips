<template>
  <div
    ref="layoutRef"
    class="folders-browse-skeleton"
    :class="{
      'folders-browse-skeleton--list': isList,
      'folders-browse-skeleton--icons': isIcons,
      'folders-browse-skeleton--cards': isCards,
    }"
    :style="containerStyle"
    role="status"
    aria-busy="true"
    :aria-label="t('common.loading')"
  >
    <div
      v-for="index in skeletonCount"
      :key="index"
      class="folders-browse-skeleton__cell"
      :style="{'--sk-i': String(index - 1)}"
    >
      <div
        v-if="isList"
        class="folders-browse-skeleton__row"
      >
        <span class="folders-browse-skeleton__bone folders-browse-skeleton__icon"/>
        <span class="folders-browse-skeleton__bone folders-browse-skeleton__name"/>
        <span class="folders-browse-skeleton__bone folders-browse-skeleton__meta"/>
      </div>
      <div
        v-else-if="isIcons"
        class="folders-browse-skeleton__icon-tile"
      >
        <span class="folders-browse-skeleton__bone folders-browse-skeleton__glyph"/>
        <span class="folders-browse-skeleton__bone folders-browse-skeleton__caption"/>
        <span class="folders-browse-skeleton__bone folders-browse-skeleton__caption-sub"/>
      </div>
      <div
        v-else
        class="folders-browse-skeleton__card"
      >
        <div class="folders-browse-skeleton__preview">
          <span class="folders-browse-skeleton__bone folders-browse-skeleton__preview-fill"/>
          <span class="folders-browse-skeleton__folder-mark"/>
        </div>
        <div class="folders-browse-skeleton__body">
          <span class="folders-browse-skeleton__bone folders-browse-skeleton__title"/>
          <span class="folders-browse-skeleton__bone folders-browse-skeleton__subtitle"/>
          <div class="folders-browse-skeleton__chips">
            <span class="folders-browse-skeleton__bone folders-browse-skeleton__chip"/>
            <span class="folders-browse-skeleton__bone folders-browse-skeleton__chip folders-browse-skeleton__chip--short"/>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {useResponsiveGridLayout} from '@/composable/useResponsiveGridLayout'
import {
  getCardDescriptionHeight,
  getGridGap,
  getLayoutMetrics,
  LIST_ROW_HEIGHT,
  type GridLayoutOptions,
} from '@/utils/gridLayout'

type FoldersViewMode = 'cards' | 'icons' | 'list'

const ICON_GLYPH_SIZE: Record<number, number> = {
  1: 64,
  2: 72,
  3: 88,
  4: 104,
  5: 120,
  6: 136,
}

const ICON_ROW_HEIGHT: Record<number, number> = {
  1: 128,
  2: 144,
  3: 160,
  4: 176,
  5: 196,
  6: 216,
}

const props = withDefaults(defineProps<{
  size?: number | string
  gapSize?: string
  viewMode?: FoldersViewMode
}>(), {
  size: 3,
  gapSize: 'default',
  viewMode: 'cards',
})

const {t} = useI18n()
const layoutRef = ref<HTMLElement | null>(null)

const sizeNumber = computed(() => {
  const size = Number(props.size)
  return Number.isFinite(size) && size >= 1 && size <= 6 ? size : 3
})

const isList = computed(() => props.viewMode === 'list')
const isIcons = computed(() => props.viewMode === 'icons')
const isCards = computed(() => !isList.value && !isIcons.value)

const layoutOptions = computed<GridLayoutOptions>(() => ({
  size: isList.value ? 3 : sizeNumber.value,
  gapSize: isList.value ? 'compact' : (props.gapSize || 'default'),
  listGrid: isList.value,
}))

const {gridStyle, containerWidth} = useResponsiveGridLayout(layoutRef, layoutOptions)

const columnCount = computed(() => {
  if (isList.value) return 1
  return getLayoutMetrics(containerWidth.value || 0, {
    ...layoutOptions.value,
    containerWidth: containerWidth.value || 0,
  }).columnCount
})

const skeletonCount = computed(() => {
  if (isList.value) return 12
  const cols = Math.max(1, columnCount.value)
  return Math.min(cols * 3, 24)
})

const cardHeight = computed(() => {
  const size = sizeNumber.value
  if (isList.value) return LIST_ROW_HEIGHT[size] || LIST_ROW_HEIGHT[3]
  if (isIcons.value) return ICON_ROW_HEIGHT[size] || ICON_ROW_HEIGHT[3]
  const width = Number.parseFloat(String(gridStyle.value['--card-width'] || '255')) || 255
  const preview = width * (9 / 16)
  return Math.round(preview + getCardDescriptionHeight(size))
})

const containerStyle = computed(() => ({
  ...gridStyle.value,
  '--list-card-height': `${cardHeight.value}px`,
  '--folder-card-body-min': `${isCards.value ? getCardDescriptionHeight(sizeNumber.value) : 0}px`,
  '--folder-icon-size': `${ICON_GLYPH_SIZE[sizeNumber.value] || ICON_GLYPH_SIZE[3]}px`,
  '--sk-gap-y': `${getGridGap(layoutOptions.value.gapSize).y}px`,
}))
</script>

<style scoped>
.folders-browse-skeleton {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: var(--grid-gap-y, 15px) var(--grid-gap-x, 10px);
  width: 100%;
  min-height: 180px;
  padding: 2px 0 12px;
  box-sizing: border-box;
}

.folders-browse-skeleton--list {
  flex-direction: column;
  flex-wrap: nowrap;
  gap: 8px;
}

.folders-browse-skeleton__cell {
  flex: 0 0 var(--card-width, 250px);
  width: var(--card-width, 250px);
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  animation: folders-sk-fade-in 420ms ease both;
  animation-delay: calc(var(--sk-i, 0) * 28ms);
}

.folders-browse-skeleton--list .folders-browse-skeleton__cell {
  flex: 0 0 auto;
  width: 100%;
}

.folders-browse-skeleton__bone {
  position: relative;
  display: block;
  overflow: hidden;
  background: rgba(var(--v-theme-on-surface), 0.07);
  border-radius: 6px;
  isolation: isolate;
}

.folders-browse-skeleton__bone::after {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(-120%);
  background: linear-gradient(
    105deg,
    transparent 0%,
    rgba(var(--v-theme-on-surface), 0.02) 35%,
    rgba(var(--v-theme-on-surface), 0.14) 50%,
    rgba(var(--v-theme-on-surface), 0.02) 65%,
    transparent 100%
  );
  animation: folders-sk-shimmer 1.35s ease-in-out infinite;
  animation-delay: calc(var(--sk-i, 0) * 40ms);
}

.folders-browse-skeleton__card {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: var(--list-card-height, 180px);
  overflow: hidden;
  border-radius: 17px;
  background: rgb(var(--v-theme-surface));
  box-shadow:
    0 1px 0 rgba(var(--v-theme-on-surface), 0.04),
    0 4px 14px rgba(0, 0, 0, 0.12);
}

.folders-browse-skeleton__preview {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background:
    radial-gradient(120% 90% at 50% 0%, rgba(var(--v-theme-primary), 0.12), transparent 58%),
    linear-gradient(180deg, rgba(var(--v-theme-on-surface), 0.06), rgba(var(--v-theme-on-surface), 0.02));
}

.folders-browse-skeleton__preview-fill {
  position: absolute;
  inset: 0;
  border-radius: 0;
  background: transparent;
}

.folders-browse-skeleton__preview-fill::after {
  background: linear-gradient(
    105deg,
    transparent 0%,
    rgba(var(--v-theme-primary), 0.02) 35%,
    rgba(var(--v-theme-primary), 0.16) 50%,
    rgba(var(--v-theme-primary), 0.02) 65%,
    transparent 100%
  );
}

.folders-browse-skeleton__folder-mark {
  position: absolute;
  left: 10px;
  bottom: 10px;
  width: 22px;
  height: 18px;
  border-radius: 4px 4px 3px 3px;
  background: rgba(var(--v-theme-primary), 0.28);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
}

.folders-browse-skeleton__folder-mark::before {
  content: '';
  position: absolute;
  top: -5px;
  left: 2px;
  width: 10px;
  height: 6px;
  border-radius: 3px 3px 0 0;
  background: rgba(var(--v-theme-primary), 0.34);
}

.folders-browse-skeleton__body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: var(--folder-card-body-min, 82px);
  padding: 12px 12px 14px;
  box-sizing: border-box;
}

.folders-browse-skeleton__title {
  width: 72%;
  height: 13px;
  border-radius: 999px;
}

.folders-browse-skeleton__subtitle {
  width: 44%;
  height: 10px;
  border-radius: 999px;
  opacity: 0.85;
}

.folders-browse-skeleton__chips {
  display: flex;
  gap: 6px;
  margin-top: 2px;
}

.folders-browse-skeleton__chip {
  width: 52px;
  height: 18px;
  border-radius: 999px;
}

.folders-browse-skeleton__chip--short {
  width: 36px;
}

.folders-browse-skeleton__icon-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: var(--list-card-height, 160px);
  padding: 10px 8px 12px;
  border-radius: 12px;
  box-sizing: border-box;
}

.folders-browse-skeleton__glyph {
  width: var(--folder-icon-size, 88px);
  height: var(--folder-icon-size, 88px);
  border-radius: 12px;
  background:
    radial-gradient(120% 90% at 50% 0%, rgba(var(--v-theme-primary), 0.14), transparent 60%),
    rgba(var(--v-theme-on-surface), 0.06);
}

.folders-browse-skeleton__caption {
  width: 68%;
  height: 11px;
  border-radius: 999px;
}

.folders-browse-skeleton__caption-sub {
  width: 42%;
  height: 9px;
  border-radius: 999px;
  opacity: 0.8;
}

.folders-browse-skeleton__row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: var(--list-card-height, 44px);
  padding: 0 10px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 8px;
  background: rgb(var(--v-theme-surface));
  box-sizing: border-box;
}

.folders-browse-skeleton__icon {
  flex: 0 0 22px;
  width: 22px;
  height: 18px;
  border-radius: 4px;
  background: rgba(var(--v-theme-primary), 0.22);
}

.folders-browse-skeleton__name {
  flex: 1 1 auto;
  width: auto;
  max-width: 42%;
  height: 11px;
  border-radius: 999px;
}

.folders-browse-skeleton__cell:nth-child(3n) .folders-browse-skeleton__name,
.folders-browse-skeleton__cell:nth-child(3n) .folders-browse-skeleton__title,
.folders-browse-skeleton__cell:nth-child(3n) .folders-browse-skeleton__caption {
  max-width: 58%;
  width: 58%;
}

.folders-browse-skeleton__cell:nth-child(4n) .folders-browse-skeleton__name,
.folders-browse-skeleton__cell:nth-child(5n) .folders-browse-skeleton__title,
.folders-browse-skeleton__cell:nth-child(5n) .folders-browse-skeleton__caption {
  max-width: 34%;
  width: 34%;
}

.folders-browse-skeleton__meta {
  flex: 0 0 auto;
  width: 88px;
  height: 10px;
  margin-left: auto;
  border-radius: 999px;
  opacity: 0.8;
}

@keyframes folders-sk-shimmer {
  0% {
    transform: translateX(-120%);
  }
  55%,
  100% {
    transform: translateX(120%);
  }
}

@keyframes folders-sk-fade-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .folders-browse-skeleton__cell {
    animation: none;
  }

  .folders-browse-skeleton__bone::after {
    animation: none;
    display: none;
  }
}
</style>
