<template>
  <v-navigation-drawer
    v-if="!collapsed"
    app
    clipped
    permanent
    location="right"
    :width="width"
    class="inspector-panel"
    :class="{'inspector-panel--empty': !focusedItem}"
  >
    <div class="inspector-panel__inner">
      <div class="inspector-panel__header">
        <span class="inspector-panel__title">{{ t('browser_layout.inspector') }}</span>

        <div class="inspector-panel__header-actions">
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
          {{ t('browser_layout.inspector_hint') }}
        </div>
      </div>

      <template v-else>
        <div
          class="inspector-panel__preview"
          :class="{'inspector-panel__preview--clickable': Boolean(previewSrc)}"
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
          v-else-if="mediaFacts.length"
          class="inspector-panel__facts"
        >
          <div
            v-for="fact in mediaFacts"
            :key="fact.key"
            class="inspector-panel__fact"
          >
            <span class="inspector-panel__fact-label">{{ fact.label }}</span>
            <span class="inspector-panel__fact-value">{{ fact.value }}</span>
          </div>
        </div>

        <div class="inspector-panel__body">
          <div
            v-if="!isTag"
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
        </div>

        <div class="inspector-panel__actions">
          <v-btn
            color="success"
            variant="flat"
            block
            size="small"
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
            block
            size="small"
            prepend-icon="mdi-pencil-outline"
            :disabled="saving"
            @click="openFullEdit"
          >
            {{ t('browser_layout.open_full_editor') }}
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
import {computed, ref, watch} from 'vue'
import path from 'path-browserify'
import dayjs from 'dayjs'
import {useI18n} from 'vue-i18n'
import EditPinnedMetaValues from '@/components/items/EditPinnedMetaValues.vue'
import {useAppStore} from '@/stores/app'
import {useSettingsStore} from '@/stores/settings'
import {useItemsStore} from '@/stores/items'
import {useDialogsStore} from '@/stores/dialogs'
import {useEventBus} from '@/utils/eventBus'
import {useItemsListSync} from '@/composable/itemsListSync'
import {reloadTagsCatalog} from '@/composable/appCatalogs'
import {isWinElectronUi} from '@/utils/electronUi'
import {setOption} from '@/services/settingsService'
import {checkFileExists} from '@/services/fileService'
import {
  getReadableBitrate,
  getReadableDuration,
  getReadableFileSize,
} from '@/services/formatUtils'
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
import type {MediaItem, Tag} from '@/types/stores'

withDefaults(defineProps<{
  width?: number
}>(), {
  width: 360,
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

const collapsed = computed(() => settingsStore.inspectorCollapsed === '1')

const expandRailTop = computed(() => {
  let top = 48
  if (winElectronUi) top += 32
  if (appStore.tabs.length) top += 28
  return top
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

const focusedItem = computed(() => {
  const id = itemsStore.selection[0] ?? itemsStore.selected_last
  if (id == null) return null
  return itemsStore.entities.find((item) => item.id === id) ?? null
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

  const views = Number(media.views)
  if (Number.isFinite(views) && views > 0) {
    pushFact(facts, 'views', t('settings_labels.appearance.number_of_views'), String(views))
  }

  pushFact(facts, 'mediaCreatedAt', t('editing.media_created'), formatInspectorDate(media.mediaCreatedAt))
  pushFact(facts, 'createdAt', t('editing.added'), formatInspectorDate(media.createdAt))
  pushFact(facts, 'updatedAt', t('editing.last_edit'), formatInspectorDate(media.updatedAt))
  pushFact(facts, 'viewedAt', t('editing.last_view'), formatInspectorDate(media.viewedAt))

  return facts
})

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

  let folder = 'videos'
  if (isImageMediaType(mediaType.value ?? undefined)) folder = 'images'
  else if (isAudioMediaType(mediaType.value ?? undefined)) folder = 'audio'
  else if (isTextMediaType(mediaType.value ?? undefined)) folder = 'text'
  else if (!isVideoMediaType(mediaType.value ?? undefined)) folder = 'videos'

  const url = resolveMediaThumbDisplayUrl(appStore.mediaPath, folder, focusedMedia.value.id)
  return url && !isThumbUnavailable(url) ? url : null
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

watch(focusedItem, (item) => {
  thumbFailed.value = false
  detectedWidth.value = 0
  detectedHeight.value = 0
  galleryImages.value = []
  activeGalleryType.value = null
  formDirty.value = false

  if (isTag.value && item) {
    void loadTagGallery(item as Tag)
  }
}, {immediate: true})

watch(activeGalleryType, () => {
  thumbFailed.value = false
  detectedWidth.value = 0
  detectedHeight.value = 0
})

async function flushEdits(): Promise<void> {
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
  overflow: auto;
}

.inspector-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  position: sticky;
  top: 0;
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
  max-height: min(32vh, 280px);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;

  &--clickable {
    cursor: zoom-in;
  }
}

.inspector-panel__thumb {
  max-width: 100%;
  max-height: min(32vh, 280px);
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
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 8px 12px 0;
  font-size: 0.72rem;
  line-height: 1.35;
}

.inspector-panel__fact {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.inspector-panel__fact-label {
  flex: 0 1 auto;
  opacity: 0.55;
  padding-right: 4px;
}

.inspector-panel__fact-value {
  flex: 1 1 auto;
  min-width: 0;
  font-variant-numeric: tabular-nums;
  word-break: break-word;
  text-align: right;
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

.inspector-panel__body {
  padding: 12px 12px 8px;
  flex: 1 1 auto;
  min-height: 0;
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

.inspector-panel__editor {
  min-width: 0;
}

.inspector-panel__actions {
  position: sticky;
  bottom: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px 12px;
  margin-top: auto;
  background: rgb(var(--v-theme-surface));
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.06);
  flex-shrink: 0;
}
</style>
