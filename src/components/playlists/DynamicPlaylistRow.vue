<template>
  <v-card
    class="dynamic-playlist-row item"
    :class="{
      'dynamic-playlist-row--skeleton': skeleton,
      'dynamic-playlist-row--playing': playing,
      'dynamic-playlist-row--selected': selected,
      'item--selecting': selectable && !skeleton,
    }"
    rounded="lg"
    variant="outlined"
    @click="handleClick"
    @contextmenu.stop="showContextMenu"
    v-ripple="skeleton ? false : { class: 'text-primary' }"
  >
    <div class="dynamic-playlist-row__content">
      <div class="dynamic-playlist-row__preview">
        <v-skeleton-loader
          v-if="skeleton || thumbsLoading"
          type="image"
          class="dynamic-playlist-row__preview-skeleton"
        />

        <div
          v-else-if="displayThumbs.length"
          class="dynamic-playlist-row__thumbs"
        >
          <v-img
            v-for="(thumb, index) in displayThumbs"
            :key="index"
            :src="thumb"
            cover
            class="dynamic-playlist-row__thumb"
          />
        </div>

        <div v-else class="dynamic-playlist-row__preview-empty">
          <v-icon size="22" color="grey-darken-1">mdi-filter-variant</v-icon>
        </div>
      </div>

      <div class="dynamic-playlist-row__info">
        <template v-if="skeleton">
          <v-skeleton-loader type="text" width="55%"/>
          <v-skeleton-loader type="text" width="30%" class="mt-1"/>
        </template>

        <template v-else>
          <div class="dynamic-playlist-row__title" :title="playlist.name">
            {{ playlist.name }}
          </div>
          <div class="dynamic-playlist-row__meta">
            {{ videoCountLabel }}
          </div>
        </template>
      </div>

      <div v-if="!skeleton" class="dynamic-playlist-row__actions">
        <v-btn
          icon
          variant="text"
          class="dynamic-playlist-row__edit"
          @click.stop="emit('edit')"
        >
          <v-icon>mdi-pencil-outline</v-icon>
        </v-btn>

        <v-progress-circular
          v-if="playing"
          indeterminate
          color="primary"
          size="28"
          width="3"
        />
        <v-btn
          v-else
          icon
          variant="text"
          class="dynamic-playlist-row__play"
          @click.stop="emit('play')"
        >
          <v-icon>mdi-play</v-icon>
        </v-btn>
      </div>
    </div>

    <div
      v-if="selectable && !skeleton"
      class="item-select-overlay"
      :class="{'item-select-overlay--selected': selected}"
      @click.stop="onSelectClick"
      @contextmenu.stop="showContextMenu"
    >
      <button
        type="button"
        class="item-select-btn"
        :class="{'item-select-btn--on': selected}"
        :aria-pressed="selected"
        :aria-label="selected ? t('appbar.buttons.unselect') : t('appbar.buttons.select')"
        tabindex="-1"
      >
        <v-icon
          size="16"
          :icon="selected ? 'mdi-check' : 'mdi-plus'"
        />
      </button>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {useItemsStore} from '@/stores/items'
import {useContextMenu} from '@/stores/contextMenu'
import type { PagePlaylist } from '@/types/playlists'
import type { ContextMenuEntry } from '@/types/stores'

const props = withDefaults(defineProps<{
  playlist: PagePlaylist
  skeleton?: boolean
  thumbsLoading?: boolean
  playing?: boolean
  selectable?: boolean
  selected?: boolean
  selectId?: number | null
}>(), {
  skeleton: false,
  thumbsLoading: false,
  playing: false,
  selectable: false,
  selected: false,
  selectId: null,
})

const emit = defineEmits<{
  play: []
  edit: []
  delete: []
  'update:selected': [value: boolean, meta?: {shiftKey?: boolean}]
}>()
const {t} = useI18n()
const itemsStore = useItemsStore()
const contextMenuStore = useContextMenu()

const displayThumbs = computed(() => (props.playlist.thumbs || []).slice(0, 4))

const videoCount = computed(() => {
  if (props.playlist.countLoading) return null
  return Number(props.playlist.count) || 0
})

const videoCountLabel = computed(() => {
  if (videoCount.value == null) return t('playlists.count_loading')
  const count = videoCount.value
  if (count === 0) return t('playlists.no_videos_added')
  if (count === 1) return t('playlists.one_video')
  return t('playlists.video_count', {count})
})

function onSelectClick(event: MouseEvent) {
  emit('update:selected', !props.selected, {shiftKey: event.shiftKey})
}

function selectPlaylist(event?: MouseEvent | null) {
  const id = Number(props.selectId)
  if (Number.isFinite(id) && id !== 0 && itemsStore.type === 'playlist') {
    itemsStore.toggleSelect(event ?? null, {id})
    return
  }
  emit('update:selected', !props.selected, {shiftKey: Boolean(event?.shiftKey)})
}

function showContextMenu(event: MouseEvent) {
  if (props.skeleton) return
  event.preventDefault()
  const id = Number(props.selectId)
  const isSelected = props.selected
    || (Number.isFinite(id) && id !== 0 && itemsStore.selection.includes(id))
  const content: ContextMenuEntry[] = [
    {
      name: t('documentation.open'),
      type: 'item',
      icon: 'playlist-play',
      action: () => emit('play'),
    },
    {
      name: isSelected ? t('appbar.buttons.unselect') : t('appbar.buttons.select'),
      type: 'item',
      icon: isSelected ? 'checkbox-blank-outline' : 'checkbox-marked-outline',
      action: (ev?: unknown) => selectPlaylist(ev as MouseEvent),
    },
    {type: 'divider'},
    {
      name: t('common.delete'),
      type: 'item',
      icon: 'delete',
      color: 'red',
      action: () => emit('delete'),
    },
  ]
  contextMenuStore.showContextMenu({
    content,
    x: event.clientX,
    y: event.clientY,
    targetItemId: Number.isFinite(id) ? id : Number(props.playlist.id),
  })
}

const handleClick = (event: MouseEvent) => {
  if (props.skeleton) return
  if (props.selectable) {
    emit('update:selected', !props.selected, {shiftKey: event.shiftKey})
    return
  }
  emit('play')
}
</script>

<style lang="scss" scoped>
.dynamic-playlist-row {
  cursor: pointer;
  transition: background-color 0.2s ease, border-color 0.2s ease;

  &:hover {
    background: rgba(var(--v-theme-primary), 0.04);
    border-color: rgba(var(--v-theme-primary), 0.35);
  }

  &--selected {
    border-color: rgb(var(--v-theme-primary));
    background: rgba(var(--v-theme-primary), 0.08);
  }
}

.dynamic-playlist-row--skeleton {
  cursor: default;
  pointer-events: none;

  &:hover {
    background: transparent;
    border-color: rgba(var(--v-border-color), var(--v-border-opacity));
  }
}

.dynamic-playlist-row__content {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
}

.dynamic-playlist-row__preview {
  flex-shrink: 0;
  width: 96px;
  height: 54px;
  border-radius: 8px;
  overflow: hidden;
  background: linear-gradient(145deg, #1f1f1f 0%, #121212 100%);
}

.dynamic-playlist-row__preview-skeleton {
  width: 100%;
  height: 100%;
}

.dynamic-playlist-row__preview-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.dynamic-playlist-row__thumbs {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-template-rows: repeat(2, 1fr);
  gap: 1px;
  width: 100%;
  height: 100%;
}

.dynamic-playlist-row__thumb {
  width: 100%;
  height: 100%;
}

.dynamic-playlist-row__info {
  min-width: 0;
  flex: 1;
}

.dynamic-playlist-row__title {
  font-size: 0.95rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dynamic-playlist-row__meta {
  margin-top: 2px;
  font-size: 0.78rem;
  opacity: 0.7;
}

.dynamic-playlist-row__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-shrink: 0;
  gap: 2px;
  min-width: 72px;
}
</style>
