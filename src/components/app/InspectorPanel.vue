<template>
  <v-navigation-drawer
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
        <v-btn
          v-if="focusedItem"
          icon
          variant="text"
          size="small"
          :aria-label="t('browser_layout.clear_selection')"
          @click="clearFocus"
        >
          <v-icon size="18">mdi-close</v-icon>
        </v-btn>
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
        <div class="inspector-panel__preview">
          <img
            v-if="thumbSrc"
            :src="thumbSrc"
            alt=""
            class="inspector-panel__thumb"
            @error="thumbFailed = true"
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
          </div>

          <div class="inspector-panel__section-label">
            {{ t('navigation.section_tags') }}
          </div>

          <div
            v-if="!tagGroups.length"
            class="text-caption text-medium-emphasis mb-3"
          >
            {{ t('browser_layout.no_tags_on_item') }}
          </div>

          <div
            v-for="group in tagGroups"
            :key="group.metaId"
            class="inspector-panel__tag-group"
          >
            <div class="inspector-panel__tag-group-name">
              {{ group.name }}
            </div>
            <div class="inspector-panel__chips">
              <v-chip
                v-for="tag in group.tags"
                :key="tag.id"
                size="small"
                label
                class="ma-1"
                :color="tag.color || undefined"
                closable
                @click="filterByTag(tag)"
                @click:close="removeTag(tag)"
              >
                {{ tag.name }}
              </v-chip>
            </div>
          </div>

          <div class="inspector-panel__actions">
            <v-btn
              color="primary"
              variant="tonal"
              block
              size="small"
              prepend-icon="mdi-pencil-outline"
              @click="openEdit"
            >
              {{ t('browser_layout.edit_item') }}
            </v-btn>
          </div>
        </div>
      </template>
    </div>
  </v-navigation-drawer>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useDialogsStore} from '@/stores/dialogs'
import {useBrowserTagFilter} from '@/composable/useBrowserTagFilter'
import {useItemsListSync} from '@/composable/itemsListSync'
import {typedApi} from '@/services/typedApi'
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
import type {MediaItem, Meta, Tag} from '@/types/stores'

withDefaults(defineProps<{
  width?: number
}>(), {
  width: 280,
})

const {t} = useI18n()
const appStore = useAppStore()
const itemsStore = useItemsStore()
const dialogsStore = useDialogsStore()
const listSync = useItemsListSync()
const {filterByTag} = useBrowserTagFilter()

const thumbFailed = ref(false)

const focusedItem = computed(() => {
  const id = itemsStore.selection[0] ?? itemsStore.selected_last
  if (id == null) return null
  return itemsStore.entities.find((item) => item.id === id) ?? null
})

const meta = computed(() =>
  itemsStore.type === 'tag' ? itemsStore.meta : null,
)

const mediaType = computed(() => {
  if (itemsStore.type !== 'media' || !focusedItem.value) return null
  const media = focusedItem.value as MediaItem
  return appStore.mediaTypes.find((item) => item.id === media.mediaTypeId) ?? null
})

const mediaPath = computed(() => {
  if (itemsStore.type !== 'media' || !focusedItem.value) return ''
  return String((focusedItem.value as MediaItem).path || '')
})

const showMetaRow = computed(() => {
  if (!focusedItem.value) return false
  return Boolean(focusedItem.value.rating) || Boolean(focusedItem.value.favorite)
})

const fallbackIcon = computed(() => {
  if (itemsStore.type === 'tag') return 'mdi-tag-outline'
  if (isImageMediaType(mediaType.value ?? undefined)) return 'mdi-image-outline'
  if (isAudioMediaType(mediaType.value ?? undefined)) return 'mdi-music-note'
  if (isTextMediaType(mediaType.value ?? undefined)) return 'mdi-file-document-outline'
  return 'mdi-video-outline'
})

const thumbSrc = computed(() => {
  if (!focusedItem.value || thumbFailed.value) return null

  if (itemsStore.type === 'tag') {
    const tag = focusedItem.value as Tag
    const metaId = tag.metaId ?? meta.value?.id
    if (metaId == null || !appStore.mediaPath) return null
    const url = resolveTagThumbDisplayUrl({
      dbPath: appStore.dbPath,
      metaId,
      tagId: tag.id,
      type: 'main',
    })
    return isThumbUnavailable(url) ? null : url
  }

  const media = focusedItem.value as MediaItem
  if (!appStore.mediaPath) return null

  let folder = 'videos'
  if (isImageMediaType(mediaType.value ?? undefined)) folder = 'images'
  else if (isAudioMediaType(mediaType.value ?? undefined)) folder = 'audio'
  else if (isTextMediaType(mediaType.value ?? undefined)) folder = 'text'
  else if (!isVideoMediaType(mediaType.value ?? undefined)) folder = 'videos'

  const url = resolveMediaThumbDisplayUrl(appStore.mediaPath, folder, media.id)
  return url && !isThumbUnavailable(url) ? url : null
})

type InspectorTag = Tag & {meta?: Meta | null}

const tagGroups = computed(() => {
  if (!focusedItem.value?.tags?.length) return [] as Array<{metaId: number; name: string; tags: InspectorTag[]}>

  const groups = new Map<number, {metaId: number; name: string; tags: InspectorTag[]}>()

  for (const ref of focusedItem.value.tags) {
    const tag = appStore.getTagById(ref.tagId)
    if (!tag) continue
    const metaId = ref.metaId ?? tag.metaId
    if (metaId == null) continue
    const metaEntry = appStore.getMetaById(metaId)
    let group = groups.get(metaId)
    if (!group) {
      group = {
        metaId,
        name: metaEntry?.name || String(metaId),
        tags: [],
      }
      groups.set(metaId, group)
    }
    group.tags.push({...tag, meta: metaEntry ?? null})
  }

  return [...groups.values()]
})

watch(focusedItem, () => {
  thumbFailed.value = false
})

function clearFocus(): void {
  itemsStore.clearInspectorFocus()
}

function openEdit(): void {
  if (!focusedItem.value) return
  if (itemsStore.type === 'media') {
    dialogsStore.editMedia(focusedItem.value as MediaItem, mediaType.value ?? undefined)
  } else if (itemsStore.type === 'tag' && meta.value) {
    dialogsStore.editTag(focusedItem.value as Tag, meta.value)
  }
}

async function removeTag(tag: InspectorTag): Promise<void> {
  if (!focusedItem.value) return

  try {
    if (itemsStore.type === 'media') {
      await typedApi.removeTagFromItem('media', {
        tagId: tag.id,
        mediaId: focusedItem.value.id,
      })
    } else {
      await typedApi.removeTagFromItem('tag', {
        tagId: tag.id,
        parentTagId: focusedItem.value.id,
      })
    }

    itemsStore.removeTagFromItem({
      itemId: focusedItem.value.id,
      tagId: tag.id,
    })

    listSync.getItemsFromDb({
      ids: [focusedItem.value.id],
      type: itemsStore.type === 'tag' ? 'tag' : 'media',
    })
  } catch (error) {
    console.error(error)
  }
}
</script>

<style scoped lang="scss">
.inspector-panel {
  border-left: 1px solid rgba(var(--v-theme-on-surface), 0.08) !important;
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
  padding: 10px 12px 8px;
  position: sticky;
  top: 0;
  z-index: 1;
  background: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}

.inspector-panel__title {
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0.6;
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
  aspect-ratio: 16 / 10;
  background: rgba(var(--v-theme-on-surface), 0.04);
  overflow: hidden;
}

.inspector-panel__thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.inspector-panel__thumb-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.inspector-panel__body {
  padding: 12px;
}

.inspector-panel__name {
  font-size: 0.95rem;
  font-weight: 600;
  line-height: 1.3;
  word-break: break-word;
}

.inspector-panel__path {
  font-size: 0.7rem;
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inspector-panel__meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
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

.inspector-panel__tag-group {
  margin-bottom: 10px;
}

.inspector-panel__tag-group-name {
  font-size: 0.7rem;
  font-weight: 600;
  opacity: 0.65;
  margin-bottom: 2px;
}

.inspector-panel__chips {
  display: flex;
  flex-wrap: wrap;
  margin: -4px;
}

.inspector-panel__actions {
  margin-top: 16px;
}
</style>
