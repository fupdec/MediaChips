<template>
  <button
    type="button"
    class="folder-browse-tile"
    :class="{
      'folder-browse-tile--list': list,
      'folder-browse-tile--focused': focused,
    }"
    :data-folder-path="folder.path"
    :aria-label="folder.name"
    :title="folder.path"
    @click="emit('open', folder.path)"
    @dblclick="emit('open', folder.path)"
    @contextmenu.prevent.stop="emit('contextmenu', $event, folder.path)"
  >
    <div class="folder-browse-tile__preview">
      <div
        v-if="coverUrls.length"
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
      <v-icon
        v-else
        icon="mdi-folder"
        :size="list ? 28 : 44"
        color="primary"
      />
      <span
        v-if="folder.mediaCount > 0 && !list"
        class="folder-browse-tile__badge"
      >
        {{ folder.mediaCount }}
      </span>
      <span
        v-if="coverUrls.length && !list"
        class="folder-browse-tile__folder-mark"
        aria-hidden="true"
      >
        <v-icon size="12" icon="mdi-folder"/>
      </span>
      <span
        v-if="list"
        class="folder-browse-tile__media-type-badge"
        aria-hidden="true"
      >
        <v-icon size="12" icon="mdi-folder"/>
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
        v-if="visibleChips.length || list"
        class="folder-browse-tile__meta"
      >
        <span
          v-if="list && folder.mediaCount > 0"
          class="folder-browse-tile__count"
        >
          {{ folder.mediaCount }}
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
</template>

<script setup lang="ts">
import {computed} from 'vue'

export type FolderBrowseTagChip = {
  tagId: number
  name: string
  color?: string | null
}

export type FolderBrowseTileModel = {
  path: string
  name: string
  mediaCount: number
  coverMediaIds?: number[]
}

const props = withDefaults(defineProps<{
  folder: FolderBrowseTileModel
  coverUrls?: string[]
  tags?: FolderBrowseTagChip[]
  focused?: boolean
  list?: boolean
}>(), {
  coverUrls: () => [],
  tags: () => [],
  focused: false,
  list: false,
})

const emit = defineEmits<{
  open: [path: string]
  contextmenu: [event: MouseEvent, path: string]
}>()

const visibleChips = computed(() => (props.tags || []).slice(0, 3))
const overflowCount = computed(() => Math.max(0, (props.tags || []).length - visibleChips.value.length))
</script>

<style scoped>
.folder-browse-tile {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  height: auto;
  box-sizing: border-box;
  padding: 0;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 8px;
  background: rgb(var(--v-theme-surface));
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-align: left;
  overflow: hidden;
  transition: border-color 180ms ease, box-shadow 180ms ease;
}

.folder-browse-tile:hover,
.folder-browse-tile:focus-visible,
.folder-browse-tile--focused {
  border-color: rgb(var(--v-theme-primary));
  outline: none;
}

.folder-browse-tile--focused {
  box-shadow: 0 0 0 2px rgba(var(--v-theme-primary), 0.35);
}

.folder-browse-tile--list {
  flex-direction: row;
  align-items: center;
  border-radius: 8px;
  height: var(--list-card-height, 48px);
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
  background: rgba(var(--v-theme-on-surface), 0.06);
  overflow: hidden;
}

.folder-browse-tile--list .folder-browse-tile__preview {
  width: var(--list-preview-width, 56px);
  min-width: var(--list-preview-width, 56px);
  aspect-ratio: auto;
  height: var(--list-card-height, 48px);
}

.folder-browse-tile__mosaic {
  display: grid;
  width: 100%;
  height: 100%;
  gap: 1px;
  background: rgba(var(--v-theme-on-surface), 0.12);
}

.folder-browse-tile__mosaic--1 {
  grid-template-columns: 1fr;
}

.folder-browse-tile__mosaic--2,
.folder-browse-tile__mosaic--3,
.folder-browse-tile__mosaic--4 {
  grid-template-columns: 1fr 1fr;
}

.folder-browse-tile__cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.folder-browse-tile__badge {
  position: absolute;
  right: 4px;
  bottom: 4px;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
  font-size: 10px;
  line-height: 1;
  font-weight: 600;
}

.folder-browse-tile__folder-mark {
  position: absolute;
  left: 4px;
  top: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  pointer-events: none;
}

.folder-browse-tile--list .folder-browse-tile__media-type-badge {
  position: absolute;
  top: 2px;
  left: 2px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  pointer-events: none;
}

.folder-browse-tile__body {
  box-sizing: border-box;
  min-width: 0;
  padding: 4px 8px 6px;
}

.folder-browse-tile--list .folder-browse-tile__body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 10px;
}

.folder-browse-tile--list .folder-browse-tile__name {
  flex: 1 1 auto;
  width: auto;
  min-width: 0;
  font-size: var(--list-font-size, 13px);
}

.folder-browse-tile__name {
  width: 100%;
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  line-height: 16px;
  color: inherit;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.folder-browse-tile__meta {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  margin-top: 3px;
  overflow: hidden;
}

.folder-browse-tile--list .folder-browse-tile__meta {
  margin-top: 0;
  flex: 0 1 auto;
}

.folder-browse-tile__count {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.folder-browse-tile__chip {
  max-width: 72px;
  padding: 0 5px;
  border-radius: 999px;
  background: rgba(var(--v-theme-primary), 0.18);
  color: inherit;
  font-size: 10px;
  line-height: 16px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.folder-browse-tile__chip--more {
  max-width: none;
  background: rgba(var(--v-theme-on-surface), 0.08);
}
</style>
