<template>
  <v-navigation-drawer
    v-if="!collapsed"
    app
    clipped
    permanent
    location="right"
    :width="panelWidth"
    class="inspector-panel"
    :class="{
      'inspector-panel--empty': !focusedItem,
      'inspector-panel--edit': inlineEdit,
    }"
  >
    <div class="inspector-panel__inner">
      <div class="inspector-panel__header">
        <span class="inspector-panel__title">{{ t('browser_layout.inspector') }}</span>

        <div class="inspector-panel__header-actions">
          <v-btn
            class="inspector-panel__mode"
            icon
            variant="text"
            size="x-small"
            :aria-label="inlineEdit
              ? t('browser_layout.inspector_mode_view')
              : t('browser_layout.inspector_mode_edit')"
            @click="toggleInlineEdit"
          >
            <v-tooltip activator="parent" location="top">
              {{ inlineEdit
                ? t('browser_layout.inspector_mode_view')
                : t('browser_layout.inspector_mode_edit') }}
            </v-tooltip>
            <v-icon size="16">
              {{ inlineEdit ? 'mdi-eye-outline' : 'mdi-pencil-outline' }}
            </v-icon>
          </v-btn>

          <v-btn
            v-if="focusedItem"
            class="inspector-panel__close"
            icon
            variant="text"
            size="x-small"
            :aria-label="t('browser_layout.clear_selection')"
            @click="clearFocus"
          >
            <v-icon size="16">mdi-close</v-icon>
          </v-btn>

          <v-btn
            class="inspector-panel__toggle"
            icon
            variant="text"
            size="x-small"
            :aria-label="t('browser_layout.collapse_inspector')"
            @click="toggleCollapsed"
          >
            <v-tooltip activator="parent" location="top">
              <span class="d-inline-flex align-center ga-2">
                <span>{{ t('browser_layout.collapse_inspector') }}</span>
                <v-hotkey keys="i" variant="flat"/>
              </span>
            </v-tooltip>
            <v-icon size="18">mdi-chevron-right</v-icon>
          </v-btn>
        </div>
      </div>

      <div
        v-if="!focusedItem"
        class="inspector-panel__empty"
      >
        <v-icon
          size="40"
          class="mb-3 opacity-40"
        >
          mdi-image-outline
        </v-icon>
        <div class="text-body-2 text-medium-emphasis text-center">
          {{ t('browser_layout.inspector_empty') }}
        </div>
        <div class="text-caption text-medium-emphasis text-center mt-2">
          {{ inspectorHint }}
        </div>
      </div>

      <template v-else>
        <div class="inspector-panel__scroll">
          <div
            class="inspector-panel__preview"
            :class="{
              'inspector-panel__preview--clickable': Boolean(previewSrc),
              'inspector-panel__preview--video': isVideoInspectorItem,
            }"
            @click="openPreviewViewer"
          >
            <img
              v-if="previewSrc"
              :key="previewSrc"
              :src="previewSrc"
              alt=""
              class="inspector-panel__thumb"
              @load="onThumbLoad"
              @error="onThumbError"
            >
            <div
              v-else
              class="inspector-panel__thumb-fallback"
            >
              <v-icon size="36" color="medium-emphasis">
                {{ fallbackIcon }}
              </v-icon>
            </div>

            <!-- Overlay buttons for video thumbnail -->
            <div
              v-if="isVideoInspectorItem && previewSrc"
              class="inspector-panel__thumb-overlay"
              @click.stop
            >
              <div class="inspector-panel__thumb-overlay-actions">
                <DialogImageEditing
                  detached
                  compact
                  variant="flat"
                  size="x-small"
                  :icon-size="16"
                  :image="previewSrc"
                  :options="{aspectRatio: 16 / 9}"
                  :image-path="videoThumbPath"
                  :min-width="500"
                  :min-height="281"
                  @edited="onThumbEdited"
                />
                <v-btn
                  size="x-small"
                  variant="flat"
                  color="primary"
                  icon
                  v-tooltip:top="t('image.create_thumb_random')"
                  :loading="isCreatingThumb === 'random'"
                  :disabled="!canCreateThumb || isCreatingThumb != null"
                  @click="createVideoThumb('random')"
                >
                  <v-icon size="16">mdi-dice-5-outline</v-icon>
                </v-btn>
                <v-btn
                  size="x-small"
                  variant="flat"
                  color="primary"
                  icon
                  v-tooltip:top="t('image.create_thumb_default')"
                  :loading="isCreatingThumb === 'default'"
                  :disabled="!canCreateThumb || isCreatingThumb != null"
                  @click="createVideoThumb('default')"
                >
                  <v-icon size="16">mdi-image-frame</v-icon>
                </v-btn>
              </div>
            </div>
          </div>

          <div
            v-if="isTag && galleryImages.length > 1"
            class="inspector-panel__gallery"
          >
            <button
              v-for="image in galleryImages"
              :key="image.type"
              type="button"
              class="inspector-panel__gallery-thumb"
              :class="{'inspector-panel__gallery-thumb--active': activeGalleryType === image.type}"
              :title="image.type"
              @click="activeGalleryType = image.type"
            >
              <img
                :src="image.src"
                alt=""
              >
              <span>{{ image.type }}</span>
            </button>
          </div>

          <div
            v-if="isTag && previewInfoLabel"
            class="inspector-panel__media-info text-medium-emphasis"
          >
            {{ previewInfoLabel }}
          </div>

          <div
            v-if="inspectorFacts.length"
            class="inspector-panel__facts"
          >
            <div
              v-for="fact in inspectorFacts"
              :key="fact.key"
              class="inspector-panel__fact"
            >
              <span class="inspector-panel__fact-label">{{ fact.label }}</span>
              <span class="inspector-panel__fact-value">{{ fact.value }}</span>
            </div>
          </div>

          <div class="inspector-panel__body">
            <div
              class="inspector-panel__name"
              :title="focusedItem.name"
            >
              {{ focusedItem.name || t('browser_layout.untitled') }}
            </div>

            <div
              v-if="mediaPath"
              class="inspector-panel__path text-medium-emphasis"
              :title="mediaPath"
            >
              {{ mediaPath }}
            </div>

            <template v-if="inlineEdit">
              <EditPinnedMetaValues
                v-if="focusedMedia"
                ref="editingRef"
                class="inspector-panel__editor"
                layout="inspector"
                :show-overview="false"
                :media="focusedMedia"
                @dirty-change="formDirty = $event"
                @saved="onSaved"
              />
              <EditPinnedMetaValues
                v-else-if="focusedTag && meta"
                ref="editingRef"
                class="inspector-panel__editor"
                layout="inspector"
                :show-overview="false"
                :tag="focusedTag"
                :meta="meta"
                @dirty-change="formDirty = $event"
                @saved="onSaved"
              />
            </template>

            <template v-else>
              <div
                v-if="tagSynonyms"
                class="inspector-panel__synonyms text-medium-emphasis"
                v-html="tagSynonyms"
              />

              <div
                v-if="tagCountries.length"
                class="inspector-panel__field"
              >
                <div class="inspector-panel__field-label">
                  {{ t('meta.types.country') }}
                </div>
                <div class="inspector-panel__chips">
                  <v-chip
                    v-for="country in tagCountries"
                    :key="country"
                    size="small"
                    class="ma-1"
                    variant="tonal"
                  >
                    {{ country }}
                  </v-chip>
                </div>
              </div>

              <div
                v-if="itemBookmark"
                class="inspector-panel__field"
              >
                <div class="inspector-panel__field-label">
                  {{ t('meta.default_names.bookmark') }}
                </div>
                <div class="inspector-panel__bookmark">
                  {{ itemBookmark }}
                </div>
              </div>

              <div
                v-if="showMetaRow"
                class="inspector-panel__meta-row"
              >
                <v-rating
                  v-if="itemsStore.type === 'media' || meta?.rating"
                  :model-value="Number(focusedItem.rating) || 0"
                  density="compact"
                  half-increments
                  readonly
                  size="small"
                  active-color="yellow-darken-2"
                />
                <v-icon
                  v-if="(itemsStore.type === 'media' || meta?.favorite) && focusedItem.favorite"
                  size="18"
                  color="pink"
                >
                  mdi-heart
                </v-icon>
                <span
                  v-if="itemColor"
                  class="inspector-panel__color-swatch"
                  :style="{backgroundColor: itemColor}"
                  :title="itemColor"
                />
              </div>

              <div class="inspector-panel__section-label">
                {{ t('meta.fields.metadata') }}
              </div>
              <ItemPinnedMeta
                v-if="focusedItem"
                class="inspector-panel__pinned"
                :item="focusedItem"
                :tags="focusedItem.tags"
                :values="focusedItem.values"
                :type="isTag ? 'tag' : 'media'"
                :is-show-all="true"
                :show-preset="isTag"
              />
            </template>
          </div>
        </div>

        <div class="inspector-panel__actions">
          <template v-if="inlineEdit">
            <v-btn
              color="success"
              variant="flat"
              size="small"
              class="inspector-panel__action-btn"
              prepend-icon="mdi-content-save"
              :loading="saving"
              :disabled="!formDirty || saving"
              @click="saveEdits"
            >
              {{ t('common.save') }}
            </v-btn>
            <v-btn
              color="primary"
              variant="tonal"
              size="small"
              class="inspector-panel__action-btn"
              prepend-icon="mdi-pencil-outline"
              :disabled="saving"
              @click="openFullEdit"
            >
              {{ t('browser_layout.open_full_editor') }}
            </v-btn>
          </template>
          <v-btn
            v-else
            color="primary"
            variant="tonal"
            block
            size="small"
            prepend-icon="mdi-pencil-outline"
            @click="openFullEdit"
          >
            {{ t('browser_layout.edit_item') }}
          </v-btn>
        </div>
      </template>
    </div>
  </v-navigation-drawer>

  <v-btn
    v-else
    class="inspector-panel__expand-rail"
    icon
    variant="text"
    size="small"
    :style="{top: `${expandRailTop}px`}"
    :aria-label="t('browser_layout.expand_inspector')"
    @click="toggleCollapsed"
  >
    <v-tooltip activator="parent" location="bottom">
      <span class="d-inline-flex align-center ga-2">
        <span>{{ t('browser_layout.expand_inspector') }}</span>
        <v-hotkey keys="i" variant="flat"/>
      </span>
    </v-tooltip>
    <v-icon size="18">mdi-chevron-left</v-icon>
  </v-btn>
</template>

<script setup lang="ts">
import {computed, defineAsyncComponent, onUnmounted, ref, watch} from 'vue'
import path from 'path-browserify'
import dayjs from 'dayjs'
import {useI18n} from 'vue-i18n'
import EditPinnedMetaValues from '@/components/items/EditPinnedMetaValues.vue'
import ItemPinnedMeta from '@/components/items/ItemPinnedMeta.vue'
import {useAppStore} from '@/stores/app'
import {useSettingsStore} from '@/stores/settings'
import {useItemsStore} from '@/stores/items'
import {useDialogsStore} from '@/stores/dialogs'
import {useEventBus} from '@/utils/eventBus'
import {useItemsListSync} from '@/composable/itemsListSync'
import {reloadTagsCatalog} from '@/composable/appCatalogs'
import {isWinElectronUi} from '@/utils/electronUi'
import {setOption} from '@/services/settingsService'
import {checkFileExists, buildLocalFileUrl} from '@/services/fileService'
import {typedApi} from '@/services/typedApi'
import {
  getReadableBitrate,
  getReadableDuration,
  getReadableFileSize,
} from '@/services/formatUtils'
import {parseCountries} from '@/utils/country'
import {getMediaTypeName} from '@/utils/mediaTypeI18n'
import {
  isAudioMediaType,
  isImageMediaType,
  isTextMediaType,
  isVideoMediaType,
} from '@/utils/mediaType'
import {
  resolveMediaThumbDisplayUrl,
  resolveTagThumbDisplayUrl,
  isThumbUnavailable,
} from '@/utils/thumbSource'
import {invalidateVideoThumbCaches} from '@/utils/thumbDisplayCache'
import {setNotification} from '@/services/notificationService'
import type {MediaItem, Tag} from '@/types/stores'

const props = withDefaults(defineProps<{
  width?: number
}>(), {
  width: undefined,
})

const TAG_GALLERY_TYPES = ['main', 'alt', 'custom1', 'custom2'] as const
type TagGalleryType = typeof TAG_GALLERY_TYPES[number]

type InspectorFact = {
  key: string
  label: string
  value: string
}

type EditComponentInstance = {
  save?: (options?: {itemId?: number}) => Promise<boolean>
  isDirty?: () => boolean
}

const {t} = useI18n()
const appStore = useAppStore()
const settingsStore = useSettingsStore()
const itemsStore = useItemsStore()
const dialogsStore = useDialogsStore()
const eventBus = useEventBus()
const listSync = useItemsListSync()
const winElectronUi = isWinElectronUi()

const DialogImageEditing = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogImageEditing.vue'),
)

const collapsed = computed(() => settingsStore.inspectorCollapsed === '1')
const inlineEdit = computed(() => settingsStore.inspectorInlineEdit !== '0')
const panelWidth = computed(() => props.width ?? (inlineEdit.value ? 360 : 300))
const inspectorHint = computed(() => (
  inlineEdit.value
    ? t('browser_layout.inspector_hint_edit')
    : t('browser_layout.inspector_hint_view')
))

const expandRailTop = computed(() => {
  let top = 48
  if (winElectronUi) top += 32
  if (appStore.tabs.length) top += 28
  return top
})

/** Horizontal space (px) the inspector occupies on the right edge, used by
  * floating elements (e.g. quick-action button) to avoid overlapping it. */
const inspectorRightEdge = computed(() =>
  collapsed.value ? 32 : panelWidth.value,
)

watch(inspectorRightEdge, (px) => {
  document.documentElement.style.setProperty('--app-inspector-width', `${px}px`)
}, {immediate: true})

onUnmounted(() => {
  document.documentElement.style.removeProperty('--app-inspector-width')
})

const thumbFailed = ref(false)
const detectedWidth = ref(0)
const detectedHeight = ref(0)
const galleryImages = ref<Array<{type: TagGalleryType; src: string}>>([])
const activeGalleryType = ref<TagGalleryType | null>(null)
const galleryLoadToken = ref(0)
const editingRef = ref<EditComponentInstance | null>(null)
const formDirty = ref(false)
const saving = ref(false)
const tagAssignmentCounts = ref<{media: number; tags: number} | null>(null)
const tagAssignmentLoadToken = ref(0)

const focusedItem = computed(() => {
  const id = itemsStore.selection[0] ?? itemsStore.selected_last
  if (id == null) return null
  // Cards are rendered from itemsOnPage; use that same live object first so
  // inline card changes (rating/favorite) are reflected immediately here.
  return itemsStore.itemsOnPage.find((item) => item.id === id)
    ?? itemsStore.entities.find((item) => item.id === id)
    ?? null
})

const isTag = computed(() => itemsStore.type === 'tag')

const focusedTag = computed(() =>
  isTag.value && focusedItem.value ? focusedItem.value as Tag : null,
)

const focusedMedia = computed(() =>
  !isTag.value && focusedItem.value ? focusedItem.value as MediaItem : null,
)

const meta = computed(() =>
  itemsStore.type === 'tag' ? itemsStore.meta : null,
)

const mediaType = computed(() => {
  if (!focusedMedia.value) return null
  return appStore.mediaTypes.find((item) => item.id === focusedMedia.value?.mediaTypeId) ?? null
})

const mediaPath = computed(() => String(focusedMedia.value?.path || ''))

const isVideoInspectorItem = computed(() =>
  !isTag.value &&
  focusedMedia.value != null &&
  isVideoMediaType(mediaType.value ?? undefined),
)

const isCreatingThumb = ref<'random' | 'default' | null>(null)

const canCreateThumb = computed(() =>
  Boolean(focusedMedia.value?.id != null && focusedMedia.value?.path),
)

async function createVideoThumb(mode: 'random' | 'default') {
  const media = focusedMedia.value
  if (!media?.id || !media.path || isCreatingThumb.value) return

  isCreatingThumb.value = mode
  try {
    await typedApi.taskCreateThumbForVideo({
      path: media.path,
      id: media.id,
      seekRatio: mode === 'random' ? Math.random() : 0.5,
    })
    invalidateVideoThumbCaches(media.id)
    thumbFailed.value = false
    itemsStore.refreshThumb(media.id)
  } catch (e) {
    console.error(e)
    setNotification({
      title: t('player.video_thumb_not_updated'),
      text: String(e),
      icon: 'image',
      type: 'error',
    })
  } finally {
    isCreatingThumb.value = null
  }
}

function onThumbEdited() {
  if (!focusedMedia.value) return
  invalidateVideoThumbCaches(focusedMedia.value.id)
  thumbFailed.value = false
  itemsStore.refreshThumb(focusedMedia.value.id)
}

const tagSynonyms = computed(() => {
  if (!focusedTag.value?.synonyms) return ''
  return String(focusedTag.value.synonyms)
})

const tagCountries = computed(() => {
  if (!focusedTag.value?.country) return [] as string[]
  return parseCountries(String(focusedTag.value.country))
})

const itemBookmark = computed(() => {
  const value = focusedItem.value?.bookmark
  if (value == null || value === '') return ''
  return String(value)
})

const itemColor = computed(() => {
  const value = focusedItem.value?.color
  if (!value) return ''
  return String(value)
})

const showMetaRow = computed(() => {
  if (!focusedItem.value) return false
  return Boolean(focusedItem.value.rating)
    || Boolean(focusedItem.value.favorite)
    || Boolean(itemColor.value)
})

const mediaWidth = computed(() => {
  if (!focusedItem.value) return 0
  const fromItem = Number((focusedItem.value as MediaItem).width)
  if (Number.isFinite(fromItem) && fromItem > 0) return fromItem
  return detectedWidth.value
})

const mediaHeight = computed(() => {
  if (!focusedItem.value) return 0
  const fromItem = Number((focusedItem.value as MediaItem).height)
  if (Number.isFinite(fromItem) && fromItem > 0) return fromItem
  return detectedHeight.value
})

function formatInspectorDate(value: unknown): string {
  if (value == null || value === '') return ''
  const parsed = dayjs(String(value))
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : String(value)
}

function pushFact(facts: InspectorFact[], key: string, label: string, value: unknown): void {
  if (value == null || value === '') return
  const text = String(value)
  if (!text.trim()) return
  facts.push({key, label, value: text})
}

const mediaFacts = computed((): InspectorFact[] => {
  const media = focusedMedia.value
  if (!media) return []

  const facts: InspectorFact[] = []
  if (mediaWidth.value > 0 && mediaHeight.value > 0) {
    pushFact(
      facts,
      'resolution',
      t('settings_labels.appearance.resolution'),
      `${mediaWidth.value}×${mediaHeight.value}`,
    )
  }

  const duration = Number(media.duration)
  if (Number.isFinite(duration) && duration > 0) {
    pushFact(facts, 'duration', t('settings_labels.appearance.duration'), getReadableDuration(duration))
  }

  const filesize = Number(media.filesize)
  if (Number.isFinite(filesize) && filesize > 0) {
    pushFact(facts, 'filesize', t('settings_labels.appearance.filesize'), getReadableFileSize(filesize))
  }

  pushFact(facts, 'ext', t('settings_labels.appearance.extension'), media.ext)

  if (mediaType.value) {
    pushFact(facts, 'mediaType', t('meta.settings.assignment_anchor_media'), getMediaTypeName(mediaType.value, t))
  }

  pushFact(facts, 'codec', t('settings_labels.appearance.codec'), media.codec)

  const bitrate = Number(media.bitrate)
  if (Number.isFinite(bitrate) && bitrate > 0) {
    pushFact(facts, 'bitrate', t('settings_labels.appearance.bitrate'), getReadableBitrate(bitrate))
  }

  const fps = Number(media.fps)
  if (Number.isFinite(fps) && fps > 0) {
    pushFact(facts, 'fps', t('settings_labels.appearance.framerate'), `${fps}`)
  }

  // Views stay editable in the form — don't duplicate them in edit-mode facts.
  if (!inlineEdit.value) {
    const views = Number(media.views)
    if (Number.isFinite(views) && views > 0) {
      pushFact(facts, 'views', t('settings_labels.appearance.number_of_views'), String(views))
    }
  }

  pushFact(facts, 'mediaCreatedAt', t('editing.media_created'), formatInspectorDate(media.mediaCreatedAt))
  pushFact(facts, 'createdAt', t('editing.added'), formatInspectorDate(media.createdAt))
  pushFact(facts, 'updatedAt', t('editing.last_edit'), formatInspectorDate(media.updatedAt))
  pushFact(facts, 'viewedAt', t('editing.last_view'), formatInspectorDate(media.viewedAt))

  return facts
})

const tagFacts = computed((): InspectorFact[] => {
  if (!isTag.value || !focusedTag.value) return []
  const counts = tagAssignmentCounts.value
  if (!counts) return []

  const facts: InspectorFact[] = []
  pushFact(facts, 'mediaAssignments', t('browser_layout.tag_assignments_media'), String(counts.media))
  pushFact(facts, 'tagAssignments', t('browser_layout.tag_assignments_tags'), String(counts.tags))
  return facts
})

const inspectorFacts = computed((): InspectorFact[] => (
  isTag.value ? tagFacts.value : mediaFacts.value
))

const previewInfoLabel = computed(() => {
  if (!isTag.value) return ''
  const parts: string[] = []
  if (activeGalleryType.value) parts.push(activeGalleryType.value)
  if (mediaWidth.value > 0 && mediaHeight.value > 0) {
    parts.push(`${mediaWidth.value}×${mediaHeight.value}`)
  }
  return parts.join(' · ')
})

const fallbackIcon = computed(() => {
  if (itemsStore.type === 'tag') return 'mdi-tag-outline'
  if (isImageMediaType(mediaType.value ?? undefined)) return 'mdi-image-outline'
  if (isAudioMediaType(mediaType.value ?? undefined)) return 'mdi-music-note'
  if (isTextMediaType(mediaType.value ?? undefined)) return 'mdi-file-document-outline'
  return 'mdi-video-outline'
})

const mediaThumbSrc = computed(() => {
  if (!focusedMedia.value || thumbFailed.value) return null
  if (!appStore.mediaPath) return null

  const id = focusedMedia.value.id
  // Reactive dependency: recompute when a thumbnail is regenerated/edited.
  const bust = itemsStore.thumbRefreshKeys[Number(id)] ?? 0

  let folder = 'videos'
  if (isImageMediaType(mediaType.value ?? undefined)) folder = 'images'
  else if (isAudioMediaType(mediaType.value ?? undefined)) folder = 'audio'
  else if (isTextMediaType(mediaType.value ?? undefined)) folder = 'text'
  else if (!isVideoMediaType(mediaType.value ?? undefined)) folder = 'videos'

  if (isVideoMediaType(mediaType.value ?? undefined)) {
    return buildLocalFileUrl(
      path.join(appStore.mediaPath, folder, 'thumbs', `${id}.jpg`),
      false,
      bust,
    )
  }

  const url = resolveMediaThumbDisplayUrl(appStore.mediaPath, folder, id)
  return url && !isThumbUnavailable(url) ? url : null
})

/** Absolute path to the video's thumbnail file, used by the image editor. */
const videoThumbPath = computed(() => {
  const media = focusedMedia.value
  if (!media?.id || !appStore.mediaPath) return ''
  return path.join(appStore.mediaPath, 'videos', 'thumbs', `${media.id}.jpg`)
})

const previewSrc = computed(() => {
  if (thumbFailed.value) return null

  if (isTag.value) {
    const active = galleryImages.value.find((image) => image.type === activeGalleryType.value)
    if (active?.src) return active.src
    return galleryImages.value[0]?.src ?? null
  }

  return mediaThumbSrc.value
})

async function loadTagGallery(tag: Tag): Promise<void> {
  const token = ++galleryLoadToken.value
  galleryImages.value = []
  activeGalleryType.value = null

  const metaId = tag.metaId ?? meta.value?.id
  const dbPath = appStore.dbPath
  if (metaId == null || !dbPath) return

  const loaded: Array<{type: TagGalleryType; src: string}> = []
  for (const type of TAG_GALLERY_TYPES) {
    const filePath = path.join(dbPath, 'meta', String(metaId), `${tag.id}_${type}.jpg`)
    if (!(await checkFileExists(filePath))) continue
    if (token !== galleryLoadToken.value) return

    const src = resolveTagThumbDisplayUrl({
      dbPath,
      metaId,
      tagId: tag.id,
      type,
    })
    if (!isThumbUnavailable(src)) {
      loaded.push({type, src})
    }
  }

  if (token !== galleryLoadToken.value) return
  galleryImages.value = loaded
  activeGalleryType.value = loaded[0]?.type ?? null
}

function onThumbLoad(event: Event) {
  thumbFailed.value = false
  const img = event.target as HTMLImageElement | null
  const naturalW = Number(img?.naturalWidth) || 0
  const naturalH = Number(img?.naturalHeight) || 0
  if (naturalW > 0 && naturalH > 0) {
    detectedWidth.value = naturalW
    detectedHeight.value = naturalH
  }
}

function onThumbError() {
  thumbFailed.value = true
  detectedWidth.value = 0
  detectedHeight.value = 0
}

async function loadTagAssignmentCounts(tag: Tag) {
  const tagId = Number(tag.id)
  if (!Number.isFinite(tagId) || tagId <= 0) {
    tagAssignmentCounts.value = null
    return
  }

  const token = ++tagAssignmentLoadToken.value
  tagAssignmentCounts.value = null
  try {
    const res = await typedApi.getTagAssignmentCounts(tagId)
    if (token !== tagAssignmentLoadToken.value) return
    tagAssignmentCounts.value = {
      media: Number(res.data.media) || 0,
      tags: Number(res.data.tags) || 0,
    }
  } catch (error) {
    if (token !== tagAssignmentLoadToken.value) return
    console.log(error)
    tagAssignmentCounts.value = null
  }
}

watch(focusedItem, async (item, previous) => {
  if (previous && previous.id !== item?.id) {
    await flushEdits()
  }
  thumbFailed.value = false
  detectedWidth.value = 0
  detectedHeight.value = 0
  galleryImages.value = []
  activeGalleryType.value = null
  formDirty.value = false
  tagAssignmentCounts.value = null

  if (isTag.value && item) {
    void loadTagGallery(item as Tag)
    void loadTagAssignmentCounts(item as Tag)
  }
}, {immediate: true})

watch(activeGalleryType, () => {
  thumbFailed.value = false
  detectedWidth.value = 0
  detectedHeight.value = 0
})

async function flushEdits(): Promise<void> {
  if (!inlineEdit.value) return
  if (!editingRef.value?.isDirty?.() || !editingRef.value.save || saving.value) return
  saving.value = true
  try {
    await editingRef.value.save()
  } finally {
    saving.value = false
  }
}

async function clearFocus(): Promise<void> {
  await flushEdits()
  itemsStore.clearInspectorFocus()
}

async function toggleCollapsed(): Promise<void> {
  if (!collapsed.value) {
    await flushEdits()
  }
  void setOption(collapsed.value ? '0' : '1', 'inspectorCollapsed')
}

async function toggleInlineEdit(): Promise<void> {
  if (inlineEdit.value) {
    await flushEdits()
    void setOption('0', 'inspectorInlineEdit')
    return
  }
  void setOption('1', 'inspectorInlineEdit')
}

async function saveEdits(): Promise<void> {
  if (!editingRef.value?.save || saving.value) return
  saving.value = true
  try {
    await editingRef.value.save()
  } finally {
    saving.value = false
  }
}

async function openFullEdit(): Promise<void> {
  if (!focusedItem.value) return
  await flushEdits()
  if (itemsStore.type === 'media') {
    dialogsStore.editMedia(focusedItem.value as MediaItem, mediaType.value ?? undefined)
  } else if (itemsStore.type === 'tag' && meta.value) {
    dialogsStore.editTag(focusedItem.value as Tag, meta.value)
  }
}

function openPreviewViewer(): void {
  if (!previewSrc.value || !focusedItem.value) return

  if (isTag.value) {
    const sources = (galleryImages.value.length
      ? galleryImages.value
      : [{type: 'main' as const, src: previewSrc.value}]
    ).map((image) => ({
      src: image.src,
      name: `${focusedItem.value?.name || t('browser_layout.untitled')} (${image.type})`,
      width: image.type === activeGalleryType.value ? mediaWidth.value || undefined : undefined,
      height: image.type === activeGalleryType.value ? mediaHeight.value || undefined : undefined,
    }))
    const index = Math.max(0, galleryImages.value.findIndex(
      (image) => image.type === activeGalleryType.value,
    ))
    eventBus.emit('viewImage', {sources, index})
    return
  }

  if (isImageMediaType(mediaType.value ?? undefined) && focusedMedia.value) {
    itemsStore.viewImage({
      image: focusedMedia.value,
      previewSrc: previewSrc.value,
    })
    return
  }

  eventBus.emit('viewImage', {
    sources: [{
      src: previewSrc.value,
      name: String(focusedItem.value.name || t('browser_layout.untitled')),
      width: mediaWidth.value || undefined,
      height: mediaHeight.value || undefined,
    }],
    index: 0,
  })
}

function onSaved(payload: {id: number; type: 'tag' | 'media'}): void {
  formDirty.value = false
  listSync.getItemsFromDb({
    ids: [payload.id],
    type: payload.type,
  })
  if (payload.type === 'media' && itemsStore.type === 'media') {
    void reloadTagsCatalog()
  }
}
</script>

<style scoped lang="scss">
.inspector-panel {
  border-left: 1px solid rgba(var(--v-theme-on-surface), 0.08) !important;
}

.inspector-panel__expand-rail {
  position: fixed;
  right: 0;
  z-index: 1004;
  width: 32px !important;
  height: 40px !important;
  min-width: 32px !important;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-right: none;
  border-radius: 12px 0 0 12px;
  background: rgb(var(--v-theme-surface)) !important;
  color: rgba(var(--v-theme-on-surface), 0.65);
  box-shadow: -2px 0 10px rgba(0, 0, 0, 0.06);

  &:hover {
    color: rgb(var(--v-theme-primary));
    background: rgba(var(--v-theme-primary), 0.06) !important;
  }
}

.inspector-panel__inner {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.inspector-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  z-index: 2;
  background: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.06);
  min-height: 40px;
  box-sizing: border-box;
  flex-shrink: 0;
}

.inspector-panel__title {
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0.6;
  line-height: 1.2;
  min-width: 0;
}

.inspector-panel__header-actions {
  display: flex;
  align-items: center;
  gap: 0;
  margin-left: auto;
  flex-shrink: 0;
}

.inspector-panel__close,
.inspector-panel__toggle {
  flex-shrink: 0;
}

.inspector-panel__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  padding: 24px 16px;
  min-height: 220px;
}

.inspector-panel__preview {
  width: 100%;
  max-height: min(26vh, 220px);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;

  &--clickable {
    cursor: zoom-in;
  }

  &--video {
    position: relative;
    background: #000;
  }
}

.inspector-panel__thumb-overlay {
  position: absolute;
  bottom: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  pointer-events: none;
}

.inspector-panel__thumb-overlay-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  pointer-events: auto;

  :deep(.v-btn) {
    background: rgba(var(--v-theme-primary), 0.55) !important;
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  :deep(.v-btn:hover) {
    background: rgba(var(--v-theme-primary), 0.75) !important;
  }
}

.inspector-panel__thumb {
  max-width: 100%;
  max-height: min(26vh, 220px);
  width: auto;
  height: auto;
  object-fit: contain;
  display: block;
}

.inspector-panel__thumb-fallback {
  width: 100%;
  min-height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.inspector-panel__media-info {
  padding: 6px 12px 0;
  font-size: 0.7rem;
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.01em;
}

.inspector-panel__facts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 10px;
  padding: 8px 12px 0;
  font-size: 0.7rem;
  line-height: 1.3;
}

.inspector-panel__fact {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.inspector-panel__fact-label {
  opacity: 0.5;
  font-size: 0.62rem;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.inspector-panel__fact-value {
  min-width: 0;
  font-variant-numeric: tabular-nums;
  word-break: break-word;
}

.inspector-panel__gallery {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  padding: 8px 12px 0;
}

.inspector-panel__gallery-thumb {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 3px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  overflow: hidden;

  img {
    width: 100%;
    aspect-ratio: 1;
    object-fit: cover;
    border-radius: 6px;
    display: block;
    background: rgba(var(--v-theme-on-surface), 0.04);
  }

  span {
    font-size: 0.62rem;
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    opacity: 0.55;
    line-height: 1.2;
  }

  &:hover {
    background: rgba(var(--v-theme-on-surface), 0.04);
  }

  &--active {
    border-color: rgba(var(--v-theme-primary), 0.55);

    span {
      opacity: 1;
      color: rgb(var(--v-theme-primary));
      font-weight: 600;
    }
  }
}

.inspector-panel__scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}

.inspector-panel__body {
  padding: 12px 12px 8px;
}

.inspector-panel__actions {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: row;
  gap: 8px;
  padding: 10px 12px 12px;
  background: rgb(var(--v-theme-surface));
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.06);
  box-shadow: 0 -8px 16px rgba(0, 0, 0, 0.12);
  flex-shrink: 0;
}

.inspector-panel__name {
  font-size: 0.95rem;
  font-weight: 600;
  line-height: 1.3;
  word-break: break-word;
  margin-bottom: 4px;
}

.inspector-panel__path {
  font-size: 0.7rem;
  margin-bottom: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inspector-panel__synonyms {
  margin-top: 6px;
  font-size: 0.75rem;
  line-height: 1.35;
  word-break: break-word;
}

.inspector-panel__field {
  margin-top: 10px;
}

.inspector-panel__field-label {
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0.55;
  margin-bottom: 2px;
}

.inspector-panel__chips {
  display: flex;
  flex-wrap: wrap;
  margin: -4px;
}

.inspector-panel__bookmark {
  font-size: 0.72rem;
  line-height: 1.35;
  white-space: pre-wrap;
  word-break: break-word;
  opacity: 0.85;
}

.inspector-panel__meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.inspector-panel__color-swatch {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.16);
  flex-shrink: 0;
}

.inspector-panel__section-label {
  margin-top: 16px;
  margin-bottom: 6px;
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0.55;
}

.inspector-panel__pinned {
  :deep(.category) {
    margin-bottom: 6px;
    margin-top: 0;
    padding: 0;
    align-items: flex-start;
  }

  :deep(.category-name) {
    font-size: 0.68rem;
    font-weight: 400;
    opacity: 0.65;
    margin-bottom: 0;
    margin-right: 6px;
    min-height: 22px;
    line-height: 22px;

    .v-icon {
      font-size: 14px !important;
      width: 14px;
      height: 14px;
      margin-right: 0;
    }
  }

  :deep(.v-chip) {
    margin: 1px 2px !important;
    padding: 0 !important;
    min-height: 22px !important;
    height: 22px !important;
    font-size: 0.72rem !important;

    .v-chip__content {
      padding-inline: 6px !important;
      line-height: 1.2;
    }
  }
}

.inspector-panel__editor {
  min-width: 0;
}

.inspector-panel__action-btn {
  flex: 1 1 0;
  min-width: 0;
}
</style>
