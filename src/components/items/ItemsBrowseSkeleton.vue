<template>
  <div
    ref="layoutRef"
    class="items-browse-skeleton"
    :class="rootClass"
    :style="containerStyle"
    role="status"
    aria-busy="true"
    :aria-label="t('common.loading')"
  >
    <template v-if="isMasonryLike">
      <div
        v-for="(column, colIndex) in masonryColumns"
        :key="`col-${colIndex}`"
        class="items-browse-skeleton__masonry-col"
      >
        <div
          v-for="(tile, tileIndex) in column"
          :key="`m-${colIndex}-${tileIndex}`"
          class="items-browse-skeleton__masonry-tile"
          :style="{
            '--sk-i': String(colIndex + tileIndex * columnCount),
            aspectRatio: tile.aspect,
          }"
        >
          <span class="items-browse-skeleton__bone items-browse-skeleton__fill"/>
        </div>
      </div>
    </template>

    <template v-else-if="isChips">
      <div
        v-for="index in skeletonCount"
        :key="`chip-${index}`"
        class="items-browse-skeleton__chip"
        :style="{
          '--sk-i': String(index - 1),
          width: chipWidths[(index - 1) % chipWidths.length],
        }"
      >
        <span class="items-browse-skeleton__bone items-browse-skeleton__chip-avatar"/>
        <span class="items-browse-skeleton__bone items-browse-skeleton__chip-label"/>
      </div>
    </template>

    <template v-else>
      <div
        v-for="index in skeletonCount"
        :key="`cell-${index}`"
        class="items-browse-skeleton__cell"
        :style="{'--sk-i': String(index - 1)}"
      >
        <div
          v-if="isList"
          class="items-browse-skeleton__row"
        >
          <span class="items-browse-skeleton__bone items-browse-skeleton__row-preview"/>
          <div class="items-browse-skeleton__row-body">
            <span class="items-browse-skeleton__bone items-browse-skeleton__row-title"/>
            <span class="items-browse-skeleton__bone items-browse-skeleton__row-meta"/>
          </div>
          <span class="items-browse-skeleton__bone items-browse-skeleton__row-action"/>
        </div>

        <div
          v-else-if="isTimeline"
          class="items-browse-skeleton__timeline"
        >
          <span class="items-browse-skeleton__bone items-browse-skeleton__timeline-preview"/>
          <div class="items-browse-skeleton__timeline-body">
            <span class="items-browse-skeleton__bone items-browse-skeleton__title"/>
            <span class="items-browse-skeleton__bone items-browse-skeleton__subtitle"/>
          </div>
        </div>

        <div
          v-else-if="isMinimal"
          class="items-browse-skeleton__minimal"
        >
          <div
            class="items-browse-skeleton__preview"
            :style="previewAspectStyle"
          >
            <span class="items-browse-skeleton__bone items-browse-skeleton__fill"/>
          </div>
          <span class="items-browse-skeleton__bone items-browse-skeleton__filename"/>
        </div>

        <div
          v-else
          class="items-browse-skeleton__card"
        >
          <div
            class="items-browse-skeleton__preview"
            :style="previewAspectStyle"
          >
            <span class="items-browse-skeleton__bone items-browse-skeleton__fill"/>
          </div>
          <div class="items-browse-skeleton__body">
            <span class="items-browse-skeleton__bone items-browse-skeleton__title"/>
            <span class="items-browse-skeleton__bone items-browse-skeleton__subtitle"/>
            <div class="items-browse-skeleton__meta-row">
              <span class="items-browse-skeleton__bone items-browse-skeleton__chip-mini"/>
              <span class="items-browse-skeleton__bone items-browse-skeleton__chip-mini items-browse-skeleton__chip-mini--short"/>
            </div>
          </div>
        </div>
      </div>
    </template>
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
  type GridLayoutOptions,
} from '@/utils/gridLayout'
import {isImageMediaType, isVideoMediaType} from '@/utils/mediaType'
import type {MediaType} from '@/types/media'

/** Matches `.item-media.item-view-5` / `.item-tag.item-view-5` row heights. */
const MEDIA_LIST_ROW_HEIGHT: Record<number, number> = {
  1: 44,
  2: 52,
  3: 60,
  4: 68,
  5: 76,
  6: 84,
}

const MEDIA_LIST_PREVIEW_WIDTH: Record<number, number> = {
  1: 78,
  2: 92,
  3: 107,
  4: 121,
  5: 135,
  6: 149,
}

const CHIP_AVATAR_SIZE: Record<number, number> = {
  1: 20,
  2: 26,
  3: 32,
  4: 40,
  5: 48,
  6: 64,
}

const CHIP_ROW_HEIGHT: Record<number, number> = {
  1: 34,
  2: 42,
  3: 46,
  4: 52,
  5: 62,
  6: 80,
}

const LINE_ROW_HEIGHT: Record<number, number> = {
  1: 100,
  2: 120,
  3: 130,
  4: 140,
  5: 160,
  6: 180,
}

const MASONRY_ASPECTS = ['3 / 4', '4 / 5', '1 / 1', '5 / 4', '4 / 3', '16 / 10']

const props = withDefaults(defineProps<{
  size?: number | string
  gapSize?: string
  view?: number | string
  itemsType?: 'media' | 'tag'
  mediaType?: MediaType | null
  imageAspectRatio?: number
}>(), {
  size: 3,
  gapSize: 'xs',
  view: 1,
  itemsType: 'media',
  mediaType: null,
  imageAspectRatio: undefined,
})

const {t} = useI18n()
const layoutRef = ref<HTMLElement | null>(null)

const sizeNumber = computed(() => {
  const size = Number(props.size)
  return Number.isFinite(size) && size >= 1 && size <= 6 ? size : 3
})

const viewNumber = computed(() => Number(props.view) || 1)

const isList = computed(() => viewNumber.value === 5)
const isChips = computed(() => props.itemsType === 'tag' && viewNumber.value === 2)
const isMinimal = computed(() => viewNumber.value === 4)
const isMasonry = computed(() =>
  props.itemsType === 'media' && isImageMediaType(props.mediaType) && viewNumber.value === 3,
)
const isSquares = computed(() =>
  props.itemsType === 'media' && isImageMediaType(props.mediaType) && viewNumber.value === 6,
)
const isMasonryLike = computed(() => isMasonry.value || isSquares.value)
const isTimeline = computed(() =>
  props.itemsType === 'media' && isVideoMediaType(props.mediaType) && viewNumber.value === 2,
)
const isImageGrid = computed(() =>
  props.itemsType === 'media' && isImageMediaType(props.mediaType) && viewNumber.value === 1,
)

const layoutOptions = computed<GridLayoutOptions>(() => ({
  size: sizeNumber.value,
  gapSize: props.gapSize || 'xs',
  imageGrid: isImageGrid.value || isMasonry.value || isSquares.value,
  wideImage: isTimeline.value,
  lineGrid: isTimeline.value,
  listGrid: isList.value,
  chipsGrid: isChips.value,
  imageAspectRatio: props.imageAspectRatio
    || (isImageGrid.value ? 16 / 9 : undefined),
}))

const {gridStyle, containerWidth} = useResponsiveGridLayout(layoutRef, layoutOptions)

const columnCount = computed(() => {
  if (isList.value || isTimeline.value) return 1
  if (isChips.value) return Math.max(4, Math.floor((containerWidth.value || 800) / 140))
  return getLayoutMetrics(containerWidth.value || 0, {
    ...layoutOptions.value,
    containerWidth: containerWidth.value || 0,
  }).columnCount
})

const skeletonCount = computed(() => {
  if (isList.value) return 12
  if (isTimeline.value) return 6
  if (isChips.value) return 18
  const cols = Math.max(1, columnCount.value)
  return Math.min(cols * 3, 24)
})

const masonryColumns = computed(() => {
  const cols = Math.max(1, columnCount.value)
  const perCol = 4
  return Array.from({length: cols}, (_, colIndex) =>
    Array.from({length: perCol}, (_, tileIndex) => ({
      aspect: isSquares.value
        ? '1 / 1'
        : MASONRY_ASPECTS[(colIndex + tileIndex * 2) % MASONRY_ASPECTS.length],
    })),
  )
})

const chipWidths = ['118px', '142px', '96px', '168px', '124px', '110px']

const previewAspectStyle = computed(() => {
  if (props.imageAspectRatio && props.imageAspectRatio > 0) {
    return {aspectRatio: String(props.imageAspectRatio)}
  }
  if (isImageGrid.value || props.itemsType === 'tag') {
    return {aspectRatio: props.itemsType === 'tag' && !isMinimal.value ? '3 / 4' : '16 / 9'}
  }
  return {aspectRatio: '16 / 9'}
})

const listRowHeight = computed(() => MEDIA_LIST_ROW_HEIGHT[sizeNumber.value] || MEDIA_LIST_ROW_HEIGHT[3])
const listPreviewWidth = computed(() => MEDIA_LIST_PREVIEW_WIDTH[sizeNumber.value] || MEDIA_LIST_PREVIEW_WIDTH[3])
const chipAvatar = computed(() => CHIP_AVATAR_SIZE[sizeNumber.value] || CHIP_AVATAR_SIZE[3])
const chipHeight = computed(() => CHIP_ROW_HEIGHT[sizeNumber.value] || CHIP_ROW_HEIGHT[3])
const timelineHeight = computed(() => LINE_ROW_HEIGHT[sizeNumber.value] || LINE_ROW_HEIGHT[3])

const rootClass = computed(() => ({
  'items-browse-skeleton--list': isList.value,
  'items-browse-skeleton--chips': isChips.value,
  'items-browse-skeleton--timeline': isTimeline.value,
  'items-browse-skeleton--masonry': isMasonryLike.value,
  'items-browse-skeleton--minimal': isMinimal.value,
  'items-browse-skeleton--cards': !isList.value && !isChips.value && !isTimeline.value && !isMasonryLike.value,
}))

const containerStyle = computed(() => ({
  ...gridStyle.value,
  '--list-row-height': `${listRowHeight.value}px`,
  '--list-preview-width': `${listPreviewWidth.value}px`,
  '--chip-avatar-size': `${chipAvatar.value}px`,
  '--chip-height': `${chipHeight.value}px`,
  '--timeline-height': `${timelineHeight.value}px`,
  '--card-body-min': `${getCardDescriptionHeight(sizeNumber.value)}px`,
  '--sk-gap-y': `${getGridGap(layoutOptions.value.gapSize).y}px`,
  '--sk-gap-x': `${getGridGap(layoutOptions.value.gapSize).x}px`,
}))
</script>

<style scoped>
.items-browse-skeleton {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: var(--grid-gap-y, 15px) var(--grid-gap-x, 10px);
  width: 100%;
  min-height: 180px;
  padding: 2px 0 16px;
  box-sizing: border-box;
}

.items-browse-skeleton--list {
  flex-direction: column;
  flex-wrap: nowrap;
  gap: 0;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 10px;
  overflow: hidden;
  background: rgb(var(--v-theme-surface));
}

.items-browse-skeleton--chips {
  gap: 8px var(--grid-gap-x, 10px);
}

.items-browse-skeleton--timeline {
  flex-direction: column;
  flex-wrap: nowrap;
}

.items-browse-skeleton--masonry {
  display: flex;
  flex-wrap: nowrap;
  align-items: flex-start;
  gap: var(--sk-gap-x, 10px);
}

.items-browse-skeleton__cell {
  flex: 0 0 var(--card-width, 250px);
  width: var(--card-width, 250px);
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  animation: items-sk-fade-in 420ms ease both;
  animation-delay: calc(var(--sk-i, 0) * 24ms);
}

.items-browse-skeleton--list .items-browse-skeleton__cell,
.items-browse-skeleton--timeline .items-browse-skeleton__cell {
  flex: 0 0 auto;
  width: 100%;
}

.items-browse-skeleton__bone {
  position: relative;
  display: block;
  overflow: hidden;
  background: rgba(var(--v-theme-on-surface), 0.07);
  border-radius: 6px;
  isolation: isolate;
}

.items-browse-skeleton__bone::after {
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
  animation: items-sk-shimmer 1.35s ease-in-out infinite;
  animation-delay: calc(var(--sk-i, 0) * 36ms);
}

.items-browse-skeleton__fill {
  position: absolute;
  inset: 0;
  border-radius: 0;
  background: transparent;
}

.items-browse-skeleton__fill::after {
  background: linear-gradient(
    105deg,
    transparent 0%,
    rgba(var(--v-theme-primary), 0.02) 35%,
    rgba(var(--v-theme-primary), 0.14) 50%,
    rgba(var(--v-theme-primary), 0.02) 65%,
    transparent 100%
  );
}

.items-browse-skeleton__card {
  display: flex;
  flex-direction: column;
  width: 100%;
  overflow: hidden;
  border-radius: 8px;
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
}

.items-browse-skeleton__preview {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background:
    radial-gradient(120% 90% at 50% 0%, rgba(var(--v-theme-primary), 0.1), transparent 58%),
    linear-gradient(180deg, rgba(var(--v-theme-on-surface), 0.06), rgba(var(--v-theme-on-surface), 0.02));
}

.items-browse-skeleton__body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: var(--card-body-min, 82px);
  padding: 10px 12px 12px;
  box-sizing: border-box;
}

.items-browse-skeleton__title {
  width: 74%;
  height: 12px;
  border-radius: 999px;
}

.items-browse-skeleton__subtitle {
  width: 46%;
  height: 10px;
  border-radius: 999px;
  opacity: 0.85;
}

.items-browse-skeleton__meta-row {
  display: flex;
  gap: 6px;
  margin-top: 2px;
}

.items-browse-skeleton__chip-mini {
  width: 48px;
  height: 16px;
  border-radius: 999px;
}

.items-browse-skeleton__chip-mini--short {
  width: 32px;
}

.items-browse-skeleton__minimal {
  display: flex;
  flex-direction: column;
  width: 100%;
  gap: 6px;
}

.items-browse-skeleton__minimal .items-browse-skeleton__preview {
  border-radius: 8px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.items-browse-skeleton__filename {
  width: 62%;
  height: 11px;
  margin-inline: 10px;
  border-radius: 999px;
}

.items-browse-skeleton__cell:nth-child(3n) .items-browse-skeleton__title,
.items-browse-skeleton__cell:nth-child(3n) .items-browse-skeleton__filename,
.items-browse-skeleton__cell:nth-child(3n) .items-browse-skeleton__row-title {
  width: 58%;
}

.items-browse-skeleton__cell:nth-child(5n) .items-browse-skeleton__title,
.items-browse-skeleton__cell:nth-child(5n) .items-browse-skeleton__filename,
.items-browse-skeleton__cell:nth-child(5n) .items-browse-skeleton__row-title {
  width: 38%;
}

.items-browse-skeleton__row {
  display: flex;
  align-items: stretch;
  gap: 12px;
  width: 100%;
  height: var(--list-row-height, 60px);
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  box-sizing: border-box;
}

.items-browse-skeleton--list .items-browse-skeleton__cell:last-child .items-browse-skeleton__row {
  border-bottom: 0;
}

.items-browse-skeleton__row-preview {
  flex: 0 0 var(--list-preview-width, 107px);
  width: var(--list-preview-width, 107px);
  height: 100%;
  border-radius: 0;
  background: rgba(var(--v-theme-on-surface), 0.08);
}

.items-browse-skeleton__row-body {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  padding-right: 8px;
}

.items-browse-skeleton__row-title {
  width: 48%;
  height: 12px;
  border-radius: 999px;
}

.items-browse-skeleton__row-meta {
  width: 28%;
  height: 10px;
  border-radius: 999px;
  opacity: 0.8;
}

.items-browse-skeleton__row-action {
  flex: 0 0 18px;
  width: 18px;
  height: 18px;
  margin: auto 10px auto 0;
  border-radius: 50%;
}

.items-browse-skeleton__timeline {
  display: flex;
  flex-direction: column;
  width: 100%;
  overflow: hidden;
  border-radius: 10px;
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
}

.items-browse-skeleton__timeline-preview {
  width: 100%;
  height: var(--timeline-height, 130px);
  border-radius: 0;
  background:
    radial-gradient(120% 90% at 50% 0%, rgba(var(--v-theme-primary), 0.12), transparent 58%),
    rgba(var(--v-theme-on-surface), 0.06);
}

.items-browse-skeleton__timeline-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px 12px;
}

.items-browse-skeleton__chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: var(--chip-height, 46px);
  padding: 0 10px 0 4px;
  border-radius: 999px;
  background: rgba(var(--v-theme-on-surface), 0.05);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  box-sizing: border-box;
  animation: items-sk-fade-in 420ms ease both;
  animation-delay: calc(var(--sk-i, 0) * 18ms);
}

.items-browse-skeleton__chip-avatar {
  flex: 0 0 var(--chip-avatar-size, 32px);
  width: var(--chip-avatar-size, 32px);
  height: var(--chip-avatar-size, 32px);
  border-radius: 50%;
}

.items-browse-skeleton__chip-label {
  flex: 1 1 auto;
  height: 11px;
  border-radius: 999px;
}

.items-browse-skeleton__masonry-col {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sk-gap-y, 15px);
}

.items-browse-skeleton__masonry-tile {
  position: relative;
  width: 100%;
  overflow: hidden;
  border-radius: 8px;
  background:
    radial-gradient(120% 90% at 50% 0%, rgba(var(--v-theme-primary), 0.1), transparent 58%),
    rgba(var(--v-theme-on-surface), 0.06);
  animation: items-sk-fade-in 420ms ease both;
  animation-delay: calc(var(--sk-i, 0) * 22ms);
}

@keyframes items-sk-shimmer {
  0% {
    transform: translateX(-120%);
  }
  55%,
  100% {
    transform: translateX(120%);
  }
}

@keyframes items-sk-fade-in {
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
  .items-browse-skeleton__cell,
  .items-browse-skeleton__chip,
  .items-browse-skeleton__masonry-tile {
    animation: none;
  }

  .items-browse-skeleton__bone::after {
    animation: none;
    display: none;
  }
}
</style>
