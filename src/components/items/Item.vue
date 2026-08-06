<template>
  <div
    ref="itemRootRef"
    :disabled="!reg && x > 14"
    :draggable="isMediaDragEnabled"
    @contextmenu.stop="showContextMenu"
    @mousedown="onItemMouseDown"
    @dragstart="onMediaDragStart"
    :class="[
      {favorite: is_favorite_active && item.favorite},
      {'big-preview': big_preview},
      {'item-media': type === 'media'},
      {'item-tag': type === 'tag'},
      {'item--selecting': itemsStore.isSelect},
      {'item--inspector-focused': isInspectorFocused},
      {'item--keyboard-cursor': isKeyboardCursor},
      {'item--context-target': is_context_target},
      `item__size-${itemsStore.size}`,
      `item-view-${itemsStore.view}`,
    ]"
    class="item"
    :data-item-id="item.id"
  >
    <v-card
      v-if="showCardView"
      class="item_wrapper"
      :color="card_color"
      variant="flat"
      :hover="true"
    >
      <div class="item_preview">
        <ItemPreviewVideo
          v-if="type === 'media' && isVideoMedia"
          @update-big-preview="(val) => big_preview = val"
          :media="item"
          :is-file-exists="is_file_exists"
          :preview-active="showPreview"
        />
        <ItemPreviewImage
          v-else-if="type === 'media' && isImageMedia"
          :media="item"
          :is-file-exists="is_file_exists"
          :preview-active="showPreview"
        />
        <ItemPreviewAudio
          v-else-if="type === 'media' && isAudioMedia"
          :media="item"
          :is-file-exists="is_file_exists"
        />
        <ItemPreviewText
          v-else-if="type === 'media' && isTextMedia"
          :media="item"
          :is-file-exists="is_file_exists"
        />
        <ItemPreviewTag
          v-if="type=='tag'"
          :tag="item"
          :meta="previewMeta"
          :preview-active="showPreview"
        />

        <ItemRating
          v-if="!isImageOnlyView && settingsStore.ratingAndFavoriteInCard != '1' && is_rating_active"
          :item="item"
          :type="type"
        ></ItemRating>
        <ItemFavorite
          v-if="!isImageOnlyView && settingsStore.ratingAndFavoriteInCard != '1' && is_favorite_active"
          :item="item"
          :type="type"
        ></ItemFavorite>
        <div v-if="!reg && x > 14"
             class="reg-block"
             v-html="'App not registered'"/>
      </div>

      <div
        v-if="isMasonryImage && showPreview"
        class="masonry-meta-overlay"
        @click.stop="handleCardActivate"
        @dblclick.stop="editItem"
      >
        <div
          v-if="settingsStore.ratingAndFavoriteInCard == '1' && (is_rating_active || is_favorite_active)"
          class="masonry-meta-overlay__rating"
          @click.stop
        >
          <div class="masonry-meta-overlay__rating-left">
            <ItemRating
              v-if="is_rating_active"
              :item="item"
              :type="type"
            />
          </div>
          <div class="masonry-meta-overlay__rating-right">
            <ItemFavorite
              v-if="is_favorite_active"
              :item="item"
              :type="type"
            />
          </div>
        </div>

        <div
          class="masonry-meta-overlay__title"
          :title="item.name"
        >
          {{ item.name }}
        </div>

        <ItemPinnedMeta
          :item="item"
          :tags="item.tags"
          :values="item.values"
          :type="type"
        />
      </div>

      <v-progress-linear
        v-if="!isImageOnlyView && type === 'media' && (isVideoMedia || isAudioMedia) && item.duration"
        :model-value="(Number(item.time || 0) / Number(item.duration)) * 100"
        color="primary"
      />

      <div
        v-if="!isImageOnlyView && !(type === 'media' && isImageMedia && itemsStore.view == 3)"
        @click="handleCardActivate"
        @dblclick="editItem"
        v-ripple="{ class: `text-primary` }"
        class="description"
      >
        <div v-if="settingsStore.ratingAndFavoriteInCard == '1' && (is_rating_active || is_favorite_active)"
             @click.stop
             class="rating-favorite-in-description">
          <div class="rating-favorite-in-description__left">
            <ItemRating v-if="is_rating_active"
                        :item="item"
                        :type="type"></ItemRating>
          </div>
          <div class="rating-favorite-in-description__right">
            <ItemFavorite v-if="is_favorite_active"
                          :item="item"
                          :type="type"></ItemFavorite>
          </div>
        </div>
        <div
          v-if="!(itemsStore.view == 2 && type === 'media' && isVideoMedia)"
          class="item-title"
        >
          <span v-text="item.name"
                :title="item.name"/>
        </div>
        <div
          v-if="meta?.synonyms && item.synonyms"
          class="px-1 synonyms text-medium-emphasis"
          v-html="item.synonyms"
        />

        <ItemPinnedMeta
          :item="item"
          :tags="item.tags"
          :values="item.values"
          :type="type"
        />
      </div>

      <v-icon
        v-if="!isImageOnlyView && item.bookmark"
        :title="item.bookmark"
        icon="mdi-bookmark"
        class="bookmark"
        color="red"
      />

      <v-btn
        v-if="showSimilarAction"
        class="item-similar-btn"
        size="small"
        variant="text"
        icon
        :title="similarActionTitle"
        @mousedown.stop
        @mouseup.stop.prevent="openSimilarWall"
        @click.stop.prevent
      >
        <v-icon
          size="x-large"
          icon="mdi-brain"
        />
      </v-btn>

      <v-btn @mouseup="showContextMenu"
             class="item-menu-btn"
             size="small"
             variant="text"
             icon>
        <v-icon size="x-large"
                icon="mdi-dots-vertical"></v-icon>
      </v-btn>

      <div
        v-if="isImageOnlyView"
        class="item-minimal-filename text-caption"
        :title="minimalFilename"
        @click.stop="handleCardActivate"
        @dblclick.stop="editItem"
      >
        <span class="item-minimal-filename__text">{{ minimalFilename }}</span>
      </div>
    </v-card>

    <v-chip
      v-else-if="itemsStore.view == 2 && type == 'tag'"
      @contextmenu.stop="showContextMenu"
      @mousedown="stopSmoothScroll($event)"
      @mouseover.stop="showHoverImage($event, tagMetaId, item.id, 'tag', {
        label: item.name,
        imageAspectRatio: meta?.imageAspectRatio,
      })"
      @mouseleave.stop="hideHoverImage"
      :variant="tagChipVariant"
      :color="tagChipColor"
      :style="tagChipStyle"
      :size="getChipSize"
      :label="meta?.chipLabel === true"
      :rounded="meta?.chipLabel === true ? false : 'pill'"
      :class="['tag-chip-view', tagChipClass]"
    >
      <ItemPreviewTag v-if="tagItem && showPreview"
                      :tag="tagItem"
                      :meta="previewMeta"></ItemPreviewTag>
      <div @click="handleCardActivate"
           @dblclick="editItem"
           class="tag-chip-view__label">{{ item.name }}
      </div>
    </v-chip>

    <div
      v-if="itemsStore.isSelect"
      :draggable="isMediaDragEnabled"
      @click.stop="toggleSelect"
      @dragstart.stop="onMediaDragStart"
      :class="{ 'item-select-overlay--selected': is_selected }"
      class="item-select-overlay"
    >
      <v-btn v-if="is_selected"
             color="primary"
             variant="elevated"
             icon>
        <v-icon> mdi-check</v-icon>
      </v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import {ref, computed, watch, onBeforeUnmount} from 'vue'
import {useI18n} from 'vue-i18n'
import {useItemsStore} from '@/stores/items'
import {useSettingsStore} from '@/stores/settings'
import {useDialogsStore} from '@/stores/dialogs'
import {useContextMenu} from '@/stores/contextMenu'
import ItemPreviewVideo from '@/components/items/ItemPreviewVideo.vue'
import ItemPreviewImage from '@/components/items/ItemPreviewImage.vue'
import ItemPreviewAudio from '@/components/items/ItemPreviewAudio.vue'
import ItemPreviewText from '@/components/items/ItemPreviewText.vue'
import ItemPreviewTag from '@/components/items/ItemPreviewTag.vue'
import ItemPinnedMeta from '@/components/items/ItemPinnedMeta.vue'
import ItemRating from '@/components/items/ItemRating.vue'
import ItemFavorite from '@/components/items/ItemFavorite.vue'
import useItemContextMenu from '@/composable/ItemContextMenu'
import {useLazyInView} from '@/composable/useLazyInView'
import {useBrowserLayout} from '@/composable/useBrowserLayout'
import {isAudioMediaType, isImageMediaType, isTextMediaType, isVideoMediaType, getMediaDeleteAssetFolder} from '@/utils/mediaType'
import {checkFileExists as checkPathExists} from '@/services/fileService'
import {getTextColor, hexToRgba} from '@/services/formatUtils'
import {isNearWhiteColor} from '@/utils/headerColorUtils'
import {hideHoverImage, showHoverImage} from '@/services/hoverService'
import {isImageOnlyItemsView} from '@/utils/itemsView'
import {
  canNativeMediaDragOut,
  collectMediaDragPaths,
  isOutboundMediaDragActive,
  onOutboundMediaDragChange,
  setOutboundMediaDragActive,
  startNativeMediaDragOut,
} from '@/utils/mediaDragOut'
import {buildMediaDragGhostDataUrl} from '@/utils/mediaDragGhost'
import {isMediaPageItem, isTagPageItem} from '@/utils/pageItem'
import {markItemHidden, markItemVisible} from '@/utils/visibleItemsWindow'
import {toChipVariant} from '@/utils/chipVariant'
import {resolveTagChipColor} from '@shared/tagChipColor'
import {useAppStore} from '@/stores/app'
import path from 'path-browserify'
import type {MediaType} from '@/types/media'
import type {ContextMenuEntry, MediaItem, Meta, Tag} from '@/types/stores'

const props = withDefaults(defineProps<{
  item: MediaItem | Tag
  reg?: boolean
  x?: number
  type?: 'media' | 'tag'
  meta?: Meta | null
  mediaType?: MediaType | null
}>(), {
  reg: true,
  x: 0,
  type: 'media',
})

const emit = defineEmits<{
  getItemsFromDb: []
  getTabs: []
  parseMetadata: []
  removeEntitiesFromState: []
  getTags: []
  playVideo: [payload: unknown]
}>()

const itemsStore = useItemsStore()
const settingsStore = useSettingsStore()
const dialogsStore = useDialogsStore()
const appStore = useAppStore()
const contextMenuStore = useContextMenu()
const {useBrowserLayout: browserLayoutActive} = useBrowserLayout()
const {t} = useI18n()

const contextMenu = computed(() => contextMenuStore)

const is_file_exists = ref(true)
const big_preview = ref(false)
const itemRootRef = ref<HTMLElement | null>(null)
const checkedFilePath = ref<string | null>(null)
const { isInView, wasInView } = useLazyInView(itemRootRef, { rootMargin: '200px 0px' })

const showPreview = computed(() => isInView.value)

const isVideoMedia = computed(() => isVideoMediaType(props.mediaType ?? undefined))
const isImageMedia = computed(() => isImageMediaType(props.mediaType ?? undefined))
const isAudioMedia = computed(() => isAudioMediaType(props.mediaType ?? undefined))
const isTextMedia = computed(() => isTextMediaType(props.mediaType ?? undefined))

const showSimilarAction = computed(() =>
  props.type === 'media'
  && !itemsStore.isSelect
  && (isVideoMedia.value || isImageMedia.value),
)

const similarActionTitle = computed(() => t('context_menu.semantically_similar'))

const isImageOnlyView = computed(() => isImageOnlyItemsView(itemsStore.view))

const isMasonryImage = computed(() =>
  props.type === 'media'
  && isImageMedia.value
  && Number(itemsStore.view) === 3
)

const showCardView = computed(() => {
  const view = Number(itemsStore.view)
  if (view === 1 || isImageOnlyView.value) return true
  if (view === 2 && props.type === 'media' && isVideoMedia.value) return true
  if (view === 3 && props.type === 'media' && isImageMedia.value) return true
  return false
})

const tagItem = computed((): Tag | null => (
  isTagPageItem(props.item, props.type) ? props.item : null
))

const mediaItem = computed((): MediaItem | null => (
  isMediaPageItem(props.item, props.type) ? props.item : null
))

const minimalFilename = computed(() => {
  if (mediaItem.value) {
    if (mediaItem.value.basename) return mediaItem.value.basename
    if (mediaItem.value.path) return path.basename(mediaItem.value.path)
    return mediaItem.value.name || ''
  }
  return props.item.name || ''
})

const tagMetaId = computed((): number | null => {
  if (props.meta?.id) return props.meta.id
  const metaId = tagItem.value?.metaId
  return typeof metaId === 'number' ? metaId : null
})

const previewMeta = computed((): Meta => props.meta ?? { id: 0 })

type ChipVariant = import('@/utils/chipVariant').ChipVariant

const tagChipVariant = computed((): ChipVariant | undefined =>
  toChipVariant(props.meta?.chipVariant),
)

const tagChipColor = computed((): string | undefined => {
  if (props.type !== 'tag') return undefined
  return resolveTagChipColor(props.meta?.color, props.item.color)
})

const tagChipStyle = computed(() => {
  const color = tagChipColor.value
  if (!color) return undefined
  const textColor = getTextColor(color, tagChipVariant.value === 'outlined')
  return textColor ? {color: textColor} : undefined
})

const tagChipClass = computed(() => {
  const color = tagChipColor.value
  if (!color) return undefined
  return [
    'tag-chip--colored',
    isNearWhiteColor(color) ? 'tag-chip--light' : undefined,
  ].filter(Boolean).join(' ')
})

const is_selected = computed(() => {
  return itemsStore.selection.includes(props.item.id)
})

const isMediaDragEnabled = computed(() => (
  props.type === 'media'
  && canNativeMediaDragOut()
  && Boolean(mediaItem.value?.path)
  && is_file_exists.value !== false
))

/** Suppress the synthetic click that fires when a native drag ends over the card. */
let suppressEditClicks = false
let suppressEditClickListener: ((event: MouseEvent) => void) | null = null
let suppressEditMouseUpListener: ((event: MouseEvent) => void) | null = null
let suppressEditTimeout: ReturnType<typeof setTimeout> | null = null
let suppressOutboundUnsub: (() => void) | null = null

function clearEditClickSuppress() {
  suppressEditClicks = false
  if (suppressEditClickListener) {
    window.removeEventListener('click', suppressEditClickListener, true)
    suppressEditClickListener = null
  }
  if (suppressEditMouseUpListener) {
    window.removeEventListener('mouseup', suppressEditMouseUpListener, true)
    suppressEditMouseUpListener = null
  }
  if (suppressOutboundUnsub) {
    suppressOutboundUnsub()
    suppressOutboundUnsub = null
  }
  if (suppressEditTimeout) {
    clearTimeout(suppressEditTimeout)
    suppressEditTimeout = null
  }
}

function scheduleEditClickDisarm(ms: number) {
  if (suppressEditTimeout) clearTimeout(suppressEditTimeout)
  suppressEditTimeout = setTimeout(() => {
    clearEditClickSuppress()
  }, ms)
}

function armEditClickSuppress() {
  clearEditClickSuppress()
  suppressEditClicks = true

  // Capture-phase: block the click that follows releasing a drag over the card.
  suppressEditClickListener = (event: MouseEvent) => {
    if (!suppressEditClicks) return
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
  }

  // Do not disarm on mouseup while OS outbound drag is active — macOS can
  // deliver mouseup mid-drag / at startDrag, which previously cleared suppress
  // before the user released over the description.
  suppressEditMouseUpListener = () => {
    if (isOutboundMediaDragActive()) return
    scheduleEditClickDisarm(600)
  }

  // Only disarm when outbound transitions true → false. Ignore the initial
  // sync callback (mousemove arms suppress before outbound starts).
  let sawOutbound = isOutboundMediaDragActive()
  suppressOutboundUnsub = onOutboundMediaDragChange((active) => {
    if (active) {
      sawOutbound = true
      if (suppressEditTimeout) {
        clearTimeout(suppressEditTimeout)
        suppressEditTimeout = null
      }
      return
    }
    if (!sawOutbound) return
    scheduleEditClickDisarm(750)
  })

  window.addEventListener('click', suppressEditClickListener, true)
  window.addEventListener('mouseup', suppressEditMouseUpListener, true)
}

const onMediaDragStart = (event: DragEvent) => {
  // Suppress drop-in overlay immediately — dragenter can race with this handler.
  // On macOS startDrag returns early; keep this flag until mouseup/blur.
  setOutboundMediaDragActive(true)
  window.mediaDragAPI?.beginOutboundDrag?.()
  armEditClickSuppress()

  if (!isMediaDragEnabled.value || !mediaItem.value) {
    event.preventDefault()
    setOutboundMediaDragActive(false)
    window.mediaDragAPI?.endOutboundDrag?.()
    return
  }

  const paths = collectMediaDragPaths(
    mediaItem.value,
    itemsStore.selection,
    {
      getItemById: itemsStore.getItemById,
      itemsOnPage: itemsStore.itemsOnPage,
      entities: itemsStore.entities,
    },
  )

  if (paths.length === 0) {
    event.preventDefault()
    setOutboundMediaDragActive(false)
    window.mediaDragAPI?.endOutboundDrag?.()
    return
  }

  // Hand off to Electron native file drag; do not use HTML5 Files transfer.
  event.preventDefault()
  const folder = getMediaDeleteAssetFolder(props.mediaType ?? undefined) || 'videos'
  const thumbPath = appStore.mediaPath
    ? path.join(appStore.mediaPath, folder, 'thumbs', `${mediaItem.value.id}.jpg`)
    : null
  // Main builds the rounded card ghost (with thumb) via sharp; renderer icon is fallback only.
  const iconDataUrl = buildMediaDragGhostDataUrl({
    cardEl: itemRootRef.value,
    title: mediaItem.value.name,
    count: paths.length,
    thumbPath,
  })
  startNativeMediaDragOut(paths, {
    iconDataUrl,
    thumbPath,
    title: mediaItem.value.name,
    count: paths.length,
  })
}

const isInspectorFocused = computed(() =>
  browserLayoutActive.value
  && !itemsStore.isSelect
  && itemsStore.selection.length === 1
  && is_selected.value,
)

const isKeyboardCursor = computed(() =>
  itemsStore.isSelect
  && itemsStore.selected_last != null
  && Number(itemsStore.selected_last) === Number(props.item.id),
)

const is_context_target = computed(() => {
  return contextMenuStore.show
    && contextMenuStore.targetNestedTagId == null
    && contextMenuStore.targetItemId != null
    && Number(contextMenuStore.targetItemId) === Number(props.item.id)
})

const card_color = computed(() => {
  // Media cards must stay uncolored; only tag category cards may use a tint.
  if (props.type !== 'tag' || !props.meta?.color) return ''
  const color = tagChipColor.value
  return color ? hexToRgba(color, 9) : ''
})

const is_rating_active = computed(() => {
  return props.type === 'tag' ? props.meta?.rating : true
})

const is_favorite_active = computed(() => {
  return props.type === 'tag' ? props.meta?.favorite : true
})

const getChipSize = computed(() => {
  switch (itemsStore.size) {
    case 1:
      return 'x-small'
    case 2:
      return 'small'
    case 4:
      return 'large'
    case 5:
      return 'x-large'
    default:
      return 'default'
  }
})

const stopSmoothScroll = (event: MouseEvent) => {
  if (event.button != 1) return
  event.preventDefault()
  event.stopPropagation()
}

const onItemMouseDown = (event: MouseEvent) => {
  stopSmoothScroll(event)
  if (event.button !== 0 || !isMediaDragEnabled.value) return

  const startX = event.clientX
  const startY = event.clientY
  const onMove = (moveEvent: MouseEvent) => {
    if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < 5) return
    armEditClickSuppress()
    cleanup()
  }
  const cleanup = () => {
    window.removeEventListener('mousemove', onMove, true)
    window.removeEventListener('mouseup', cleanup, true)
  }
  window.addEventListener('mousemove', onMove, true)
  window.addEventListener('mouseup', cleanup, true)
}

const editItem = () => {
  if (suppressEditClicks) return
  if (isMediaPageItem(props.item, props.type)) {
    dialogsStore.editMedia(props.item, props.mediaType ?? undefined)
  } else if (isTagPageItem(props.item, props.type) && props.meta) {
    dialogsStore.editTag(props.item, props.meta)
  }
}

const openSimilarWall = () => {
  if (!isMediaPageItem(props.item, props.type)) return
  const seedId = Number(props.item.id)
  if (!Number.isFinite(seedId) || seedId <= 0) return
  dialogsStore.openSimilarWall({
    seedId,
    mediaTypeId: props.item.mediaTypeId || props.mediaType?.id || null,
  })
}

const handleCardActivate = (e?: MouseEvent) => {
  if (itemsStore.isSelect) {
    itemsStore.toggleSelect(e ?? null, props.item)
    return
  }

  if (browserLayoutActive.value) {
    if (e && (e.ctrlKey || e.metaKey || e.shiftKey)) {
      itemsStore.toggleSelect(e, props.item)
      return
    }
    itemsStore.focusForInspector(props.item)
    return
  }

  editItem()
}

const showContextMenu = (e: MouseEvent) => {
  e.preventDefault()

  const {getContextMenu} = useItemContextMenu(
    props.item,
    props.type,
    props.meta,
    is_file_exists.value,
    emit,
  )

  const content = getContextMenu()

  contextMenu.value.showContextMenu({
    content: content as ContextMenuEntry[],
    x: e.clientX,
    y: e.clientY,
    tagMeta: props.meta,
    targetItemId: props.item.id,
  })
}

const toggleSelect = (e: MouseEvent) => {
  itemsStore.toggleSelect(e, props.item)
}

watch(isInView, (visible) => {
  const id = Number(props.item.id)
  if (!Number.isFinite(id)) return
  if (visible) markItemVisible(id)
  else markItemHidden(id)
}, { immediate: true })

onBeforeUnmount(() => {
  markItemHidden(Number(props.item.id))
  clearEditClickSuppress()
})

watch(
  () => [wasInView.value, mediaItem.value?.path] as const,
  ([visible, path]) => {
    if (!visible || !path) return
    if (checkedFilePath.value === path) return

    checkedFilePath.value = path
    void checkPathExists(path).then((exists) => {
      if (mediaItem.value?.path !== path) return
      is_file_exists.value = exists
    })
  },
)

watch(
  () => mediaItem.value?.path ?? null,
  (path) => {
    if (path !== checkedFilePath.value) {
      checkedFilePath.value = null
      is_file_exists.value = true
    }
  },
)
</script>