<template>
  <div
    ref="rootRef"
    class="item"
    :class="{
      'item--plain-card': plainCard,
      'big-preview': bigPreview,
      'item--selected': selected,
      'item--selecting': selectable && canSelect,
    }"
    @contextmenu.stop="showContextMenu"
  >
    <v-card
      class="item-mark"
      :class="[{ 'no-file': !isFileExists }]"
      :elevation="plainCard ? 2 : undefined"
      @click="onCardClick"
    >
      <div class="item-mark__preview">
        <ItemPreviewVideo
          v-if="videoMedia"
          :media="videoMedia"
          :is-file-exists="isFileExists"
          preview-host="compact"
          v-bind="thumb ? { thumbUrl: thumb } : {}"
          :preview-start-time="markTime"
          :preview-end-time="markEnd"
          :play-time="markTime"
          @update-big-preview="bigPreview = $event"
        />

        <v-sheet
          v-if="clipDurationLabel"
          class="item-mark__duration"
        >{{ clipDurationLabel }}
        </v-sheet>

        <v-sheet
          class="time"
          v-html="time"
        />
      </div>

      <v-card-subtitle
        style="overflow:hidden; white-space:nowrap; text-overflow: ellipsis;"
        :title="mark.medium?.name || mark.medium?.basename || ''"
        class="mt-4"
      >{{ mark.medium?.name || mark.medium?.basename || t('common.unknown') }}
      </v-card-subtitle>
      <v-card-text>
        <v-chip v-if="mark.type === 'meta'"
          :color="mark.tag?.color || 'primary'"
          size="small">
          <v-icon start
            size="small">mdi-{{ mark.tag?.meta?.icon || 'tag' }}
          </v-icon>
          <span>{{ mark.tag?.name || t('common.unknown') }}</span>
        </v-chip>
        <v-chip v-else-if="mark.type === 'favorite'"
          size="small">
          <v-icon color="pink"
            start
            size="small">mdi-heart
          </v-icon>
          <span>{{ t('meta.default_names.favorite') }}</span>
        </v-chip>
        <v-chip v-else-if="mark.type === 'bookmark'"
          :title="mark.text"
          size="small">
          <v-icon color="red"
            start
            size="small">mdi-bookmark
          </v-icon>
          <span>{{ t('meta.default_names.bookmark') }}</span>
        </v-chip>
      </v-card-text>
    </v-card>

    <div
      v-if="selectable && canSelect"
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
          size="18"
          :icon="selected ? 'mdi-check' : 'mdi-plus'"
        />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import {ref, computed, watch, onMounted, onUnmounted} from 'vue'
import type {PropType} from 'vue'
import {useAppStore} from '@/stores/app'
import {useDialogsStore} from '@/stores/dialogs'
import {useItemsStore} from '@/stores/items'
import {useContextMenu} from '@/stores/contextMenu'
import {useI18n} from 'vue-i18n'
import {useEventBus} from '@/utils/eventBus'
import {useLazyInView} from '@/composable/useLazyInView'
import {loadMarkImageDisplayUrl} from '@/utils/markThumb'
import {checkFileExists as checkPathExists} from '@/services/fileService'
import {getReadableDuration} from '@/services/formatUtils'
import {toPlayableMediaItem} from '@/utils/mediaItem'
import {typedApi} from '@/services/typedApi'
import {setNotification} from '@/services/notificationService'
import ItemPreviewVideo from '@/components/items/ItemPreviewVideo.vue'
import type {ContextMenuEntry, MarkItem} from '@/types/stores'

interface ItemMarkerMedium {
  id?: number
  path?: string
  name?: string
  basename?: string
}

interface ItemMarkerTag {
  color?: string
  name?: string
  meta?: { icon?: string }
}

interface ItemMarkerMark extends MarkItem {
  time?: number
  end?: number
  type?: string
  text?: string
  mediumId?: number
  medium?: ItemMarkerMedium
  tag?: ItemMarkerTag
}

const props = defineProps({
  mark: {
    type: Object as PropType<ItemMarkerMark>,
    required: true,
  },
  plainCard: {
    type: Boolean,
    default: false,
  },
  selectable: {
    type: Boolean,
    default: false,
  },
  /** When true, only ranged clips (with end time) show a checkbox / accept card click select. */
  requireRange: {
    type: Boolean,
    default: false,
  },
  selected: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits<{
  'update:selected': [value: boolean, meta?: {shiftKey?: boolean}]
}>()

const appStore = useAppStore()
const itemsStore = useItemsStore()
const dialogsStore = useDialogsStore()
const contextMenuStore = useContextMenu()
const {t} = useI18n()
const eventBus = useEventBus()

const rootRef = ref<HTMLElement | null>(null)
const {wasInView} = useLazyInView(rootRef)
const thumb = ref<string | undefined>(undefined)
const isFileExists = ref(false)
const bigPreview = ref(false)

const videoMedia = computed(() => toPlayableMediaItem(props.mark.medium))
const markId = computed(() => Number(props.mark.id))

const markTime = computed(() => Number(props.mark.time) || 0)
const markEnd = computed(() => {
  const end = props.mark.end
  return typeof end === 'number' ? end : null
})
const canSelect = computed(() => {
  if (!props.selectable) return false
  if (props.requireRange) return markEnd.value != null
  return true
})

const onCardClick = (event: MouseEvent) => {
  if (!props.selectable || !canSelect.value) return
  emit('update:selected', !props.selected, {shiftKey: event.shiftKey})
}

const onSelectClick = (event: MouseEvent) => {
  emit('update:selected', !props.selected, {shiftKey: event.shiftKey})
}

async function openMark() {
  const media = videoMedia.value
  if (!media) return
  await itemsStore.playVideo({
    video: media,
    time: markTime.value,
  })
}

function selectMark(event?: MouseEvent | null) {
  const id = markId.value
  if (!Number.isFinite(id) || id <= 0) return
  if (itemsStore.type === 'mark') {
    itemsStore.toggleSelect(event ?? null, {id})
    return
  }
  emit('update:selected', !props.selected, {shiftKey: Boolean(event?.shiftKey)})
}

function deleteMark() {
  const id = markId.value
  if (!Number.isFinite(id) || id <= 0) return
  dialogsStore.confirm.checkBox = false
  dialogsStore.confirm.checkBox2 = false
  dialogsStore.confirm.checkBox2RequiresPrimary = false
  dialogsStore.confirm.checkBoxText = ''
  dialogsStore.confirm.checkBox2Text = ''
  dialogsStore.confirm.text = t('markers.delete_selected_confirm', {count: 1})
  dialogsStore.confirm.action = async () => {
    try {
      await typedApi.deleteMark(id)
      itemsStore.selection = itemsStore.selection.filter((entry) => Number(entry) !== id)
      eventBus.emit('markers:reload')
      setNotification({
        type: 'success',
        title: t('markers.delete_selected_done', {count: 1}),
      })
    } catch (error) {
      console.warn('Failed deleting mark', id, error)
      setNotification({
        type: 'warning',
        title: t('markers.delete_selected_failed'),
      })
    }
  }
  dialogsStore.confirm.show = true
}

function showContextMenu(event: MouseEvent) {
  event.preventDefault()
  const id = markId.value
  const isSelected = props.selected || itemsStore.selection.includes(id)
  const content: ContextMenuEntry[] = [
    {
      name: t('documentation.open'),
      type: 'item',
      icon: 'open-in-app',
      disabled: !videoMedia.value,
      action: openMark,
    },
    {
      name: isSelected ? t('appbar.buttons.unselect') : t('appbar.buttons.select'),
      type: 'item',
      icon: isSelected ? 'checkbox-blank-outline' : 'checkbox-marked-outline',
      action: (ev?: unknown) => selectMark(ev as MouseEvent),
    },
    {type: 'divider'},
    {
      name: t('common.delete'),
      type: 'item',
      icon: 'delete',
      color: 'red',
      action: deleteMark,
    },
  ]
  contextMenuStore.showContextMenu({
    content,
    x: event.clientX,
    y: event.clientY,
    targetItemId: id,
  })
}

const time = computed(() => {
  const startTime = getReadableDuration(markTime.value)
  if (markEnd.value != null) {
    return startTime + " – " + getReadableDuration(markEnd.value)
  }
  return startTime
})

const clipDurationSec = computed(() => {
  if (markEnd.value == null) return 0
  return Math.max(0, markEnd.value - markTime.value)
})

const clipDurationLabel = computed(() => {
  if (clipDurationSec.value <= 0) return ''
  return getReadableDuration(clipDurationSec.value)
})

const loadThumb = async () => {
  try {
    thumb.value = await loadMarkImageDisplayUrl({
      markId: props.mark.id,
      mediaPath: appStore.mediaPath,
      mediaId: props.mark.medium?.id || props.mark.mediumId,
    })
  } catch (e) {
    console.log('Error loading image:', e)
  }
}

const checkMarkFileExists = async () => {
  const mediumPath = props.mark.medium?.path
  isFileExists.value = mediumPath ? await checkPathExists(mediumPath) : false
}

const handleUpdateMarkImage = (id: unknown) => {
  if (props.mark.id === id) {
    void loadThumb()
  }
}

watch(wasInView, (visible) => {
  if (!visible) return
  void loadThumb()
  void checkMarkFileExists()
})

watch(() => props.mark.id, () => {
  void loadThumb()
  void checkMarkFileExists()
})

onMounted(() => {
  eventBus.on('updateMarkImage', handleUpdateMarkImage)
})

onUnmounted(() => {
  eventBus.off('updateMarkImage', handleUpdateMarkImage)
})
</script>

<style lang="scss">
.item-mark {
  position: relative;

  .item-mark__preview {
    position: relative;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    cursor: pointer;
    border-radius: 4px;

    .video-preview-host--compact {
      position: absolute;
      inset: 0;
      height: 100%;
      border-radius: inherit;
    }

    .video-preview-container,
    .video-preview-host__anchor {
      border-radius: inherit;
    }

    .video-preview-container {
      height: 100%;
    }
  }

  &.no-file {
    .thumb {
      filter: saturate(0.1) opacity(50%);
    }
  }

  .time {
    pointer-events: none;
    position: absolute;
    bottom: 5px;
    right: 5px;
    background: rgba(var(--v-theme-surface), 0.88);
    color: rgb(var(--v-theme-on-surface));
    padding: 0 7px;
    border-radius: 15px;
    font-size: 14px;
    z-index: 3;
  }

  .item-mark__duration {
    pointer-events: none;
    position: absolute;
    bottom: 5px;
    left: 5px;
    background: rgb(0 0 0 / 72%);
    color: #fff;
    padding: 0 7px;
    border-radius: 15px;
    font-size: 13px;
    z-index: 3;
  }
}
</style>
