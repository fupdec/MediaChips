<template>
  <div
    class="fs-browse-file-row-wrapper"
    :class="{'fs-browse-file-row-wrapper--selecting': selectMode}"
  >
    <div
      class="fs-browse-file-row"
      :class="{
        'fs-browse-file-row--list': list,
        'fs-browse-file-row--in-library': entry.inLibrary,
        'fs-browse-file-row--selected': selected,
      }"
      @click="onClick"
      @contextmenu.prevent.stop="emit('contextmenu', $event, entry)"
    >
      <div class="fs-browse-file-row__preview">
        <v-icon
          :icon="entry.isDirectory ? 'mdi-folder' : 'mdi-file-outline'"
          :size="list ? 18 : 24"
          :color="entry.isDirectory ? 'primary' : undefined"
        />
      </div>
      <div class="fs-browse-file-row__body">
        <div class="fs-browse-file-row__name" :title="entry.path">
          {{ entry.name }}
        </div>
        <div class="fs-browse-file-row__meta">
          <span
            v-if="entry.size != null && !entry.isDirectory"
            class="fs-browse-file-row__size"
          >
            {{ formatSize(entry.size) }}
          </span>
          <span
            v-if="entry.mtimeMs != null"
            class="fs-browse-file-row__mtime"
          >
            {{ formatMtime(entry.mtimeMs) }}
          </span>
          <v-chip
            v-if="entry.inLibrary"
            size="x-small"
            color="secondary"
            variant="tonal"
            label
          >
            {{ t('media.adding.browser_in_library') }}
          </v-chip>
          <v-chip
            v-else-if="entry.addable"
            size="x-small"
            color="success"
            variant="tonal"
            label
          >
            {{ t('media.adding.browser_addable') }}
          </v-chip>
        </div>
      </div>
    </div>
    <div
      v-if="selectMode"
      class="fs-browse-file-row__select-overlay"
      :class="{
        'fs-browse-file-row__select-overlay--on': selected,
        'fs-browse-file-row__select-overlay--list': list || selectMode,
      }"
      @click.stop="emit('toggle-select', entry)"
    >
      <button
        type="button"
        class="fs-browse-file-row__select-btn"
        :class="{
          'fs-browse-file-row__select-btn--on': selected,
          'fs-browse-file-row__select-btn--list': list || selectMode,
        }"
        :aria-pressed="selected"
        :aria-label="selected ? 'Deselect' : 'Select'"
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
import {useI18n} from 'vue-i18n'
import {getReadableFileSize} from '@/services/formatUtils'
import type {FsBrowseEntry} from '@/components/folders/FsBrowseEntry'

const {t} = useI18n()

const props = defineProps<{
  entry: FsBrowseEntry
  list?: boolean
  selectMode?: boolean
  selected?: boolean
}>()

const emit = defineEmits<{
  contextmenu: [event: MouseEvent, entry: FsBrowseEntry]
  'toggle-select': [entry: FsBrowseEntry]
}>()

function formatSize(bytes: number): string {
  return getReadableFileSize(bytes)
}

function formatMtime(mtimeMs: number): string {
  return new Date(mtimeMs).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function onClick() {
  if (props.selectMode) {
    emit('toggle-select', props.entry)
  }
}
</script>

<style scoped>
.fs-browse-file-row-wrapper {
  position: relative;
  width: 100%;
}

.fs-browse-file-row-wrapper--selecting {
  cursor: default;
}

.fs-browse-file-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 4px 8px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 8px;
  background: rgb(var(--v-theme-surface));
  cursor: pointer;
  transition: border-color 180ms ease;
  height: var(--list-card-height, auto);
}

.fs-browse-file-row:hover {
  border-color: rgba(var(--v-theme-primary), 0.4);
}

.fs-browse-file-row--in-library {
  opacity: 0.65;
}

.fs-browse-file-row--selected {
  border-color: rgb(var(--v-theme-primary));
  box-shadow: 0 0 0 2px rgba(var(--v-theme-primary), 0.25);
}

.fs-browse-file-row--list {
  padding: 0 10px;
  border-radius: 8px;
  height: var(--list-card-height, 48px);
}

.fs-browse-file-row__preview {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
}

.fs-browse-file-row__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.fs-browse-file-row--list .fs-browse-file-row__body {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.fs-browse-file-row__name {
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  line-height: 16px;
  color: inherit;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fs-browse-file-row--list .fs-browse-file-row__name {
  font-size: var(--list-font-size, 13px);
  flex: 1 1 auto;
}

.fs-browse-file-row__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
}

.fs-browse-file-row__size {
  font-size: 10px;
  color: rgba(var(--v-theme-on-surface), 0.55);
  white-space: nowrap;
}

.fs-browse-file-row__mtime {
  font-size: 10px;
  color: rgba(var(--v-theme-on-surface), 0.55);
  white-space: nowrap;
}

/* Selection overlay */
.fs-browse-file-row__select-overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  border-radius: 8px;
  background: rgba(var(--v-theme-primary), 0.04);
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  padding: 4px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 120ms ease;
}

.fs-browse-file-row-wrapper:hover .fs-browse-file-row__select-overlay,
.fs-browse-file-row__select-overlay--on {
  opacity: 1;
}

.fs-browse-file-row__select-btn {
  pointer-events: auto;
  appearance: none;
  border: 2px solid rgba(var(--v-theme-on-surface), 0.3);
  border-radius: 6px;
  background: rgba(var(--v-theme-surface), 0.95);
  color: rgba(var(--v-theme-on-surface), 0.55);
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
}

.fs-browse-file-row__select-btn:hover {
  border-color: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-primary));
}

.fs-browse-file-row__select-btn--on {
  background: rgb(var(--v-theme-primary));
  border-color: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}

.fs-browse-file-row__select-btn--on:hover {
  background: rgb(var(--v-theme-primary-darken-1, var(--v-theme-primary)));
  border-color: rgb(var(--v-theme-primary-darken-1, var(--v-theme-primary)));
}

/* List mode — select on the left, round */
.fs-browse-file-row__select-overlay--list {
  justify-content: flex-start;
  align-items: center;
  padding: 0 0 0 10px;
}

.fs-browse-file-row__select-btn--list {
  border-radius: 50%;
  width: 24px;
  height: 24px;
}

.fs-browse-file-row__select-btn--list :deep(.v-icon) {
  font-size: 14px !important;
}
</style>