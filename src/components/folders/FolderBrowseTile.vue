<template>
  <div
    class="folder-browse-tile-wrapper"
    :class="{'folder-browse-tile-wrapper--selecting': selectMode}"
  >
    <button
      type="button"
      class="folder-browse-tile"
      :class="{
        'folder-browse-tile--list': list,
        'folder-browse-tile--icons': icons,
        'folder-browse-tile--compact': compact,
        'folder-browse-tile--focused': focused,
        'folder-browse-tile--selected': selected,
      }"
      :data-folder-path="folder.path"
      :aria-label="folder.name"
      :title="folder.path"
      @click="onClick"
      @dblclick="emit('open', folder.path)"
      @contextmenu.prevent.stop="emit('contextmenu', $event, folder.path)"
    >
      <div class="folder-browse-tile__preview">
        <div
          v-if="showMosaic"
          class="folder-browse-tile__mosaic"
          :class="`folder-browse-tile__mosaic--${Math.min(coverUrls.length, 4)}`"
        >
          <img
            v-for="(url, index) in coverUrls.slice(0, 4)"
            :key="`${folder.path}:${index}`"
            :src="url"
            alt=""
            class="folder-browse-tile__cover"
          >
        </div>
        <div
          v-else-if="icons"
          class="folder-browse-tile__icon-glyph"
          aria-hidden="true"
        >
          <v-icon
            icon="mdi-folder"
            :size="iconGlyphSize"
            class="folder-browse-tile__empty-icon"
          />
        </div>
        <div
          v-else-if="isCard"
          class="folder-browse-tile__empty"
          aria-hidden="true"
        >
          <span class="folder-browse-tile__empty-glow"/>
          <v-icon
            icon="mdi-folder"
            size="52"
            class="folder-browse-tile__empty-icon"
          />
        </div>
        <v-icon
          v-else
          icon="mdi-folder"
          :size="list ? 18 : 28"
          color="primary"
        />
        <div
          v-if="isCard"
          class="folder-browse-tile__preview-shade"
          aria-hidden="true"
        />
        <span
          v-if="showMosaic"
          class="folder-browse-tile__folder-mark"
          aria-hidden="true"
        >
          <v-icon size="14" icon="mdi-folder"/>
        </span>
        <span
          v-if="mosaicHiddenCount > 0"
          class="folder-browse-tile__badge"
        >
          +{{ mosaicHiddenCount }}
        </span>
      </div>
      <div class="folder-browse-tile__body">
        <div
          class="folder-browse-tile__name"
          :title="folder.name"
        >
          {{ folder.name }}
        </div>
        <div
          v-if="icons"
          class="folder-browse-tile__meta folder-browse-tile__meta--icons"
        >
          <span class="folder-browse-tile__objects">
            {{ objectsCountLabel }}
          </span>
        </div>
        <div
          v-else-if="isCard"
          class="folder-browse-tile__meta"
        >
          <span
            v-if="folder.mediaCount > 0 || (folder.newCount || 0) > 0"
            class="folder-browse-tile__stat"
          >
            {{ mediaCountLabel }}
          </span>
          <span
            v-for="chip in visibleChips"
            :key="chip.tagId"
            class="folder-browse-tile__chip"
            :style="chip.color ? {background: chip.color} : undefined"
          >
            {{ chip.name }}
          </span>
          <span
            v-if="overflowCount > 0"
            class="folder-browse-tile__chip folder-browse-tile__chip--more"
          >
            +{{ overflowCount }}
          </span>
        </div>
        <div
          v-else-if="list && (visibleChips.length || folder.mediaCount > 0 || (folder.newCount || 0) > 0)"
          class="folder-browse-tile__meta"
        >
          <span
            v-if="folder.mediaCount > 0 || (folder.newCount || 0) > 0"
            class="folder-browse-tile__count"
          >
            {{ mediaCountLabel }}
          </span>
          <span
            v-for="chip in visibleChips"
            :key="chip.tagId"
            class="folder-browse-tile__chip"
            :style="chip.color ? {background: chip.color} : undefined"
          >
            {{ chip.name }}
          </span>
          <span
            v-if="overflowCount > 0"
            class="folder-browse-tile__chip folder-browse-tile__chip--more"
          >
            +{{ overflowCount }}
          </span>
        </div>
      </div>
    </button>
    <div
      v-if="selectMode"
      class="folder-browse-tile__select-overlay"
      :class="{
        'folder-browse-tile__select-overlay--on': selected,
        'folder-browse-tile__select-overlay--list': list || compact,
      }"
      @click.stop="emit('toggle-select', folder)"
    >
      <button
        type="button"
        class="folder-browse-tile__select-btn"
        :class="{
          'folder-browse-tile__select-btn--on': selected,
          'folder-browse-tile__select-btn--list': list || compact,
        }"
        :aria-pressed="selected"
        :aria-label="selected ? 'Deselect folder' : 'Select folder'"
        tabindex="-1"
      >
        <v-icon
          size="18"
          :icon="selected ? 'mdi-check' : 'mdi-plus'"
        />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'

export type FolderBrowseTagChip = {
  tagId: number
  name: string
  color?: string | null
}

export type FolderBrowseTileModel = {
  path: string
  name: string
  mediaCount: number
  newCount?: number
  coverMediaIds?: number[]
}

const props = withDefaults(defineProps<{
  folder: FolderBrowseTileModel
  coverUrls?: string[]
  tags?: FolderBrowseTagChip[]
  focused?: boolean
  list?: boolean
  icons?: boolean
  compact?: boolean
  selectMode?: boolean
  selected?: boolean
}>(), {
  coverUrls: () => [],
  tags: () => [],
  focused: false,
  list: false,
  icons: false,
  compact: false,
  selectMode: false,
  selected: false,
})

const emit = defineEmits<{
  open: [path: string]
  contextmenu: [event: MouseEvent, path: string]
  'toggle-select': [folder: FolderBrowseTileModel]
}>()

const {t} = useI18n()

const isCard = computed(() => !props.list && !props.compact && !props.icons)
const showMosaic = computed(() => isCard.value && props.coverUrls.length > 0)
const mosaicShown = computed(() => Math.min(props.coverUrls.length, 4))
const mosaicHiddenCount = computed(() => {
  if (!showMosaic.value) return 0
  return Math.max(0, Number(props.folder.mediaCount || 0) - mosaicShown.value)
})

const visibleChips = computed(() => (props.tags || []).slice(0, 3))
const overflowCount = computed(() => Math.max(0, (props.tags || []).length - visibleChips.value.length))
const mediaCountLabel = computed(() => {
  const libraryCount = Number(props.folder.mediaCount || 0)
  const newCount = Number(props.folder.newCount || 0)
  if (libraryCount > 0 && newCount > 0) {
    return t('folders_browser.library_and_new', {library: libraryCount, count: newCount})
  }
  if (newCount > 0) {
    return t('folders_browser.new_count', {count: newCount})
  }
  return t('folders_browser.media_count', {count: libraryCount})
})
const objectsCountLabel = computed(() => mediaCountLabel.value)
const iconGlyphSize = computed(() => 'var(--folder-icon-size, 88px)')

function onClick() {
  emit('open', props.folder.path)
}
</script>

<style scoped>
.folder-browse-tile-wrapper {
  position: relative;
  width: 100%;
}

.folder-browse-tile-wrapper--selecting {
  cursor: default;
}

.folder-browse-tile {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  height: 100%;
  box-sizing: border-box;
  padding: 0;
  border: none;
  border-radius: 17px;
  background: rgb(var(--v-theme-surface));
  color: inherit;
  font: inherit;
  font-size: var(--folder-card-font-size, 1rem);
  cursor: pointer;
  text-align: left;
  overflow: hidden;
  box-shadow:
    0 1px 0 rgba(var(--v-theme-on-surface), 0.04),
    0 4px 14px rgba(0, 0, 0, 0.14);
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    outline-color 180ms ease;
}

.folder-browse-tile:hover,
.folder-browse-tile:focus-visible {
  outline: none;
  transform: translateY(-2px);
  box-shadow:
    0 1px 0 rgba(var(--v-theme-on-surface), 0.05),
    0 10px 28px rgba(0, 0, 0, 0.2);
}

.folder-browse-tile--focused {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

.folder-browse-tile--selected {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

.folder-browse-tile--list {
  flex-direction: row;
  align-items: center;
  height: var(--list-card-height, 48px);
  padding: 0 10px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 8px;
  box-shadow: none;
  transform: none;
}

.folder-browse-tile--icons {
  align-items: center;
  height: auto;
  min-height: 0;
  padding: 10px 8px 12px;
  border: none;
  border-radius: 12px;
  background: transparent;
  box-shadow: none;
  transform: none;
  text-align: center;
  overflow: visible;
}

.folder-browse-tile--icons:hover,
.folder-browse-tile--icons:focus-visible {
  background: rgba(var(--v-theme-primary), 0.06);
  box-shadow: none;
  transform: none;
}

.folder-browse-tile--list:hover,
.folder-browse-tile--list:focus-visible,
.folder-browse-tile--compact:hover,
.folder-browse-tile--compact:focus-visible {
  border-color: rgb(var(--v-theme-primary));
  box-shadow: none;
  transform: none;
}

.folder-browse-tile--list.folder-browse-tile--focused,
.folder-browse-tile--compact.folder-browse-tile--focused,
.folder-browse-tile--list.folder-browse-tile--selected,
.folder-browse-tile--compact.folder-browse-tile--selected {
  border-color: rgb(var(--v-theme-primary));
  outline: none;
  box-shadow: 0 0 0 2px rgba(var(--v-theme-primary), 0.25);
}

.folder-browse-tile--icons.folder-browse-tile--focused,
.folder-browse-tile--icons.folder-browse-tile--selected {
  background: rgba(var(--v-theme-primary), 0.1);
  outline: none;
  box-shadow: inset 0 0 0 2px rgba(var(--v-theme-primary), 0.45);
}

/* Compact mode — unified row matching fs-file appearance */
.folder-browse-tile--compact {
  flex-direction: row;
  align-items: center;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 8px;
  height: var(--list-card-height, auto);
  padding: 4px 8px;
  box-shadow: none;
  transform: none;
}

.folder-browse-tile--compact .folder-browse-tile__preview {
  flex: 0 0 auto;
  width: 28px;
  min-width: 28px;
  aspect-ratio: auto;
  height: 28px;
  background: none;
  overflow: visible;
}

.folder-browse-tile--compact .folder-browse-tile__body {
  flex: 1;
  display: flex;
  flex-direction: row;
  align-items: center;
  min-height: 0;
  padding: 0 10px;
  gap: 0;
}

.folder-browse-tile--compact .folder-browse-tile__name {
  flex: 1 1 auto;
  width: auto;
  min-width: 0;
  font-size: var(--list-font-size, 13px);
  padding: 0;
  line-height: 16px;
  text-align: left;
}

.folder-browse-tile__preview {
  position: relative;
  flex: 0 0 auto;
  width: 100%;
  aspect-ratio: 16 / 9;
  height: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(120% 90% at 50% 0%, rgba(var(--v-theme-primary), 0.16), transparent 58%),
    linear-gradient(180deg, rgba(var(--v-theme-on-surface), 0.07), rgba(var(--v-theme-on-surface), 0.03));
  overflow: hidden;
  isolation: isolate;
}

.folder-browse-tile--icons .folder-browse-tile__preview {
  width: var(--folder-icon-size, 88px);
  height: var(--folder-icon-size, 88px);
  aspect-ratio: 1;
  border-radius: 10px;
  background: transparent;
  overflow: visible;
}

.folder-browse-tile--list .folder-browse-tile__preview {
  width: 28px;
  min-width: 28px;
  aspect-ratio: auto;
  height: 28px;
  background: none;
  overflow: visible;
}

.folder-browse-tile__empty,
.folder-browse-tile__icon-glyph {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.folder-browse-tile--icons .folder-browse-tile__icon-glyph {
  position: static;
  width: 100%;
  height: 100%;
}

.folder-browse-tile__empty-glow {
  position: absolute;
  width: 42%;
  aspect-ratio: 1;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(var(--v-theme-primary), 0.28), transparent 70%);
  filter: blur(2px);
  pointer-events: none;
}

.folder-browse-tile__empty-icon {
  color: rgb(var(--v-theme-primary));
  opacity: 0.92;
  filter: drop-shadow(0 6px 16px rgba(var(--v-theme-primary), 0.28));
}

.folder-browse-tile--icons .folder-browse-tile__empty-icon {
  opacity: 1;
  filter: drop-shadow(0 4px 10px rgba(var(--v-theme-primary), 0.22));
}

.folder-browse-tile__preview-shade {
  position: absolute;
  inset: auto 0 0;
  height: 42%;
  background: linear-gradient(180deg, transparent, rgba(0, 0, 0, 0.38));
  pointer-events: none;
  z-index: 1;
}

.folder-browse-tile__mosaic {
  display: grid;
  width: 100%;
  height: 100%;
  gap: 2px;
  background: rgba(0, 0, 0, 0.28);
}

.folder-browse-tile__mosaic--1 {
  grid-template-columns: 1fr;
}

.folder-browse-tile__mosaic--2 {
  grid-template-columns: 1fr 1fr;
}

.folder-browse-tile__mosaic--3 {
  grid-template-columns: 1.2fr 0.8fr;
  grid-template-rows: 1fr 1fr;
}

.folder-browse-tile__mosaic--3 .folder-browse-tile__cover:first-child {
  grid-row: 1 / span 2;
}

.folder-browse-tile__mosaic--4 {
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
}

.folder-browse-tile__cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.folder-browse-tile__badge {
  position: absolute;
  right: 8px;
  bottom: 8px;
  z-index: 2;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 22px;
  padding: 0 7px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 11px;
  line-height: 1;
  font-weight: 700;
  letter-spacing: 0.01em;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.28);
}

.folder-browse-tile__folder-mark {
  position: absolute;
  left: 8px;
  top: 8px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 9px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(0, 0, 0, 0.48);
  color: #fff;
  pointer-events: none;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.22);
}

.folder-browse-tile__body {
  box-sizing: border-box;
  flex: 1 1 auto;
  min-width: 0;
  min-height: var(--folder-card-body-min, 72px);
  padding: 0.55em 0.65em 0.7em;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 4px;
}

.folder-browse-tile--icons .folder-browse-tile__body {
  flex: 0 0 auto;
  width: 100%;
  min-height: 0;
  padding: 8px 2px 0;
  align-items: center;
  gap: 2px;
}

.folder-browse-tile--list .folder-browse-tile__body {
  flex: 1;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 0;
  padding: 0 10px;
}

.folder-browse-tile--list .folder-browse-tile__name {
  flex: 1 1 auto;
  width: auto;
  min-width: 0;
  font-size: var(--list-font-size, 13px);
  padding: 0;
  line-height: 16px;
  text-align: left;
}

.folder-browse-tile__name {
  width: 100%;
  font-family: inherit;
  font-size: 1.05em;
  font-weight: 600;
  letter-spacing: 0.01em;
  line-height: 1.25;
  color: inherit;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.folder-browse-tile--icons .folder-browse-tile__name {
  font-size: 0.82em;
  font-weight: 500;
  line-height: 1.25;
  white-space: normal;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-align: center;
  word-break: break-word;
}

.folder-browse-tile__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  min-width: 0;
  overflow: hidden;
}

.folder-browse-tile__meta--icons {
  justify-content: center;
  flex-wrap: nowrap;
}

.folder-browse-tile--list .folder-browse-tile__meta {
  margin-top: 0;
  flex: 0 1 auto;
}

.folder-browse-tile__stat,
.folder-browse-tile__count {
  font-size: 0.72em;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), 0.55);
  white-space: nowrap;
}

.folder-browse-tile__objects {
  font-size: 0.72em;
  font-weight: 500;
  line-height: 1.2;
  color: rgb(var(--v-theme-primary));
  opacity: 0.85;
  white-space: nowrap;
}

.folder-browse-tile__chip {
  max-width: 88px;
  padding: 0 7px;
  border-radius: 999px;
  background: rgba(var(--v-theme-primary), 0.14);
  color: inherit;
  font-size: 0.68em;
  line-height: 18px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.folder-browse-tile__chip--more {
  max-width: none;
  background: rgba(var(--v-theme-on-surface), 0.08);
}

/* Selection overlay */
.folder-browse-tile__select-overlay {
  position: absolute;
  inset: 0;
  z-index: 3;
  border-radius: 17px;
  background: rgba(var(--v-theme-primary), 0.04);
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  padding: 8px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 120ms ease;
}

.folder-browse-tile-wrapper:has(.folder-browse-tile--icons) .folder-browse-tile__select-overlay {
  border-radius: 12px;
}

.folder-browse-tile-wrapper:hover .folder-browse-tile__select-overlay,
.folder-browse-tile__select-overlay--on {
  opacity: 1;
}

.folder-browse-tile__select-btn {
  pointer-events: auto;
  appearance: none;
  border: 2px solid rgba(255, 255, 255, 0.55);
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  transition: background-color 120ms ease, border-color 120ms ease, transform 120ms ease;
}

.folder-browse-tile__select-btn:hover {
  background: rgba(0, 0, 0, 0.72);
  transform: scale(1.04);
}

.folder-browse-tile__select-btn--on {
  background: rgb(var(--v-theme-primary));
  border-color: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}

.folder-browse-tile__select-btn--on:hover {
  background: rgb(var(--v-theme-primary));
  border-color: rgb(var(--v-theme-primary));
}

.folder-browse-tile__select-overlay--list {
  justify-content: flex-start;
  align-items: center;
  padding: 0 0 0 10px;
  border-radius: 8px;
}

.folder-browse-tile__select-btn--list {
  width: 24px;
  height: 24px;
  border-width: 1px;
  border-color: rgba(var(--v-theme-on-surface), 0.3);
  background: rgba(var(--v-theme-surface), 0.95);
  color: rgba(var(--v-theme-on-surface), 0.55);
  box-shadow: none;
}

.folder-browse-tile__select-btn--list:hover {
  border-color: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-surface), 0.95);
  transform: none;
}

.folder-browse-tile__select-btn--list.folder-browse-tile__select-btn--on {
  background: rgb(var(--v-theme-primary));
  border-color: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}

.folder-browse-tile__select-btn--list .v-icon {
  font-size: 14px !important;
}

@media (prefers-reduced-motion: reduce) {
  .folder-browse-tile {
    transition: none;
  }

  .folder-browse-tile:hover,
  .folder-browse-tile:focus-visible {
    transform: none;
  }
}
</style>
