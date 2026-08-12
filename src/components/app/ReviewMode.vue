<template>
  <v-dialog
    :model-value="review.active"
    fullscreen
    transition="fade-transition"
    content-class="review-mode-dialog"
    no-click-animation
    @update:model-value="onDialogToggle"
  >
    <div
      v-if="review.active"
      ref="rootRef"
      class="review-mode"
      tabindex="-1"
      @keydown="onKeydown"
    >
      <div class="review-mode__chrome">
        <div class="review-mode__title">
          <div class="review-mode__name" :title="current?.name || ''">
            {{ current?.name || t('review_mode.untitled') }}
          </div>
          <div class="review-mode__counter">{{ review.counter }}</div>
        </div>
        <v-spacer/>
        <div class="review-mode__chrome-actions">
          <v-btn
            icon
            variant="text"
            color="white"
            size="small"
            :title="t('review_mode.play')"
            @click="playCurrent"
          >
            <v-icon>mdi-play</v-icon>
          </v-btn>
          <v-btn
            icon
            variant="text"
            color="white"
            size="small"
            :title="t('review_mode.edit')"
            @click="editCurrent"
          >
            <v-icon>mdi-pencil</v-icon>
          </v-btn>
          <v-btn
            icon
            variant="text"
            color="white"
            size="small"
            :title="t('common.close')"
            @click="close"
          >
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </div>
      </div>

      <div class="review-mode__stage">
        <v-btn
          class="review-mode__nav review-mode__nav--prev"
          icon
          variant="tonal"
          color="white"
          :disabled="!review.hasPrev"
          @click="goPrev"
        >
          <v-icon size="32">mdi-chevron-left</v-icon>
        </v-btn>

        <div class="review-mode__card">
          <div class="review-mode__media" @click="playCurrent">
            <v-img
              v-if="thumbUrl"
              :src="thumbUrl"
              cover
              class="review-mode__thumb"
            />
            <div v-else class="review-mode__thumb review-mode__thumb--empty">
              <v-icon size="64" color="white">mdi-image-off-outline</v-icon>
            </div>
            <div v-if="review.statusText" class="review-mode__status">
              {{ review.statusText }}
            </div>
          </div>

          <div class="review-mode__meta">
            <div class="review-mode__rating-row">
              <v-rating
                :model-value="Number(current?.rating) || 0"
                active-color="yellow-darken-2"
                color="#666"
                density="comfortable"
                hover
                clearable
                @update:model-value="setRating"
              />
              <v-btn
                :color="current?.favorite ? 'pink' : 'white'"
                :variant="current?.favorite ? 'flat' : 'tonal'"
                icon
                size="small"
                :title="t('review_mode.favorite_hint')"
                @click="toggleFavorite"
              >
                <v-icon>{{ current?.favorite ? 'mdi-heart' : 'mdi-heart-outline' }}</v-icon>
              </v-btn>
            </div>

            <div class="review-mode__assigned" v-if="assignedTagNames.length">
              <v-chip
                v-for="name in assignedTagNames"
                :key="name"
                size="small"
                variant="tonal"
                color="primary"
                class="ma-1"
              >
                {{ name }}
              </v-chip>
            </div>
          </div>
        </div>

        <v-btn
          class="review-mode__nav review-mode__nav--next"
          icon
          variant="tonal"
          color="white"
          :disabled="!review.hasNext"
          @click="goNext"
        >
          <v-icon size="32">mdi-chevron-right</v-icon>
        </v-btn>
      </div>

      <div class="review-mode__dock">
        <div class="review-mode__hints">
          <span><kbd>←</kbd>/<kbd>→</kbd> {{ t('review_mode.hint_nav') }}</span>
          <span><kbd>1</kbd>–<kbd>5</kbd> {{ t('review_mode.hint_rating') }}</span>
          <span><kbd>F</kbd> {{ t('review_mode.hint_favorite') }}</span>
          <span><kbd>Space</kbd> {{ t('review_mode.hint_play') }}</span>
          <span><kbd>Esc</kbd> {{ t('common.close') }}</span>
        </div>

        <div v-if="tagSlots.length" class="review-mode__tags">
          <button
            v-for="slot in tagSlots"
            :key="slot.tagId"
            type="button"
            class="review-mode__tag"
            :class="{'review-mode__tag--on': isTagAssigned(slot.tagId)}"
            :style="slot.color ? {borderColor: String(slot.color)} : undefined"
            @click="toggleTag(slot)"
          >
            <kbd>{{ slot.label }}</kbd>
            <span>{{ slot.name }}</span>
          </button>
        </div>
        <div v-else class="review-mode__tags-empty text-medium-emphasis">
          {{ t('review_mode.no_favorite_tags') }}
        </div>
      </div>
    </div>
  </v-dialog>
</template>

<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {storeToRefs} from 'pinia'
import {typedApi} from '@/services/typedApi'
import {useAppStore} from '@/stores/app'
import {useDialogsStore} from '@/stores/dialogs'
import {useItemsStore} from '@/stores/items'
import {usePlayerStore} from '@/stores/player'
import {useReviewModeStore, type ReviewTagSlot} from '@/stores/reviewMode'
import {useItemsListSync} from '@/composable/itemsListSync'
import {findMediaTypeById, getMediaDeleteAssetFolder} from '@/utils/mediaType'
import {resolveMediaThumbDisplayUrl} from '@/utils/thumbSource'
import {buildReviewTagSlots, findReviewTagSlot} from '@/utils/reviewModeTags'
import {resolveReviewHotkey} from '@/utils/reviewModeHotkeys'
import {isTypingTarget} from '@/utils/keyboardTarget'
import type {MediaItem} from '@/types/stores'

const {t} = useI18n()
const appStore = useAppStore()
const itemsStore = useItemsStore()
const dialogsStore = useDialogsStore()
const playerStore = usePlayerStore()
const review = useReviewModeStore()
const listSync = useItemsListSync()
const {active} = storeToRefs(review)

const rootRef = ref<HTMLElement | null>(null)

const current = computed(() => review.current)

const tagSlots = computed(() => buildReviewTagSlots(appStore.tags))

const thumbUrl = computed(() => {
  const item = current.value
  if (!item?.id || !appStore.mediaPath) return null
  const mediaType = findMediaTypeById(
    appStore.mediaTypes,
    item.mediaTypeId ?? itemsStore.environment?.media_type_id,
  )
  const folder = getMediaDeleteAssetFolder(mediaType) || 'videos'
  return resolveMediaThumbDisplayUrl(appStore.mediaPath, folder, item.id)
})

const assignedTagNames = computed(() => {
  const tags = current.value?.tags || []
  return tags
    .map((entry) => {
      const tag = appStore.getTagById(Number(entry.tagId))
      return tag?.name ? String(tag.name) : null
    })
    .filter(Boolean) as string[]
})

function isTagAssigned(tagId: number): boolean {
  return Boolean(current.value?.tags?.some((entry) => Number(entry.tagId) === Number(tagId)))
}

function focusRoot() {
  nextTick(() => rootRef.value?.focus())
}

function onDialogToggle(value: boolean) {
  if (!value) close()
}

function close() {
  review.close()
}

function goPrev() {
  review.goPrev()
}

function goNext() {
  review.goNext()
}

async function setRating(value: number | null | undefined) {
  const item = current.value
  if (!item) return
  const rating = value == null || value === 0 ? null : Number(value)
  try {
    await typedApi.updateEntity('media', item.id, {rating})
    review.patchCurrent({rating})
    itemsStore.updateItemField({id: item.id, field: 'rating', value: rating})
    review.showStatus(
      rating == null
        ? t('review_mode.status_rating_cleared')
        : t('review_mode.status_rating', {rating}),
    )
  } catch (error) {
    console.error(error)
  }
}

async function toggleFavorite() {
  const item = current.value
  if (!item) return
  const next = item.favorite ? 0 : 1
  try {
    await typedApi.updateEntity('media', item.id, {favorite: next})
    review.patchCurrent({favorite: Boolean(next)})
    itemsStore.updateItemField({id: item.id, field: 'favorite', value: next})
    review.showStatus(
      next
        ? t('review_mode.status_favorite_on')
        : t('review_mode.status_favorite_off'),
    )
  } catch (error) {
    console.error(error)
  }
}

async function toggleTag(slot: ReviewTagSlot) {
  const item = current.value
  if (!item) return
  const assigned = isTagAssigned(slot.tagId)
  try {
    if (assigned) {
      await typedApi.removeTagFromItem('media', {
        mediaId: item.id,
        tagId: slot.tagId,
      })
      itemsStore.removeTagFromItem({itemId: item.id, tagId: slot.tagId})
      const nextTags = (item.tags || []).filter((entry) => Number(entry.tagId) !== slot.tagId)
      review.patchCurrent({tags: nextTags})
      review.showStatus(t('review_mode.status_tag_removed', {name: slot.name}))
    } else {
      await typedApi.createTagsInMediaOne({
        mediaId: item.id,
        tagId: slot.tagId,
        metaId: slot.metaId,
      })
      const nextTags = [...(item.tags || []), {tagId: slot.tagId, metaId: slot.metaId}]
      review.patchCurrent({tags: nextTags})
      review.showStatus(t('review_mode.status_tag_added', {name: slot.name}))
    }
    listSync.getItemsFromDb({ids: [item.id], type: 'media'})
  } catch (error) {
    console.error(error)
  }
}

function playCurrent() {
  const item = current.value
  if (!item) return
  const playlist = review.mediaIds
    .map((id) => review.mediaById[id])
    .filter(Boolean) as MediaItem[]
  void itemsStore.playVideo({video: item, videos: playlist})
}

function editCurrent() {
  const item = current.value
  if (!item) return
  const mediaType = findMediaTypeById(
    appStore.mediaTypes,
    item.mediaTypeId ?? itemsStore.environment?.media_type_id,
  )
  dialogsStore.editMedia(item, mediaType ?? null)
}

async function onKeydown(event: KeyboardEvent) {
  if (!review.active) return
  if (playerStore.active) return
  if (isTypingTarget(event.target)) return
  if (dialogsStore.mediaEditing.show) return

  const action = resolveReviewHotkey(event)
  if (!action) return

  event.preventDefault()
  event.stopPropagation()

  switch (action.type) {
    case 'close':
      close()
      break
    case 'prev':
      goPrev()
      break
    case 'next':
      goNext()
      break
    case 'rating':
      await setRating(action.value)
      break
    case 'favorite':
      await toggleFavorite()
      break
    case 'play':
      playCurrent()
      break
    case 'edit':
      editCurrent()
      break
    case 'tag': {
      const slot = findReviewTagSlot(tagSlots.value, action.code)
      if (slot) await toggleTag(slot)
      break
    }
  }
}

function onWindowKeydown(event: KeyboardEvent) {
  void onKeydown(event)
}

watch(active, (isActive) => {
  if (isActive) {
    window.addEventListener('keydown', onWindowKeydown, true)
    focusRoot()
  } else {
    window.removeEventListener('keydown', onWindowKeydown, true)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeydown, true)
})
</script>

<style scoped>
.review-mode {
  outline: none;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: radial-gradient(120% 80% at 50% 0%, #2a2a32 0%, #121218 55%, #0a0a0e 100%);
  color: #fff;
}

.review-mode__chrome {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(8px);
}

.review-mode__title {
  min-width: 0;
}

.review-mode__name {
  font-size: 1.05rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: min(70vw, 720px);
}

.review-mode__counter {
  font-size: 0.8rem;
  opacity: 0.7;
}

.review-mode__chrome-actions {
  display: flex;
  gap: 4px;
}

.review-mode__stage {
  flex: 1;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  min-height: 0;
}

.review-mode__card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 1100px;
  width: 100%;
  margin: 0 auto;
  min-height: 0;
}

.review-mode__media {
  position: relative;
  border-radius: 16px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.04);
  aspect-ratio: 16 / 9;
  max-height: min(62vh, 720px);
  cursor: pointer;
}

.review-mode__thumb {
  width: 100%;
  height: 100%;
}

.review-mode__thumb--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  opacity: 0.5;
}

.review-mode__status {
  position: absolute;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  padding: 8px 14px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.72);
  font-size: 0.9rem;
  pointer-events: none;
}

.review-mode__meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
}

.review-mode__rating-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.review-mode__assigned {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  max-width: 900px;
}

.review-mode__nav {
  width: 48px;
  height: 48px;
}

.review-mode__dock {
  padding: 12px 16px 18px;
  background: rgba(0, 0, 0, 0.4);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.review-mode__hints {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  justify-content: center;
  font-size: 0.78rem;
  opacity: 0.75;
  margin-bottom: 10px;
}

.review-mode__hints kbd,
.review-mode__tag kbd {
  display: inline-block;
  min-width: 1.4em;
  padding: 1px 5px;
  margin-right: 4px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.08);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.72rem;
  text-align: center;
}

.review-mode__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.review-mode__tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 220px;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.06);
  color: inherit;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.review-mode__tag span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.85rem;
}

.review-mode__tag:hover {
  background: rgba(255, 255, 255, 0.12);
}

.review-mode__tag--on {
  background: rgba(var(--v-theme-primary), 0.28);
  border-color: rgb(var(--v-theme-primary));
}

.review-mode__tags-empty {
  text-align: center;
  font-size: 0.85rem;
}

@media (max-width: 900px) {
  .review-mode__stage {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr auto;
  }

  .review-mode__nav--prev {
    justify-self: start;
  }

  .review-mode__nav--next {
    justify-self: end;
  }
}
</style>
