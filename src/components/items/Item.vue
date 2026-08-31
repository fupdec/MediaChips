<template>
  <div
    ref="itemRootRef"
    :draggable="isCardDragEnabled"
    @contextmenu.stop="showContextMenu"
    @mousedown="onItemMouseDown"
    @dragstart="onCardDragStart"
    @dragend="onCardDragEnd"
    @dragover="onMediaTagDragOver"
    @dragleave="onMediaTagDragLeave"
    @drop="onMediaTagDrop"
    :class="[
      {favorite: is_favorite_active && item.favorite},
      {'big-preview': big_preview},
      {'item-media': type === 'media'},
      {'item-tag': type === 'tag'},
      {'item--selecting': itemsStore.isSelect},
      {'item--inspector-focused': isInspectorFocused},
      {'item--keyboard-cursor': isKeyboardCursor},
      {'item--context-target': is_context_target},
      {'item--tag-drop-target': isTagDropTarget},
      `item__size-${itemsStore.size}`,
      `item-view-${itemsStore.view}`,
    ]"
    class="item"
    :data-item-id="item.id"
    :style="itemRootStyle"
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
          v-if="!isImageOnlyView && !isListView && settingsStore.ratingAndFavoriteInCard != '1' && is_rating_active"
          :item="item"
          :type="type"
        ></ItemRating>
        <ItemFavorite
          v-if="!isImageOnlyView && !isListView && settingsStore.ratingAndFavoriteInCard != '1' && is_favorite_active"
          :item="item"
          :type="type"
        ></ItemFavorite>
      </div>

      <div
        v-if="isMasonryOrSquaresImage && showPreview"
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
          :title="cardTitle"
        >
          {{ cardTitle }}
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
        v-if="!isImageOnlyView && !(type === 'media' && isImageMedia && (itemsStore.view == 3 || itemsStore.view == 6))"
        @click="handleCardActivate"
        @dblclick="editItem"
        v-ripple="{ class: `text-primary` }"
        class="description"
      >
        <div v-if="!isListView && settingsStore.ratingAndFavoriteInCard == '1' && (is_rating_active || is_favorite_active)"
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
          <span
            v-text="cardTitle"
            :title="cardTitle"
          />
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

      <div
        v-if="isListView && (is_rating_active || is_favorite_active)"
        @click.stop
        class="list-rating-favorite"
      >
        <ItemRating v-if="is_rating_active"
                    :item="item"
                    :type="type"></ItemRating>
        <ItemFavorite v-if="is_favorite_active"
                      :item="item"
                      :type="type"></ItemFavorite>
      </div>

      <v-icon
        v-if="!isImageOnlyView && item.bookmark"
        :title="item.bookmark"
        icon="mdi-bookmark"
        class="bookmark"
        color="red"
      />

      <v-btn @mouseup="showContextMenu"
             class="item-menu-btn"
             size="small"
             variant="text"
             :ripple="false"
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
      rounded="pill"
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
      <button
        type="button"
        class="item-select-btn"
        :class="{'item-select-btn--on': is_selected}"
        :aria-pressed="is_selected"
        :aria-label="is_selected ? t('appbar.buttons.unselect') : t('appbar.buttons.select')"
        tabindex="-1"
      >
        <v-icon
          size="18"
          :icon="is_selected ? 'mdi-check' : 'mdi-plus'"
        />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import {ref, computed, watch, onMounted, onBeforeUnmount} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRoute} from 'vue-router'
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
import {useBrowserLayout, isInspectorRoute} from '@/composable/useBrowserLayout'
import {isAudioMediaType, isImageMediaType, isTextMediaType, isVideoMediaType, getMediaDeleteAssetFolder, findMediaTypeById} from '@/utils/mediaType'
import {checkFileExists as checkPathExists} from '@/services/fileService'
import {getTagChipTextStyle, hexToRgba} from '@/services/formatUtils'
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
import {
  clearMediaTagDrag,
  isMediaTagDragActive,
  isMediaTagDragEvent,
  onMediaTagDragChange,
  readMediaTagDragPayload,
} from '@/utils/mediaTagDrag'
import {useMediaTagTransfer} from '@/composable/useMediaTagTransfer'
import {useSessionFocusActions} from '@/composable/useSessionFocusActions'
import {writeSessionFocusTagsDrag} from '@/utils/sessionFocusDrag'
import {normalizeSessionFocusTag} from '@/stores/sessionFocus'
import {setNotification} from '@/services/notificationService'
import {isMediaPageItem, isTagPageItem} from '@/utils/pageItem'
import {markItemHidden, markItemVisible} from '@/utils/visibleItemsWindow'
import {bumpMountedItems} from '@/utils/galleryPerfCounters'
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
  /**
   * Virtual grid already windows mounted cards — load thumbs immediately instead of
   * waiting on IntersectionObserver (avoids blank posters after scrollbar seeks).
   */
  eagerPreview?: boolean
  /** Prefer filesystem basename over library title (folder browse). */
  preferFilename?: boolean
}>(), {
  reg: true,
  x: 0,
  type: 'media',
  eagerPreview: false,
  preferFilename: false,
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
const {transferTagToMedia} = useMediaTagTransfer()
const {applyTagToItem} = useSessionFocusActions()
const {useBrowserLayout: browserLayoutActive} = useBrowserLayout()
const route = useRoute()
const {t} = useI18n()

const inspectorClickMode = computed(() =>
  browserLayoutActive.value && isInspectorRoute(route.path),
)

const contextMenu = computed(() => contextMenuStore)

const is_file_exists = ref(true)
const big_preview = ref(false)
const itemRootRef = ref<HTMLElement | null>(null)
const checkedFilePath = ref<string | null>(null)
const isTagDropTarget = ref(false)
const mediaTagDragActive = ref(isMediaTagDragActive())
const { isInView, wasInView } = useLazyInView(itemRootRef, { rootMargin: '400px 0px' })

let unsubscribeMediaTagDrag: (() => void) | null = onMediaTagDragChange((active) => {
  mediaTagDragActive.value = active
  if (!active) isTagDropTarget.value = false
})

const showPreview = computed(() => props.eagerPreview || isInView.value)

const resolvedMediaType = computed(() => {
  if (props.mediaType) return props.mediaType
  if (props.type !== 'media') return null
  return findMediaTypeById(appStore.mediaTypes, (props.item as MediaItem).mediaTypeId)
})

const isVideoMedia = computed(() => isVideoMediaType(resolvedMediaType.value))
const isImageMedia = computed(() => isImageMediaType(resolvedMediaType.value))
const isAudioMedia = computed(() => isAudioMediaType(resolvedMediaType.value))
const isTextMedia = computed(() => isTextMediaType(resolvedMediaType.value))

const isImageOnlyView = computed(() => isImageOnlyItemsView(itemsStore.view))

const isListView = computed(() => Number(itemsStore.view) === 5)

const isMasonryOrSquaresImage = computed(() =>
  props.type === 'media'
  && isImageMedia.value
  && (Number(itemsStore.view) === 3 || Number(itemsStore.view) === 6)
)

const isSquaresGrid = computed(() =>
  props.type === 'media'
  && isImageMedia.value
  && Number(itemsStore.view) === 6
)

const showCardView = computed(() => {
  const view = Number(itemsStore.view)
  if (view === 1 || isImageOnlyView.value) return true
  if (view === 2 && props.type === 'media' && isVideoMedia.value) return true
  if ((view === 3 || view === 6) && props.type === 'media' && isImageMedia.value) return true
  if (view === 5 && (props.type === 'media' || props.type === 'tag')) return true
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

const cardTitle = computed(() =>
  props.preferFilename && props.type === 'media'
    ? minimalFilename.value
    : (props.item.name || ''),
)

const tagMetaId = computed((): number | null => {
  if (props.meta?.id) return props.meta.id
  const metaId = tagItem.value?.metaId
  return typeof metaId === 'number' ? metaId : null
})

const previewMeta = computed((): Meta => props.meta ?? { id: 0 })

const tagPreviewAspectStyle = computed(() => {
  if (props.type !== 'tag') return undefined
  const ratio = Number(previewMeta.value.imageAspectRatio)
  return {
    '--tag-preview-aspect': String(ratio > 0 ? ratio : 1),
  }
})

const itemRootStyle = computed(() => tagPreviewAspectStyle.value)

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
  return getTagChipTextStyle(color, tagChipVariant.value)
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

const isTagCardDragEnabled = computed(() => (
  props.type === 'tag'
  && Number(props.item.id) > 0
  && Number(tagMetaId.value) > 0
))

const isCardDragEnabled = computed(() => isMediaDragEnabled.value || isTagCardDragEnabled.value)

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

const onTagCardDragStart = (event: DragEvent) => {
  const tag = normalizeSessionFocusTag({
    tagId: Number(props.item.id),
    metaId: Number(tagMetaId.value),
    name: String(props.item.name || ''),
    icon: props.meta?.icon ? String(props.meta.icon) : null,
    color: props.item.color ? String(props.item.color) : null,
  })
  if (!tag) {
    event.preventDefault()
    return
  }
  writeSessionFocusTagsDrag(event, [tag])
}

const onCardDragStart = (event: DragEvent) => {
  if (props.type === 'tag') {
    onTagCardDragStart(event)
    return
  }
  onMediaDragStart(event)
}

const onCardDragEnd = () => {
  if (props.type === 'tag') clearMediaTagDrag()
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
  const folder = getMediaDeleteAssetFolder(resolvedMediaType.value ?? undefined) || 'videos'
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

const canAcceptMediaTagDrop = (event: DragEvent): boolean => {
  if (!mediaTagDragActive.value && !isMediaTagDragEvent(event)) return false
  if (props.type === 'media' && mediaItem.value) return true
  if (props.type === 'tag' && tagItem.value) return true
  return false
}

const onMediaTagDragOver = (event: DragEvent) => {
  if (!canAcceptMediaTagDrop(event)) return
  event.preventDefault()
  event.stopPropagation()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = props.type === 'tag' || !event.shiftKey ? 'copy' : 'move'
  }
  isTagDropTarget.value = true
}

const onMediaTagDragLeave = (event: DragEvent) => {
  if (!isTagDropTarget.value) return
  const next = event.relatedTarget
  if (next instanceof Node && itemRootRef.value?.contains(next)) return
  isTagDropTarget.value = false
}

const onMediaTagDrop = async (event: DragEvent) => {
  if (!canAcceptMediaTagDrop(event)) return
  event.preventDefault()
  event.stopPropagation()
  isTagDropTarget.value = false

  const payload = readMediaTagDragPayload(event)
  clearMediaTagDrag()
  if (!payload) return

  if (props.type === 'tag' && tagItem.value) {
    if (Number(payload.tagId) === Number(tagItem.value.id)) return
    const alreadyHad = (tagItem.value.tags || []).some((entry) => Number(entry.tagId) === Number(payload.tagId))
    if (alreadyHad) {
      setNotification({
        type: 'info',
        text: t('items.tag_already_on_card', {name: payload.name || ''}),
      })
      return
    }
    const ok = await applyTagToItem({
      tagId: payload.tagId,
      metaId: payload.metaId,
      name: payload.name || '',
      icon: payload.icon ?? null,
      color: payload.color ?? null,
    }, tagItem.value.id, 'tag')
    setNotification({
      type: ok ? 'success' : 'error',
      text: ok
        ? t('items.tag_copied', {name: payload.name || ''})
        : t('items.tag_transfer_failed'),
    })
    return
  }

  if (!mediaItem.value) return

  const mode = event.shiftKey && Number(payload.sourceMediaId) > 0 ? 'move' : 'copy'
  const result = await transferTagToMedia(payload, mediaItem.value.id, mode)
  if (result.ok) {
    setNotification({
      type: 'success',
      text: mode === 'move'
        ? t('items.tag_moved', {name: payload.name || ''})
        : t('items.tag_copied', {name: payload.name || ''}),
      filePath: mediaItem.value.path,
    })
    return
  }
  if (result.reason === 'already_had') {
    setNotification({
      type: 'info',
      text: t('items.tag_already_on_card', {name: payload.name || ''}),
      filePath: mediaItem.value.path,
    })
    return
  }
  if (result.reason === 'same_card') return
  setNotification({
    type: 'error',
    text: t('items.tag_transfer_failed'),
    filePath: mediaItem.value.path,
  })
}

const isInspectorFocused = computed(() =>
  inspectorClickMode.value
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
    dialogsStore.editMedia(props.item, resolvedMediaType.value ?? undefined)
  } else if (isTagPageItem(props.item, props.type) && props.meta) {
    dialogsStore.editTag(props.item, props.meta)
  }
}

const handleCardActivate = (e?: MouseEvent) => {
  if (itemsStore.isSelect) {
    itemsStore.toggleSelect(e ?? null, props.item)
    return
  }

  if (inspectorClickMode.value) {
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
  if (visible || props.eagerPreview) markItemVisible(id)
  // Do not hide on the initial false — that races virtual-grid prefetch IDs.
  else if (wasInView.value) markItemHidden(id)
}, { immediate: true })

watch(() => props.eagerPreview, (eager) => {
  const id = Number(props.item.id)
  if (!Number.isFinite(id)) return
  if (eager) markItemVisible(id)
}, { immediate: true })

onMounted(() => {
  bumpMountedItems(1)
})

onBeforeUnmount(() => {
  bumpMountedItems(-1)
  markItemHidden(Number(props.item.id))
  clearEditClickSuppress()
  unsubscribeMediaTagDrag?.()
  unsubscribeMediaTagDrag = null
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