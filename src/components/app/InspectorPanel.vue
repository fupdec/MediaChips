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
      'inspector-panel--empty': !focusedItem && !pendingDraft,
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
        v-if="pendingDraft && !focusedItem"
        class="inspector-panel__pending"
      >
        <v-icon
          size="40"
          class="mb-3"
          color="success"
        >
          mdi-file-plus-outline
        </v-icon>
        <div class="inspector-panel__name text-center">
          {{ pendingDraft.name }}
        </div>
        <div class="inspector-panel__path text-medium-emphasis text-center mt-1">
          {{ pendingDraft.path }}
        </div>
        <div
          v-if="pendingDraft.size != null"
          class="text-caption text-medium-emphasis mt-1"
        >
          {{ pendingSizeLabel }}
        </div>
        <v-chip
          class="mt-3"
          size="small"
          color="success"
          variant="tonal"
          label
        >
          {{ t('media.adding.browser_addable') }}
        </v-chip>
        <div class="d-flex flex-column ga-2 mt-4" style="width: 100%">
          <v-btn
            color="success"
            variant="flat"
            rounded="lg"
            prepend-icon="mdi-plus"
            @click="eventBus.emit('folders:pending-add', pendingDraft.path)"
          >
            {{ t('folders_browser.add_to_library') }}
          </v-btn>
          <v-btn
            variant="tonal"
            rounded="lg"
            prepend-icon="mdi-pencil-outline"
            @click="eventBus.emit('folders:pending-edit', pendingDraft.path)"
          >
            {{ t('common.editing') }}
          </v-btn>
        </div>
      </div>

      <div
        v-else-if="!focusedItem"
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

            <!-- Overlay: crop always OK; recreate-from-video needs the source file -->
            <div
              v-if="isVideoInspectorItem && (previewSrc || !isFileExists)"
              class="inspector-panel__thumb-overlay"
              @click.stop
            >
              <div class="inspector-panel__thumb-overlay-actions">
                <DialogImageEditing
                  v-if="previewSrc"
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
                  v-if="!isFileExists"
                  size="x-small"
                  variant="flat"
                  color="error"
                  icon
                  class="inspector-panel__thumb-overlay-missing"
                  v-tooltip:top="t('image.create_thumb_source_missing')"
                  tabindex="-1"
                  @click.stop
                >
                  <v-icon size="16">mdi-file-alert</v-icon>
                </v-btn>
                <template v-else>
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
                </template>
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

          <div class="inspector-panel__identity">
            <div
              class="inspector-panel__name"
              :title="focusedItem.name"
            >
              {{ focusedItem.name || t('browser_layout.untitled') }}
            </div>

            <div
              v-if="mediaPath"
              class="inspector-panel__path"
              :title="mediaPath"
            >
              <v-icon size="13" class="inspector-panel__path-icon">mdi-folder-outline</v-icon>
              <span class="inspector-panel__path-text">{{ mediaPath }}</span>
            </div>

            <MediaOriginalsButton
              v-if="focusedMedia"
              class="inspector-panel__originals"
              :media="focusedMedia"
            />
          </div>

          <details
            v-if="inspectorFacts.length"
            class="inspector-panel__details"
          >
            <summary class="inspector-panel__details-title">
              <v-icon size="15" class="inspector-panel__details-icon">mdi-information-outline</v-icon>
              <span class="inspector-panel__details-text">
                {{ isTag ? t('editing.tag_information') : t('editing.media_file_information') }}
              </span>
              <span class="inspector-panel__details-line" aria-hidden="true" />
              <v-icon size="16" class="inspector-panel__details-chevron">mdi-chevron-down</v-icon>
            </summary>
            <div class="inspector-panel__facts">
              <div
                v-for="fact in inspectorFacts"
                :key="fact.key"
                class="inspector-panel__fact"
              >
                <span class="inspector-panel__fact-label">{{ fact.label }}</span>
                <span class="inspector-panel__fact-value">{{ fact.value }}</span>
              </div>
            </div>
          </details>

          <div class="inspector-panel__body">

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

            <div
              v-else
              class="inspector-view"
              :class="{'inspector-view--icons': labelIcons}"
            >
              <EditingSectionHeader
                :title="t('editing.section_main')"
                icon="mdi-card-account-details-outline"
              />

              <div
                v-if="showRatingRow"
                class="inspector-view__row"
              >
                <span class="inspector-view__label">
                  <v-icon size="15" class="inspector-view__icon">
                    {{ ratingVisible ? 'mdi-star-outline' : 'mdi-heart-outline' }}
                  </v-icon>
                  <span class="inspector-view__name">
                    {{ ratingVisible ? t('meta.default_names.rating') : t('meta.default_names.favorite') }}
                  </span>
                </span>
                <span class="inspector-view__value inspector-view__value--inline">
                  <v-rating
                    v-if="ratingVisible"
                    :key="`inspector-rating-${focusedItem.id}`"
                    :model-value="Number(focusedItem.rating) || 0"
                    density="compact"
                    half-increments
                    readonly
                    size="18"
                    color="grey-darken-1"
                    empty-icon="mdi-star-outline"
                    active-color="yellow-darken-3"
                    class="inspector-view__rating"
                  />
                  <span
                    v-if="ratingVisible && favoriteVisible"
                    class="inspector-view__sep"
                    aria-hidden="true"
                  />
                  <v-icon
                    v-if="favoriteVisible"
                    size="18"
                    :color="focusedItem.favorite ? 'pink' : undefined"
                    :class="{'inspector-view__muted': !focusedItem.favorite}"
                    :title="t('meta.default_names.favorite')"
                  >
                    {{ focusedItem.favorite ? 'mdi-heart' : 'mdi-heart-outline' }}
                  </v-icon>
                </span>
              </div>

              <div
                v-if="itemColor"
                class="inspector-view__row"
              >
                <span class="inspector-view__label">
                  <v-icon size="15" class="inspector-view__icon">mdi-palette-outline</v-icon>
                  <span class="inspector-view__name">{{ t('meta.default_names.color') }}</span>
                </span>
                <span class="inspector-view__value inspector-view__value--inline">
                  <span
                    class="inspector-panel__color-swatch"
                    :style="{backgroundColor: itemColor}"
                  />
                  <span class="inspector-view__mono">{{ itemColor }}</span>
                </span>
              </div>

              <div
                v-if="tagSynonyms"
                class="inspector-view__row"
              >
                <span class="inspector-view__label">
                  <v-icon size="15" class="inspector-view__icon">mdi-alphabetical</v-icon>
                  <span class="inspector-view__name">{{ t('filters.sort.synonyms') }}</span>
                </span>
                <span
                  class="inspector-view__value inspector-view__text"
                  v-html="tagSynonyms"
                />
              </div>

              <div
                v-if="tagCountries.length"
                class="inspector-view__row"
              >
                <span class="inspector-view__label">
                  <v-icon size="15" class="inspector-view__icon">mdi-flag-outline</v-icon>
                  <span class="inspector-view__name">{{ t('meta.types.country') }}</span>
                </span>
                <span class="inspector-view__value inspector-view__chips">
                  <v-chip
                    v-for="country in tagCountries"
                    :key="country"
                    size="small"
                    variant="tonal"
                  >
                    {{ country }}
                  </v-chip>
                </span>
              </div>

              <div
                v-if="itemBookmark"
                class="inspector-view__row"
              >
                <span class="inspector-view__label">
                  <v-icon size="15" class="inspector-view__icon">mdi-bookmark-outline</v-icon>
                  <span class="inspector-view__name">{{ t('meta.default_names.bookmark') }}</span>
                </span>
                <span class="inspector-view__value inspector-view__text inspector-view__bookmark">
                  {{ itemBookmark }}
                </span>
              </div>

              <template v-if="hasTagFields">
                <EditingSectionHeader
                  :title="t('editing.section_tags')"
                  icon="mdi-tag-multiple-outline"
                />
                <ItemPinnedMeta
                  class="inspector-panel__pinned"
                  :item="focusedItem"
                  :tags="focusedItem.tags"
                  :values="focusedItem.values"
                  :type="isTag ? 'tag' : 'media'"
                  :is-show-all="true"
                  :show-preset="false"
                  grouped
                  kind="tags"
                />
              </template>

              <template v-if="hasValueFields">
                <EditingSectionHeader
                  :title="t('editing.section_attributes')"
                  icon="mdi-format-list-bulleted-type"
                />
                <ItemPinnedMeta
                  class="inspector-panel__pinned"
                  :item="focusedItem"
                  :tags="focusedItem.tags"
                  :values="focusedItem.values"
                  :type="isTag ? 'tag' : 'media'"
                  :is-show-all="true"
                  :show-preset="isTag"
                  grouped
                  kind="values"
                />
              </template>

              <div
                v-if="!hasTagFields && !hasValueFields"
                class="inspector-view__none"
              >
                {{ t('browser_layout.inspector_no_fields') }}
              </div>
            </div>
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
import {getApiErrorMessage} from '@/types/vue'
import {computed, defineAsyncComponent, onUnmounted, ref, watch} from 'vue'
import path from 'path-browserify'
import dayjs from 'dayjs'
import {useI18n} from 'vue-i18n'
import EditPinnedMetaValues from '@/components/items/EditPinnedMetaValues.vue'
import ItemPinnedMeta from '@/components/items/ItemPinnedMeta.vue'
import EditingSectionHeader from '@/components/items/EditingSectionHeader.vue'
import MediaOriginalsButton from '@/components/items/MediaOriginalsButton.vue'
import {useAppStore} from '@/stores/app'
import {useSettingsStore} from '@/stores/settings'
import {useItemsStore} from '@/stores/items'
import {useDialogsStore} from '@/stores/dialogs'
import {useEventBus} from '@/utils/eventBus'
import {useItemsListSync} from '@/composable/itemsListSync'
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
import {useFoldersBrowserFocus} from '@/composable/useFoldersBrowserFocus'
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
const {focused: foldersFocus} = useFoldersBrowserFocus()
const winElectronUi = isWinElectronUi()

const DialogImageEditing = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogImageEditing.vue'),
)

const collapsed = computed(() => settingsStore.inspectorCollapsed === '1')
const inlineEdit = computed(() => settingsStore.inspectorInlineEdit !== '0')
const panelWidth = computed(() => props.width ?? 360)
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

const pendingDraft = computed(() => (
  foldersFocus.value?.kind === 'pending' ? foldersFocus.value : null
))

const pendingSizeLabel = computed(() => {
  const size = pendingDraft.value?.size
  if (size == null) return ''
  return getReadableFileSize(size)
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
const isFileExists = ref(true)

const canCreateThumb = computed(() =>
  Boolean(isFileExists.value && focusedMedia.value?.id != null && focusedMedia.value?.path),
)

watch(
  mediaPath,
  (filePath) => {
    if (!filePath) {
      isFileExists.value = false
      return
    }
    void checkFileExists(filePath).then((exists) => {
      if (mediaPath.value === filePath) {
        isFileExists.value = exists
      }
    })
  },
  {immediate: true},
)

async function createVideoThumb(mode: 'random' | 'default') {
  const media = focusedMedia.value
  if (!media?.id || !media.path || !isFileExists.value || isCreatingThumb.value) return

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
      text: getApiErrorMessage(e),
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

const ratingVisible = computed(() => !isTag.value || Boolean(meta.value?.rating))
const favoriteVisible = computed(() => !isTag.value || Boolean(meta.value?.favorite))
const showRatingRow = computed(() => Boolean(focusedItem.value) && (ratingVisible.value || favoriteVisible.value))

/** Same setting as the edit dialog: icons in the label column are optional. */
const labelIcons = computed(() => settingsStore.showIconsOfMetaInEditingDialog === '1')

const hasTagFields = computed(() =>
  (focusedItem.value?.tags ?? []).some((entry) => entry && Number(entry.tagId) > 0),
)

const hasValueFields = computed(() =>
  isTag.value
  || (focusedItem.value?.values ?? []).some((entry) => entry && entry.value != null && entry.value !== ''),
)

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

async function toggleCollapsed(): Promise<void> {
  if (!collapsed.value) {
    await flushEdits()
  }
  void setOption(collapsed.value ? '0' : '1', 'inspectorCollapsed')
}

async function toggleInlineEdit(): Promise<void> {
  if (pendingDraft.value && !focusedItem.value && !inlineEdit.value) {
    void setOption('1', 'inspectorInlineEdit')
    eventBus.emit('folders:pending-edit', pendingDraft.value.path)
    return
  }
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
  // Catalog is already reloaded in EditPinnedMetaValues.save(); refetch for
  // authoritative tags/values (including folder-inherited links).
  listSync.getItemsFromDb({
    ids: [payload.id],
    type: payload.type,
  })
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

.inspector-panel__toggle {
  flex-shrink: 0;
}

.inspector-panel__empty,
.inspector-panel__pending {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  padding: 24px 16px;
  min-height: 220px;
}

.inspector-panel__pending {
  justify-content: flex-start;
  padding-top: 32px;
}

.inspector-panel__preview {
  width: 100%;
  max-height: min(26vh, 220px);
  min-height: 96px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 10px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background: rgba(var(--v-theme-on-surface), 0.03);

  &--clickable {
    cursor: zoom-in;
  }

  &--video {
    position: relative;
    aspect-ratio: 16 / 9;
    max-height: none;
    min-height: 0;
    background: #000;
    border-color: transparent;

    .inspector-panel__thumb {
      width: 100%;
      height: 100%;
      max-height: none;
      object-fit: cover;
    }
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

  :deep(.inspector-panel__thumb-overlay-missing) {
    background: rgba(var(--v-theme-error), 0.55) !important;
    pointer-events: auto;
    cursor: default;
  }

  :deep(.inspector-panel__thumb-overlay-missing:hover) {
    background: rgba(var(--v-theme-error), 0.55) !important;
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
  padding: 6px 8px 0;
  font-size: 0.7rem;
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.01em;
}

.inspector-panel__details {
  margin-top: 6px;
  // Air between the file facts and the editor toolbar / first section below.
  padding-bottom: 6px;

  &[open] {
    padding-bottom: 14px;
  }
}

.inspector-panel__details-title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 26px;
  padding: 8px 0 4px 8px;
  cursor: pointer;
  list-style: none;
  user-select: none;
  color: rgba(var(--v-theme-on-surface), 0.75);

  &:hover {
    color: rgb(var(--v-theme-on-surface));
  }
}

.inspector-panel__details-icon {
  opacity: 0.6;
}

.inspector-panel__details-text {
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.inspector-panel__details-line {
  flex: 1 1 auto;
  height: 1px;
  min-width: 12px;
  background: rgba(var(--v-border-color), var(--v-border-opacity));
}

.inspector-panel__details-chevron {
  opacity: 0.6;
  transition: transform 150ms ease;
}

.inspector-panel__details-title::-webkit-details-marker {
  display: none;
}

.inspector-panel__details[open] .inspector-panel__details-chevron {
  transform: rotate(180deg);
}

.inspector-panel__facts {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 2px 0 4px;
  font-size: 0.75rem;
  line-height: 1.35;
}

.inspector-panel__fact {
  display: grid;
  // Same label column as the property rows of the inline editor below.
  grid-template-columns: 88px minmax(0, 1fr);
  column-gap: 8px;
  align-items: baseline;
  min-width: 0;
  padding: 3px 8px;
  border-radius: 8px;

  &:hover {
    background: rgba(var(--v-theme-on-surface), 0.035);
  }
}



.inspector-panel__fact-label {
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inspector-panel__fact-value {
  min-width: 0;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.inspector-panel__gallery {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  padding: 8px 0 0;
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
  padding: 8px 8px 12px;
}

.inspector-panel__body {
  padding: 0;
}

.inspector-panel__identity {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 12px 8px 4px;
}

.inspector-panel__originals {
  margin-top: 4px;
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
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.3;
  word-break: break-word;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
}

.inspector-panel__path {
  display: flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  font-size: 0.7rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.inspector-panel__path-icon {
  flex: 0 0 auto;
  opacity: 0.7;
}

.inspector-panel__path-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inspector-panel__pending .inspector-panel__path {
  justify-content: center;
  white-space: normal;
  word-break: break-all;
}

.inspector-panel__color-swatch {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.16);
  flex-shrink: 0;
}

// ─── View mode: read-only property list ────────────────────────────────────
// Mirrors the inline editor: section headers, label column (88px) | value,
// 8px row inset, quiet hover. ItemPinnedMeta categories are laid out as the
// same rows (label pinned into the left column, chips flow on the right).
.inspector-view {
  --iv-label-w: 88px;
  --iv-col-gap: 8px;
  --iv-pad-x: 8px;
  --iv-row-h: 28px;

  display: flex;
  flex-direction: column;
  gap: 1px;

  :deep(.editing-group-header) {
    min-height: 26px;
    gap: 6px;
    padding: 14px 0 4px var(--iv-pad-x);

    &:first-child {
      padding-top: 6px;
    }

    .editing-group-header__icon {
      font-size: 15px !important;
    }

    .editing-group-header__title {
      font-size: 0.6875rem;
      letter-spacing: 0.05em;
    }
  }
}

.inspector-view__row {
  display: grid;
  grid-template-columns: var(--iv-label-w) minmax(0, 1fr);
  column-gap: var(--iv-col-gap);
  align-items: start;
  min-height: var(--iv-row-h);
  padding: 2px var(--iv-pad-x);
  border-radius: 8px;
  transition: background-color 120ms ease;

  &:hover {
    background: rgba(var(--v-theme-on-surface), 0.035);
  }
}

.inspector-view__label {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  min-height: calc(var(--iv-row-h) - 4px);
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.2;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.inspector-view__icon {
  flex: 0 0 auto;
  opacity: 0.6;
  display: none;
}

.inspector-view--icons .inspector-view__icon {
  display: inline-flex;
}

.inspector-view__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inspector-view__value {
  min-width: 0;
  min-height: calc(var(--iv-row-h) - 4px);
  font-size: 0.8125rem;
  line-height: 1.35;
}

.inspector-view__value--inline {
  display: flex;
  align-items: center;
  gap: 8px;
}

.inspector-view__text {
  display: flex;
  align-items: center;
  padding-block: 3px;
  word-break: break-word;
}

.inspector-view__bookmark {
  display: block;
  white-space: pre-wrap;
  color: rgba(var(--v-theme-on-surface), 0.85);
}

.inspector-view__mono {
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  color: rgba(var(--v-theme-on-surface), 0.7);
  text-transform: uppercase;
}

.inspector-view__rating {
  margin-inline-start: -3px;

  :deep(.v-btn) {
    width: 22px !important;
    height: 22px !important;
    min-width: 22px !important;
  }
}

.inspector-view__sep {
  width: 1px;
  height: 16px;
  background: rgba(var(--v-theme-on-surface), 0.12);
}

.inspector-view__muted {
  opacity: 0.35;
}

.inspector-view__chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding-block: 2px;

  :deep(.v-chip) {
    --v-chip-height: 22px;
    height: 22px !important;
    font-size: 0.75rem !important;
  }
}

.inspector-view__none {
  padding: 10px var(--iv-pad-x) 4px;
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.45);
}

.inspector-panel__pinned {
  display: flex;
  flex-direction: column;
  gap: 1px;

  :deep(.category) {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    min-height: var(--iv-row-h);
    margin: 0 !important;
    padding: 2px var(--iv-pad-x) 2px calc(var(--iv-pad-x) + var(--iv-label-w) + var(--iv-col-gap)) !important;
    border-radius: 8px;
    transition: background-color 120ms ease;

    &:hover {
      background: rgba(var(--v-theme-on-surface), 0.035);
    }
  }

  // Name pinned into the label column of the row.
  :deep(.category-name) {
    position: absolute;
    top: 2px;
    left: var(--iv-pad-x);
    width: var(--iv-label-w);
    min-height: calc(var(--iv-row-h) - 4px);
    margin: 0 !important;
    gap: 6px !important;
    font-size: 0.75rem !important;
    font-weight: 500;
    line-height: 1.2;
    color: rgba(var(--v-theme-on-surface), 0.6);
    overflow: hidden;
    word-break: break-word;

    .v-icon {
      flex: 0 0 auto;
      font-size: 15px !important;
      width: 15px;
      height: 15px;
      margin: 0 !important;
      opacity: 0.6;
    }
  }

  :deep(.v-chip) {
    margin: 0 !important;
    min-height: 22px !important;
    height: 22px !important;
    font-size: 0.75rem !important;

    .v-chip__content {
      line-height: 1.2;
    }
  }

  :deep(.nested-tag-chip-wrap) {
    display: inline-flex;
  }
}

// Label icons follow the same setting as the edit dialog.
.inspector-view:not(.inspector-view--icons) .inspector-panel__pinned :deep(.category-name .v-icon) {
  display: none;
}

.inspector-panel__editor {
  min-width: 0;
}

.inspector-panel__action-btn {
  flex: 1 1 0;
  min-width: 0;
}
</style>
