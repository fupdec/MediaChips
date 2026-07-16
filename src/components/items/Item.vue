<template>
  <div
    ref="itemRootRef"
    :disabled="!reg && x > 14"
    @contextmenu.stop="showContextMenu"
    @mousedown="stopSmoothScroll($event)"
    :class="[
      {favorite: is_favorite_active && item.favorite},
      {'big-preview': big_preview},
      {'item-media': type === 'media'},
      {'item-tag': type === 'tag'},
      {'item--selecting': itemsStore.isSelect},
      `item__size-${itemsStore.size}`,
      `item-view-${itemsStore.view}`,
    ]"
    class="item"
  >
    <v-card
      v-if="itemsStore.view == 1 || (itemsStore.view == 2 && type === 'media' && isVideoMedia) || (itemsStore.view == 3 && type === 'media' && isImageMedia)"
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
          v-if="settingsStore.ratingAndFavoriteInCard != '1' && is_rating_active"
          :item="item"
          :type="type"
        ></ItemRating>
        <ItemFavorite
          v-if="settingsStore.ratingAndFavoriteInCard != '1' && is_favorite_active"
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
        @click.stop="editItem"
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
        v-if="type === 'media' && (isVideoMedia || isAudioMedia) && item.duration"
        :model-value="(Number(item.time || 0) / Number(item.duration)) * 100"
        color="primary"
      />

      <div
        v-if="!(type === 'media' && isImageMedia && itemsStore.view == 3)"
        @click="editItem"
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
        v-if="item.bookmark"
        :title="item.bookmark"
        icon="mdi-bookmark"
        class="bookmark"
        color="red"
      />

      <v-btn @mouseup="showContextMenu"
             class="item-menu-btn"
             size="small"
             variant="text"
             icon>
        <v-icon size="x-large"
                icon="mdi-dots-vertical"></v-icon>
      </v-btn>
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
      :color="meta?.color ? item.color || '' : ''"
      :size="getChipSize"
      :label="meta?.chipLabel === true"
      :rounded="meta?.chipLabel === true ? false : 'pill'"
      class="tag-chip-view"
    >
      <ItemPreviewTag v-if="tagItem && showPreview"
                      :tag="tagItem"
                      :meta="previewMeta"></ItemPreviewTag>
      <div @click="editItem"
           class="tag-chip-view__label">{{ item.name }}
      </div>
    </v-chip>

    <div
      v-if="itemsStore.isSelect"
      @click.stop="toggleSelect"
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
import {isAudioMediaType, isImageMediaType, isTextMediaType, isVideoMediaType} from '@/utils/mediaType'
import {checkFileExists as checkPathExists} from '@/services/fileService'
import {hexToRgba} from '@/services/formatUtils'
import {hideHoverImage, showHoverImage} from '@/services/hoverService'
import {isMediaPageItem, isTagPageItem} from '@/utils/pageItem'
import {markItemHidden, markItemVisible} from '@/utils/visibleItemsWindow'
import {toChipVariant} from '@/utils/chipVariant'
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
const contextMenuStore = useContextMenu()

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

const isMasonryImage = computed(() =>
  props.type === 'media'
  && isImageMedia.value
  && Number(itemsStore.view) === 3
)

const tagItem = computed((): Tag | null => (
  isTagPageItem(props.item, props.type) ? props.item : null
))

const mediaItem = computed((): MediaItem | null => (
  isMediaPageItem(props.item, props.type) ? props.item : null
))

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

const is_selected = computed(() => {
  return itemsStore.selection.includes(props.item.id)
})

const card_color = computed(() => {
  const default_color = ''
  if (props.meta?.color) {
    return props.item.color ? hexToRgba(props.item.color, 9) : default_color
  } else {
    return default_color
  }
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

const editItem = () => {
  if (isMediaPageItem(props.item, props.type)) {
    dialogsStore.editMedia(props.item, props.mediaType ?? undefined)
  } else if (isTagPageItem(props.item, props.type) && props.meta) {
    dialogsStore.editTag(props.item, props.meta)
  }
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