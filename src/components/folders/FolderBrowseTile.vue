<template>
  <button
    type="button"
    class="folder-browse-tile"
    :aria-label="folder.name"
    @click="emit('open', folder.path)"
    @dblclick="emit('open', folder.path)"
  >
    <div class="folder-browse-tile__preview">
      <v-icon
        icon="mdi-folder"
        size="44"
        color="primary"
      />
      <span
        v-if="folder.mediaCount > 0"
        class="folder-browse-tile__badge"
      >
        {{ folder.mediaCount }}
      </span>
    </div>
    <div class="folder-browse-tile__body">
      <div
        class="folder-browse-tile__name"
        :title="folder.name"
      >
        {{ folder.name }}
      </div>
    </div>
  </button>
</template>

<script setup lang="ts">
export type FolderBrowseTileModel = {
  path: string
  name: string
  mediaCount: number
}

defineProps<{
  folder: FolderBrowseTileModel
}>()

const emit = defineEmits<{
  open: [path: string]
}>()
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
  transition: border-color 180ms ease;
}

.folder-browse-tile:hover,
.folder-browse-tile:focus-visible {
  border-color: rgb(var(--v-theme-primary));
  outline: none;
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

.folder-browse-tile__body {
  box-sizing: border-box;
  flex: 0 0 22px;
  height: 22px;
  padding: 0 8px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
}

.folder-browse-tile__name {
  width: 100%;
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  line-height: 16px;
  letter-spacing: 0;
  color: inherit;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
