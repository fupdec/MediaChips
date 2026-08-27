<template>
  <div
    class="folder-pending-tile-wrapper"
    :class="{
      'folder-pending-tile-wrapper--selecting': selectMode,
      'folder-pending-tile-wrapper--ingesting': ingesting,
      'folder-pending-tile-wrapper--drop': isTagDropTarget,
    }"
    @dragover="onTagDragOver"
    @dragleave="onTagDragLeave"
    @drop="onTagDrop"
  >
    <button
      type="button"
      class="folder-pending-tile"
      :class="{
        'folder-pending-tile--list': list,
        'folder-pending-tile--icons': icons,
        'folder-pending-tile--focused': focused,
        'folder-pending-tile--selected': selected,
      }"
      :data-pending-path="entry.path"
      :aria-label="entry.name"
      :title="entry.path"
      :disabled="ingesting"
      @click="onClick"
      @contextmenu.prevent.stop="emit('contextmenu', $event, entry)"
    >
      <div class="folder-pending-tile__preview">
        <v-icon
          :icon="typeIcon"
          :size="icons ? undefined : (list ? 20 : 36)"
          :style="icons ? {fontSize: 'var(--folder-icon-size, 88px)'} : undefined"
          color="primary"
        />
        <span
          v-if="ingesting"
          class="folder-pending-tile__spinner"
          aria-hidden="true"
        />
      </div>
      <div class="folder-pending-tile__body">
        <div
          class="folder-pending-tile__name"
          :title="entry.name"
        >
          {{ entry.name }}
        </div>
        <div class="folder-pending-tile__meta">
          <span
            v-if="entry.size != null && !list"
            class="folder-pending-tile__size"
          >
            {{ formatSize(entry.size) }}
          </span>
          <span class="folder-pending-tile__chip">
            {{ ingesting
              ? t('folders_browser.adding_to_library')
              : t('media.adding.browser_addable') }}
          </span>
        </div>
      </div>
    </button>
    <button
      v-if="!selectMode"
      type="button"
      class="folder-pending-tile__add"
      :aria-label="t('folders_browser.add_to_library')"
      :disabled="ingesting"
      @click.stop="emit('add', entry)"
    >
      <v-icon size="16" icon="mdi-plus"/>
    </button>
    <div
      v-if="selectMode"
      class="folder-pending-tile__select-overlay"
      :class="{
        'folder-pending-tile__select-overlay--on': selected,
        'folder-pending-tile__select-overlay--list': list,
      }"
      @click.stop="emit('toggle-select', entry)"
    >
      <button
        type="button"
        class="folder-pending-tile__select-btn"
        :class="{
          'folder-pending-tile__select-btn--on': selected,
          'folder-pending-tile__select-btn--list': list,
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
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {getReadableFileSize} from '@/services/formatUtils'
import type {FsBrowseEntry} from '@/components/folders/FsBrowseEntry'
import {
  clearMediaTagDrag,
  isMediaTagDragEvent,
  readMediaTagDragPayload,
  type MediaTagDragPayload,
} from '@/utils/mediaTagDrag'

const {t} = useI18n()

const props = defineProps<{
  entry: FsBrowseEntry
  list?: boolean
  icons?: boolean
  selectMode?: boolean
  selected?: boolean
  focused?: boolean
  ingesting?: boolean
}>()

const emit = defineEmits<{
  contextmenu: [event: MouseEvent, entry: FsBrowseEntry]
  'toggle-select': [entry: FsBrowseEntry]
  add: [entry: FsBrowseEntry]
  focus: [entry: FsBrowseEntry]
  'tag-drop': [entry: FsBrowseEntry, payload: MediaTagDragPayload, mode: 'copy' | 'move']
}>()

const isTagDropTarget = ref(false)

const typeIcon = computed(() => {
  const ext = String(props.entry.extension || '').toLowerCase()
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp'].includes(ext)) return 'mdi-file-image-outline'
  if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'].includes(ext)) return 'mdi-file-music-outline'
  if (['txt', 'md', 'pdf', 'nfo'].includes(ext)) return 'mdi-file-document-outline'
  return 'mdi-file-video-outline'
})

function formatSize(bytes: number): string {
  return getReadableFileSize(bytes)
}

function onClick() {
  if (props.selectMode) {
    emit('toggle-select', props.entry)
    return
  }
  emit('focus', props.entry)
}

function canAcceptTagDrop(event: DragEvent): boolean {
  return isMediaTagDragEvent(event)
}

function onTagDragOver(event: DragEvent) {
  if (!canAcceptTagDrop(event) || props.ingesting) return
  event.preventDefault()
  event.stopPropagation()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = event.shiftKey ? 'move' : 'copy'
  }
  isTagDropTarget.value = true
}

function onTagDragLeave(event: DragEvent) {
  if (!isTagDropTarget.value) return
  const next = event.relatedTarget
  if (next instanceof Node && (event.currentTarget as Node | null)?.contains(next)) return
  isTagDropTarget.value = false
}

function onTagDrop(event: DragEvent) {
  if (!canAcceptTagDrop(event) || props.ingesting) return
  event.preventDefault()
  event.stopPropagation()
  isTagDropTarget.value = false
  const payload = readMediaTagDragPayload(event)
  clearMediaTagDrag()
  if (!payload) return
  emit('tag-drop', props.entry, payload, event.shiftKey ? 'move' : 'copy')
}
</script>

<style scoped>
.folder-pending-tile-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
}

.folder-pending-tile {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  height: 100%;
  box-sizing: border-box;
  padding: 0;
  border: 1px dashed rgba(var(--v-theme-success), 0.45);
  border-radius: 17px;
  background: rgba(var(--v-theme-surface), 0.72);
  color: inherit;
  font: inherit;
  font-size: var(--folder-card-font-size, 1rem);
  cursor: pointer;
  text-align: left;
  overflow: hidden;
  transition: border-color 180ms ease, box-shadow 180ms ease;
}

.folder-pending-tile:hover,
.folder-pending-tile:focus-visible {
  outline: none;
  border-color: rgb(var(--v-theme-success));
  box-shadow: 0 0 0 2px rgba(var(--v-theme-success), 0.18);
}

.folder-pending-tile--focused {
  border-color: rgb(var(--v-theme-primary));
  box-shadow: 0 0 0 2px rgba(var(--v-theme-primary), 0.25);
}

.folder-pending-tile--list {
  flex-direction: row;
  align-items: center;
  height: var(--list-card-height, 48px);
  padding: 0 10px;
  border-radius: 8px;
}

.folder-pending-tile--icons {
  align-items: center;
  height: auto;
  min-height: 0;
  padding: 10px 8px 12px;
  border-radius: 12px;
  background: transparent;
  text-align: center;
}

.folder-pending-tile__preview {
  position: relative;
  flex: 1;
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(var(--v-theme-success), 0.06);
}

.folder-pending-tile--list .folder-pending-tile__preview,
.folder-pending-tile--icons .folder-pending-tile__preview {
  flex: 0 0 auto;
  min-height: 0;
  background: transparent;
}

.folder-pending-tile--list .folder-pending-tile__preview {
  width: var(--list-preview-width, 56px);
  height: var(--list-card-height, 48px);
}

.folder-pending-tile__body {
  box-sizing: border-box;
  padding: 10px 12px 12px;
  min-width: 0;
}

.folder-pending-tile--list .folder-pending-tile__body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 10px;
}

.folder-pending-tile--icons .folder-pending-tile__body {
  width: 100%;
  padding: 8px 2px 0;
}

.folder-pending-tile__name {
  font-weight: 500;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.folder-pending-tile--icons .folder-pending-tile__name {
  white-space: normal;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  text-align: center;
  font-size: 0.82em;
}

.folder-pending-tile__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  min-width: 0;
}

.folder-pending-tile--icons .folder-pending-tile__meta {
  justify-content: center;
  margin-top: 4px;
}

.folder-pending-tile--list .folder-pending-tile__meta {
  margin-top: 0;
  flex: 0 0 auto;
}

.folder-pending-tile__size {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.55);
  white-space: nowrap;
}

.folder-pending-tile__chip {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: rgb(var(--v-theme-success));
  white-space: nowrap;
}

.folder-pending-tile-wrapper--drop .folder-pending-tile {
  border-color: rgb(var(--v-theme-success));
  box-shadow: 0 0 0 2px rgba(var(--v-theme-success), 0.28);
}

.folder-pending-tile__add {
  position: absolute;
  top: auto;
  bottom: 8px;
  right: 8px;
  z-index: 2;
  appearance: none;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 8px;
  background: rgb(var(--v-theme-success));
  color: rgb(var(--v-theme-on-primary));
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 120ms ease;
}

.folder-pending-tile-wrapper:hover .folder-pending-tile__add,
.folder-pending-tile-wrapper:has(.folder-pending-tile--focused) .folder-pending-tile__add {
  opacity: 1;
}

.folder-pending-tile-wrapper:has(.folder-pending-tile--list) .folder-pending-tile__add {
  top: 50%;
  bottom: auto;
  transform: translateY(-50%);
}

.folder-pending-tile-wrapper--ingesting .folder-pending-tile__add {
  pointer-events: none;
  opacity: 0;
}

.folder-pending-tile__spinner {
  position: absolute;
  inset: auto;
  width: 22px;
  height: 22px;
  border: 2px solid rgba(var(--v-theme-success), 0.25);
  border-top-color: rgb(var(--v-theme-success));
  border-radius: 50%;
  animation: folder-pending-spin 700ms linear infinite;
}

@keyframes folder-pending-spin {
  to { transform: rotate(360deg); }
}

.folder-pending-tile__select-overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  border-radius: 17px;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  padding: 8px;
  pointer-events: none;
  opacity: 0;
}

.folder-pending-tile-wrapper:hover .folder-pending-tile__select-overlay,
.folder-pending-tile-wrapper--selecting .folder-pending-tile__select-overlay,
.folder-pending-tile__select-overlay--on {
  opacity: 1;
}

.folder-pending-tile__select-overlay--list {
  justify-content: flex-start;
  align-items: center;
  padding: 0 0 0 10px;
}

.folder-pending-tile__select-btn {
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
}

.folder-pending-tile__select-btn--on {
  background: rgb(var(--v-theme-primary));
  border-color: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}

.folder-pending-tile__select-btn--list {
  border-radius: 50%;
  width: 24px;
  height: 24px;
}
</style>
