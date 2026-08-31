<template>
  <section class="widget-tag-spotlight mb-6">
    <div class="d-flex align-center justify-space-between mb-3">
      <div class="d-flex align-center text-h6 min-width-0">
        <v-icon class="mr-2 flex-shrink-0" size="24">mdi-tag-heart-outline</v-icon>
        <span class="text-truncate">{{ t('home.widgets.tag_spotlight') }}</span>
        <v-icon
          v-tooltip:top="t('home.widgets.tag_spotlight_hint')"
          class="ml-1 flex-shrink-0 text-medium-emphasis"
          size="18"
          tabindex="0"
          role="img"
          :aria-label="t('home.widgets.tag_spotlight_hint')"
        >
          mdi-information-outline
        </v-icon>
      </div>

      <v-btn
        v-if="spotlight?.tag || loading"
        v-tooltip:top="t('home.widgets.tag_spotlight_reshuffle')"
        @click="reshuffle"
        :loading="loading"
        color="primary"
        icon
        size="small"
        variant="text"
        :aria-label="t('home.widgets.tag_spotlight_reshuffle')"
      >
        <v-icon>mdi-shuffle</v-icon>
      </v-btn>
    </div>

    <div v-if="loading && !spotlight?.tag" class="widget-tag-spotlight__card" aria-hidden="true">
      <div class="widget-tag-spotlight__layout">
        <div class="widget-tag-spotlight__skel-thumb"/>
        <div class="widget-tag-spotlight__body widget-tag-spotlight__skel-copy">
          <div class="d-flex align-start justify-space-between ga-2 mb-2">
            <div class="min-width-0 flex-grow-1">
              <div class="widget-tag-spotlight__bone widget-tag-spotlight__bone--name mb-2"/>
              <div class="widget-tag-spotlight__bone widget-tag-spotlight__bone--category"/>
            </div>
            <div class="d-flex align-center ga-1 flex-shrink-0">
              <span
                v-for="index in 3"
                :key="`action-${index}`"
                class="widget-tag-spotlight__bone widget-tag-spotlight__bone--icon-btn"
              />
            </div>
          </div>

          <div class="widget-tag-spotlight__bone widget-tag-spotlight__bone--synonyms mb-3"/>

          <div class="widget-tag-spotlight__stats mb-3">
            <span class="widget-tag-spotlight__bone widget-tag-spotlight__bone--chip"/>
            <span class="widget-tag-spotlight__bone widget-tag-spotlight__bone--chip widget-tag-spotlight__bone--chip-wide"/>
            <span class="widget-tag-spotlight__bone widget-tag-spotlight__bone--chip widget-tag-spotlight__bone--chip-narrow"/>
          </div>

          <div class="mb-3">
            <div class="widget-tag-spotlight__bone widget-tag-spotlight__bone--section-label mb-2"/>
            <div class="d-flex flex-wrap ga-2">
              <span
                v-for="index in 5"
                :key="`tip-${index}`"
                class="widget-tag-spotlight__bone widget-tag-spotlight__bone--tip"
                :style="{width: `${112 + (index % 3) * 28}px`}"
              />
            </div>
          </div>
        </div>
      </div>

      <div class="widget-tag-spotlight__media mt-3">
        <div class="d-flex align-center justify-space-between mb-2">
          <div class="widget-tag-spotlight__bone widget-tag-spotlight__bone--section-label"/>
          <div class="widget-tag-spotlight__bone widget-tag-spotlight__bone--link"/>
        </div>
        <div class="widget-tag-spotlight__media-scroll">
          <HomeCardSkeleton
            v-for="index in 4"
            :key="`media-${index}`"
            variant="media"
          />
        </div>
      </div>

      <div class="widget-tag-spotlight__related mt-3">
        <div class="widget-tag-spotlight__bone widget-tag-spotlight__bone--section-label mb-2"/>
        <div class="d-flex flex-wrap ga-1">
          <span
            v-for="index in 6"
            :key="`related-${index}`"
            class="widget-tag-spotlight__bone widget-tag-spotlight__bone--related"
            :style="{width: `${64 + (index % 4) * 18}px`}"
          />
        </div>
      </div>
    </div>

    <div
      v-else-if="!spotlight?.tag"
      class="widget-tag-spotlight__empty text-medium-emphasis text-caption"
    >
      <div>{{ t('home.widgets.tag_spotlight_empty') }}</div>
      <v-btn
        class="mt-2"
        size="small"
        color="success"
        variant="flat"
        rounded="xl"
        prepend-icon="mdi-plus"
        @click="openCreateTag"
      >
        {{ t('appbar.buttons.add_tags') }}
      </v-btn>
    </div>

    <div
      v-else
      class="widget-tag-spotlight__card"
    >
      <div
        class="widget-tag-spotlight__layout"
        @contextmenu="showSpotlightTagContextMenu"
      >
        <button
          type="button"
          class="widget-tag-spotlight__thumb"
          :style="thumbStyle"
          @click="openTag"
        >
          <v-img
            v-if="tagImage"
            :src="tagImage"
            cover
            class="widget-tag-spotlight__thumb-img"
            @error="onTagImageError"
          />
          <div v-else class="widget-tag-spotlight__thumb-fallback">
            <v-icon size="36" color="medium-emphasis">
              mdi-{{ metaIcon }}
            </v-icon>
          </div>
        </button>

        <div class="widget-tag-spotlight__body min-width-0">
          <div class="d-flex align-start justify-space-between ga-2 mb-1">
            <div class="min-width-0 flex-grow-1">
              <button
                type="button"
                class="widget-tag-spotlight__name text-truncate"
                @click="openTag"
              >
                {{ spotlight.tag.name }}
              </button>
              <div class="text-caption text-medium-emphasis text-truncate">
                <button
                  type="button"
                  class="widget-tag-spotlight__category"
                  @click="openCategory"
                >
                  {{ categoryLabel }}
                </button>
              </div>
            </div>

            <div class="d-flex align-center ga-1 flex-shrink-0">
              <v-btn
                v-tooltip:top="t('all_tags.open_category')"
                icon
                size="small"
                variant="tonal"
                color="primary"
                :aria-label="t('all_tags.open_category')"
                @click="openCategory"
              >
                <v-icon size="18">mdi-{{ metaIcon }}</v-icon>
              </v-btn>
              <v-btn
                v-tooltip:top="t('home.widgets.tag_spotlight_open')"
                icon
                size="small"
                variant="tonal"
                color="primary"
                :aria-label="t('home.widgets.tag_spotlight_open')"
                @click="openTag"
              >
                <v-icon size="18">mdi-open-in-new</v-icon>
              </v-btn>
              <v-btn
                v-tooltip:top="t('home.widgets.tag_spotlight_edit')"
                icon
                size="small"
                variant="tonal"
                color="primary"
                :aria-label="t('home.widgets.tag_spotlight_edit')"
                @click="editTag"
              >
                <v-icon size="18">mdi-pencil-outline</v-icon>
              </v-btn>
            </div>
          </div>

          <div
            v-if="spotlight.tag.synonyms"
            class="text-caption text-medium-emphasis mb-2 text-truncate"
            :title="String(spotlight.tag.synonyms)"
          >
            {{ spotlight.tag.synonyms }}
          </div>

          <div class="widget-tag-spotlight__stats mb-3">
            <v-chip size="x-small" variant="tonal" prepend-icon="mdi-multimedia">
              {{ t('home.widgets.tag_spotlight_media_count', {count: mediaCount}) }}
            </v-chip>
            <v-chip size="x-small" variant="tonal" prepend-icon="mdi-eye">
              {{ viewsLabel }}
            </v-chip>
            <v-chip
              v-if="spotlight.meta?.rating"
              size="x-small"
              variant="tonal"
              prepend-icon="mdi-star"
            >
              {{ Number(spotlight.tag.rating) || 0 }}
            </v-chip>
            <v-chip
              v-if="spotlight.tag.favorite"
              size="x-small"
              color="pink"
              variant="tonal"
              prepend-icon="mdi-heart"
            />
          </div>

          <div v-if="tips.length" class="widget-tag-spotlight__tips mb-3">
            <div class="text-caption font-weight-medium mb-1">
              {{ t('home.widgets.tag_spotlight_tips') }}
            </div>
            <div class="d-flex flex-wrap ga-2">
              <v-btn
                v-for="tip in tips"
                :key="tip.id"
                size="small"
                rounded
                :variant="tip.id === tips[0]?.id ? 'flat' : 'tonal'"
                :color="tipTone(tip.id)"
                :prepend-icon="tipIcon(tip.id)"
                @click="runTip(tip)"
              >
                {{ tipLabel(tip.id) }}
              </v-btn>
            </div>
          </div>

          <div
            v-if="aiTip || aiBusy"
            class="widget-tag-spotlight__ai mb-3"
          >
            <div class="d-flex align-center ga-1 mb-1">
              <v-icon size="14" color="primary">mdi-creation-outline</v-icon>
              <span class="text-caption font-weight-medium">
                {{ t('home.widgets.tag_spotlight_ai') }}
              </span>
              <v-progress-circular
                v-if="aiBusy"
                indeterminate
                size="12"
                width="2"
                color="primary"
                class="ml-1"
              />
            </div>
            <div class="text-caption text-medium-emphasis">
              {{ aiTip || t('home.widgets.tag_spotlight_ai_loading') }}
            </div>
          </div>

          <div
            v-else-if="LOCAL_AI_UI_ENABLED && localAiReady && !aiTip && !aiBusy"
            class="mb-2"
          >
            <v-btn
              size="x-small"
              variant="text"
              color="primary"
              prepend-icon="mdi-creation-outline"
              @click="requestAiTip()"
            >
              {{ t('home.widgets.tag_spotlight_ai_ask') }}
            </v-btn>
          </div>
        </div>
      </div>

      <div
        v-if="sampleMedia.length"
        class="widget-tag-spotlight__media mt-3"
      >
        <div class="d-flex align-center justify-space-between mb-2">
          <div class="text-caption font-weight-medium">
            {{ t('home.widgets.tag_spotlight_sample_media') }}
          </div>
          <v-btn
            size="x-small"
            variant="text"
            color="primary"
            @click="openTag"
          >
            {{ t('home.widgets.view_all') }}
            <v-icon end size="16">mdi-chevron-right</v-icon>
          </v-btn>
        </div>
        <div class="widget-tag-spotlight__media-scroll">
          <WidgetMediaCard
            v-for="item in sampleMedia"
            :key="item.id"
            :item="item"
            :thumb="item.thumb"
            variant="views"
            @click="openMedia(item)"
          />
        </div>
      </div>

      <div
        v-if="relatedTags.length"
        class="widget-tag-spotlight__related mt-3"
      >
        <div class="text-caption font-weight-medium mb-2">
          {{ t('home.widgets.tag_spotlight_related') }}
        </div>
        <div class="d-flex flex-wrap ga-1">
          <v-chip
            v-for="related in relatedTags"
            :key="related.id"
            size="small"
            variant="outlined"
            :style="related.color ? {borderColor: related.color} : undefined"
            @click="openRelatedTag(related)"
            @contextmenu="showRelatedTagContextMenu($event, related)"
          >
            {{ related.name }}
          </v-chip>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRouter} from 'vue-router'
import path from 'path-browserify'
import {LOCAL_AI_UI_ENABLED} from '@shared/features'
import {typedApi} from '@/services/typedApi'
import {checkFileExists} from '@/services/fileService'
import {useAppShell} from '@/composable/appShell'
import {useAppStore} from '@/stores/app'
import {useDialogsStore} from '@/stores/dialogs'
import {useItemsStore} from '@/stores/items'
import WidgetMediaCard from '@/components/widgets/WidgetMediaCard.vue'
import HomeCardSkeleton from '@/components/widgets/HomeCardSkeleton.vue'
import {openItemContextMenu} from '@/composable/openItemContextMenu'
import {IMAGE_UNAVAILABLE_URL} from '@/utils/imageSource'
import {loadHomeMediaThumbs} from '@/utils/homeMediaThumbs'
import {getDefaultMediaTypeId, findMediaTypeById} from '@/utils/mediaType'
import {metaPath} from '@/composable/useLibraryNavItems'
import {resolveOpenMediaKind} from '@/utils/openMediaKind'
import {openTextMedia} from '@/utils/openTextMedia'
import {getMetaName} from '@/utils/metaI18n'
import {isThumbUnavailable, resolveTagThumbDisplayUrl} from '@/utils/thumbSource'
import {
  getCachedThumb,
  setCachedThumb,
  tagThumbKey,
} from '@/utils/thumbDisplayCache'
import type {ParsedHomeTagSpotlight, ParsedTagSpotlightTip} from '@shared/schemas/home'
import type {MediaItem, Meta, Tag} from '@/types/stores'
import type {HomeMediaItem} from '@/types/widgets'

const store = useAppStore()
const dialogsStore = useDialogsStore()
const itemsStore = useItemsStore()
const router = useRouter()
const appShell = useAppShell()
const {t, locale} = useI18n()

const loading = ref(true)
const spotlight = ref<ParsedHomeTagSpotlight | null>(null)
const tagImage = ref('')
const sampleMedia = ref<HomeMediaItem[]>([])
const localAiReady = ref<boolean | null>(null)
const aiBusy = ref(false)
const aiTip = ref('')
let aiAbort: AbortController | null = null
let loadSeq = 0

const mediaCount = computed(() => Number(spotlight.value?.mediaCount) || 0)
const tips = computed(() => spotlight.value?.tips || [])
const relatedTags = computed(() => {
  const nestedRaw = Array.isArray(spotlight.value?.tag?.tags)
    ? spotlight.value!.tag!.tags as Array<Record<string, unknown>>
    : []
  const nested = nestedRaw.map((entry) => ({
    id: Number(entry.tagId || entry.id || 0),
    name: String(entry.name || ''),
    metaId: Number(entry.metaId || 0),
    color: (entry.color as string | null | undefined) || null,
  })).filter((entry) => entry.id > 0 && entry.name)

  const cooccurring = (spotlight.value?.cooccurring || []).map((entry) => ({
    id: entry.id,
    name: entry.name,
    metaId: entry.metaId,
    color: entry.color || null,
  }))

  return [...nested, ...cooccurring].filter((entry, index, list) => (
    entry.id > 0
    && entry.id !== spotlight.value?.tag?.id
    && list.findIndex((other) => other.id === entry.id) === index
  )).slice(0, 10)
})

const categoryLabel = computed(() => {
  const meta = spotlight.value?.meta
  if (!meta) return ''
  const fromStore = store.meta.find((item) => Number(item.id) === Number(meta.id))
  return getMetaName(fromStore || meta as Meta, t)
})

const metaIcon = computed(() => String(spotlight.value?.meta?.icon || 'tag'))

const viewsLabel = computed(() => {
  const views = Number(spotlight.value?.tag?.views) || 0
  if (!views || !spotlight.value?.tag?.viewedAt) {
    return t('home.widgets.not_viewed')
  }
  return t('home.widgets.tag_spotlight_views', {count: views})
})

const thumbStyle = computed(() => {
  const color = spotlight.value?.tag?.color
  if (!color) return undefined
  return {boxShadow: `inset 0 0 0 2px ${color}`}
})

function tipIcon(id: string): string {
  switch (id) {
    case 'no_media':
    case 'add_to_media':
      return 'mdi-plus-box-outline'
    case 'delete_unused':
      return 'mdi-delete-outline'
    case 'view':
      return 'mdi-eye-outline'
    case 'fill_info':
    case 'add_synonyms':
    case 'add_bookmark':
    case 'rate':
      return 'mdi-pencil-outline'
    case 'explore_media':
      return 'mdi-play-box-outline'
    case 'add_related_tags':
      return 'mdi-tag-plus-outline'
    default:
      return 'mdi-lightbulb-outline'
  }
}

function tipTone(id: string): string {
  if (id === 'delete_unused') return 'warning'
  if (id === 'no_media' || id === 'view' || id === 'fill_info') return 'primary'
  return 'secondary'
}

function tipLabel(id: string): string {
  const key = `home.widgets.tag_spotlight_tip_${id}`
  return t(key)
}

function isLocalAiStatusReady(status: {
  enabled?: boolean | string | number
  status?: string
}) {
  const enabled = status.enabled === true
    || status.enabled === 1
    || status.enabled === '1'
    || status.enabled === 'true'
  return enabled && ['downloaded', 'loaded'].includes(String(status.status || ''))
}

async function resolveTagImage(metaId: number, tagId: number): Promise<string> {
  const cacheKey = tagThumbKey(metaId, tagId, 'main')
  const cached = getCachedThumb(cacheKey)
  if (cached) {
    return isThumbUnavailable(cached) ? '' : cached
  }
  if (!store.dbPath) return ''

  const absPath = path.join(store.dbPath, 'meta', String(metaId), `${tagId}_main.jpg`)
  if (!await checkFileExists(absPath)) {
    setCachedThumb(cacheKey, IMAGE_UNAVAILABLE_URL)
    return ''
  }

  const url = resolveTagThumbDisplayUrl({
    dbPath: store.dbPath,
    metaId,
    tagId,
    type: 'main',
  })
  setCachedThumb(cacheKey, url)
  return url
}

function onTagImageError() {
  tagImage.value = ''
  const tag = spotlight.value?.tag
  if (!tag?.metaId) return
  setCachedThumb(tagThumbKey(tag.metaId, tag.id, 'main'), IMAGE_UNAVAILABLE_URL)
}

async function loadSpotlight(excludeTagId?: number | null) {
  const seq = ++loadSeq
  loading.value = true
  aiAbort?.abort()
  aiTip.value = ''
  aiBusy.value = false

  try {
    const res = await typedApi.getHomeTagSpotlight(
      excludeTagId ? {excludeTagId} : undefined,
    )
    if (seq !== loadSeq) return

    spotlight.value = res.data
    sampleMedia.value = (res.data.sampleMedia || []) as HomeMediaItem[]

    if (res.data.tag?.metaId && res.data.tag.id) {
      tagImage.value = await resolveTagImage(res.data.tag.metaId, res.data.tag.id)
    } else {
      tagImage.value = ''
    }

    if (sampleMedia.value.length && store.dbPath) {
      await loadHomeMediaThumbs(sampleMedia.value, store.mediaTypes, store.dbPath)
    }

    if (LOCAL_AI_UI_ENABLED && res.data.tag) {
      void refreshLocalAiReady()
    }
  } catch (error) {
    console.error('Failed to load tag spotlight', error)
    if (seq === loadSeq) {
      spotlight.value = {tag: null}
      sampleMedia.value = []
      tagImage.value = ''
    }
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

function reshuffle() {
  void loadSpotlight(spotlight.value?.tag?.id ?? null)
}

function openCreateTag() {
  appShell.openTagsAddWithNames({})
}

function resolveMetaForTag(metaId?: number | null): Meta | null {
  if (metaId == null) return null
  const fromStore = store.meta.find((item) => Number(item.id) === Number(metaId))
  if (fromStore) return fromStore
  if (spotlight.value?.meta && Number(spotlight.value.meta.id) === Number(metaId)) {
    return spotlight.value.meta as Meta
  }
  return null
}

function openTag() {
  const tag = spotlight.value?.tag
  if (!tag?.metaId) return
  router.push(
    `/tag?metaId=${tag.metaId}&tagId=${tag.id}&mediaTypeId=${getDefaultMediaTypeId(store.mediaTypes)}`,
  )
}

function openCategory() {
  const metaId = spotlight.value?.tag?.metaId ?? spotlight.value?.meta?.id
  if (metaId == null) return
  router.push(metaPath(metaId))
}

function editTag() {
  const tag = spotlight.value?.tag
  const meta = resolveMetaForTag(tag?.metaId)
  if (!tag || !meta) return
  dialogsStore.editTag(tag as Tag, meta)
}

function openRelatedTag(related: {id: number; metaId: number}) {
  if (!related.id || !related.metaId) return
  router.push(
    `/tag?metaId=${related.metaId}&tagId=${related.id}&mediaTypeId=${getDefaultMediaTypeId(store.mediaTypes)}`,
  )
}

function showSpotlightTagContextMenu(event: MouseEvent) {
  const tag = spotlight.value?.tag
  if (!tag?.id) return
  const fullTag = store.getTagById(Number(tag.id)) || tag as Tag
  const meta = resolveMetaForTag(tag.metaId)
  openItemContextMenu(event, fullTag, 'tag', meta)
}

function showRelatedTagContextMenu(
  event: MouseEvent,
  related: {id: number; metaId: number; name: string; color: string | null},
) {
  if (!related.id) return
  const fullTag = store.getTagById(related.id) || {
    id: related.id,
    name: related.name,
    metaId: related.metaId,
    color: related.color || undefined,
  } as Tag
  const meta = resolveMetaForTag(related.metaId)
  openItemContextMenu(event, fullTag, 'tag', meta)
}

async function openMedia(item: MediaItem) {
  const mediaType = findMediaTypeById(store.mediaTypes, item.mediaTypeId)
  const kind = resolveOpenMediaKind(mediaType, {path: item.path})

  if (kind === 'play-av') {
    await itemsStore.playVideo({video: item, videos: [item]})
    return
  }
  if (kind === 'view-image') {
    itemsStore.viewImage({image: item})
    return
  }
  if (kind === 'preview-text' || kind === 'open-path') {
    openTextMedia(item)
  }
}

function runTip(tip: ParsedTagSpotlightTip) {
  switch (tip.action) {
    case 'edit':
    case 'delete':
      editTag()
      break
    case 'open_media':
    case 'open':
    default:
      openTag()
      break
  }
}

async function refreshLocalAiReady() {
  if (!LOCAL_AI_UI_ENABLED) {
    localAiReady.value = false
    return
  }
  try {
    const status = (await typedApi.getLocalAiStatus()).data
    localAiReady.value = isLocalAiStatusReady(status)
  } catch {
    localAiReady.value = false
  }
}

async function requestAiTip(data: ParsedHomeTagSpotlight | null = spotlight.value) {
  if (!LOCAL_AI_UI_ENABLED || !data?.tag) return
  await refreshLocalAiReady()
  if (!localAiReady.value) return

  aiAbort?.abort()
  aiAbort = new AbortController()
  aiBusy.value = true
  aiTip.value = ''

  const tipIds = (data.tips || []).map((tip) => tip.id).join(', ')
  const gaps = (data.gaps || []).join(', ')
  const prompt = [
    `Tag: ${data.tag.name}`,
    `Category: ${data.meta?.name || ''}`,
    `Media count: ${data.mediaCount ?? 0}`,
    `Views: ${data.tag.views ?? 0}`,
    gaps ? `Missing fields: ${gaps}` : 'Profile looks mostly filled',
    tipIds ? `Suggested actions: ${tipIds}` : '',
    'Write one short practical tip (1 sentence) for what the user should do next with this tag. No quotes, no markdown.',
  ].filter(Boolean).join('\n')

  try {
    let text = ''
    await typedApi.streamLocalAiChat(
      {
        mode: 'chat',
        locale: String(locale.value || 'en'),
        messages: [{role: 'user', content: prompt}],
        context: {
          tagId: data.tag.id,
          gaps: data.gaps || [],
          tips: (data.tips || []).map((tip) => tip.id),
          mediaCount: data.mediaCount ?? 0,
        },
        system: 'You help organize a personal media library. Reply with one concise actionable sentence in the user locale.',
      },
      aiAbort.signal,
      (event) => {
        if (event.type === 'token' && event.text) {
          text += event.text
          aiTip.value = text.trim()
        }
        if (event.type === 'done' && event.text) {
          aiTip.value = String(event.text).trim() || text.trim()
        }
        if (event.type === 'error') {
          aiTip.value = ''
        }
      },
    )
  } catch {
    aiTip.value = ''
  } finally {
    aiBusy.value = false
  }
}

watch(
  () => store.dbPath,
  () => {
    void loadSpotlight()
  },
)

onMounted(() => {
  void loadSpotlight()
})

onBeforeUnmount(() => {
  aiAbort?.abort()
  loadSeq += 1
})
</script>

<style lang="scss" scoped>
.widget-tag-spotlight {
  &__card {
    border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
    border-radius: 16px;
    padding: 14px;
    background: rgba(var(--v-theme-on-surface), 0.02);
  }

  &__layout {
    display: flex;
    gap: 14px;
    align-items: stretch;
    width: 100%;
  }

  &__body {
    flex: 1 1 auto;
    min-width: 0;
  }

  &__thumb {
    width: 112px;
    flex: 0 0 112px;
    aspect-ratio: 3 / 4;
    border-radius: 12px;
    overflow: hidden;
    border: 0;
    padding: 0;
    cursor: pointer;
    background: rgba(var(--v-theme-on-surface), 0.06);
    position: relative;
  }

  &__thumb-img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;

    :deep(.v-img__img) {
      object-fit: cover;
    }
  }

  &__thumb-fallback {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__skel-thumb {
    width: 112px;
    flex: 0 0 112px;
    aspect-ratio: 3 / 4;
    border-radius: 12px;
    overflow: hidden;
    background: rgba(var(--v-theme-on-surface), 0.08);
  }

  &__skel-copy {
    overflow: hidden;
    max-width: 100%;
  }

  &__bone {
    display: block;
    border-radius: 6px;
    background: rgba(var(--v-theme-on-surface), 0.08);

    &--name {
      width: min(220px, 55%);
      height: 22px;
      border-radius: 8px;
    }

    &--category {
      width: min(96px, 28%);
      height: 14px;
    }

    &--synonyms {
      width: min(280px, 70%);
      height: 12px;
    }

    &--icon-btn {
      width: 32px;
      height: 32px;
      border-radius: 50%;
    }

    &--chip {
      width: 72px;
      height: 22px;
      border-radius: 999px;
    }

    &--chip-wide {
      width: 110px;
    }

    &--chip-narrow {
      width: 48px;
    }

    &--section-label {
      width: 88px;
      height: 12px;
    }

    &--tip {
      height: 32px;
      border-radius: 999px;
    }

    &--link {
      width: 48px;
      height: 12px;
    }

    &--related {
      height: 24px;
      border-radius: 999px;
    }
  }

  &__name {
    display: block;
    max-width: 100%;
    border: 0;
    background: transparent;
    padding: 0;
    text-align: left;
    cursor: pointer;
    font-size: 1.05rem;
    font-weight: 600;
    color: inherit;
  }

  &__category {
    display: inline;
    max-width: 100%;
    border: 0;
    background: transparent;
    padding: 0;
    text-align: left;
    cursor: pointer;
    color: inherit;
    text-decoration: underline;
    text-decoration-color: transparent;
    transition: text-decoration-color 0.15s ease;

    &:hover {
      text-decoration-color: currentColor;
    }
  }

  &__stats {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  &__ai {
    border-radius: 10px;
    padding: 8px 10px;
    background: rgba(var(--v-theme-primary), 0.06);
  }

  &__media-scroll {
    display: flex;
    gap: 12px;
    overflow-x: auto;
    padding-bottom: 2px;
  }

  &__empty {
    border: 1px dashed rgba(var(--v-theme-on-surface), 0.18);
    border-radius: 12px;
    padding: 18px;
  }
}

@media (max-width: 600px) {
  .widget-tag-spotlight__layout {
    flex-direction: column;
  }

  .widget-tag-spotlight__thumb,
  .widget-tag-spotlight__skel-thumb {
    width: 100%;
    flex-basis: auto;
    max-width: 160px;
  }
}
</style>
