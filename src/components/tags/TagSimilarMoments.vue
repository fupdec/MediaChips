<template>
  <v-tooltip location="bottom" max-width="320" :text="t('marker_moments.find_hint')">
    <template #activator="{props: tooltipProps}">
      <v-btn
        v-bind="tooltipProps"
        prepend-icon="mdi-image-search-outline"
        variant="tonal"
        size="small"
        rounded
        :loading="loading"
        :disabled="busy !== null || loading"
        @click="search()"
      >
        {{ t('marker_moments.find') }}
      </v-btn>
    </template>
  </v-tooltip>

  <v-dialog v-model="open" width="800" scrollable :aria-label="t('marker_moments.title')">
    <v-card>
      <DialogHeader
        :header="t('marker_moments.title')"
        icon="image-search-outline"
        closable
        @close="open = false"
      />

      <v-card-text class="pa-4 pt-2">
        <p class="text-body-2 text-medium-emphasis mb-1">{{ t('marker_moments.purpose') }}</p>
        <v-btn
          variant="text"
          color="primary"
          size="small"
          prepend-icon="mdi-help-circle-outline"
          class="mb-2"
          @click="appShell.showDocumentation('markers.suggested_moments')"
        >
          {{ t('marker_moments.help') }}
        </v-btn>
        <div :aria-busy="loading">
          <v-alert v-if="message" :type="failed ? 'error' : 'info'" variant="tonal" density="compact" class="text-caption mb-1">
            {{ message }}
          </v-alert>
          <div v-if="loading" aria-hidden="true">
            <div v-for="row in 2" :key="row" class="moment-results__row moment-results__skeleton px-2">
              <span class="moment-results__skeleton-thumb" />
              <span class="moment-results__skeleton-title" />
              <div class="moment-results__skeleton-actions">
                <span class="moment-results__skeleton-time" />
                <span />
                <span />
              </div>
            </div>
          </div>
          <v-virtual-scroll
            v-if="hits.length"
            :items="hits"
            :item-height="64"
            :height="Math.min(hits.length * 64, 448)"
            max-height="55vh"
          >
            <template #default="{item: hit}">
              <v-list-item :key="hitKey(hit)" rounded="lg" class="moment-results__row px-2" :title="hitName(hit)">
                <template #prepend>
                  <button
                    type="button"
                    class="moment-results__thumb rounded mr-3"
                    :title="thumbnailLabel(hit)"
                    :aria-label="`${t('context_menu.view_image')}. ${thumbnailLabel(hit)}`"
                    @click="viewThumbnails(hit)"
                  >
                    <v-img
                      :src="thumbnail(hit, 160)"
                      width="80"
                      height="45"
                      cover
                      class="rounded"
                      @error="onThumbnailError(hit)"
                    />
                    <span class="moment-results__thumb-badge" aria-hidden="true">
                      <v-icon :icon="exactThumbnail(hit) ? 'mdi-clock-check-outline' : 'mdi-image-outline'" size="12" />
                    </span>
                  </button>
                </template>
                <template #append>
                  <div class="d-flex align-center ga-1 ml-2">
                    <v-btn
                      size="x-small"
                      color="primary"
                      class="moment-results__time"
                      variant="tonal"
                      prepend-icon="mdi-play"
                      :disabled="busy !== null || loading"
                      @click="play(hit)"
                    >
                      {{ formatGridSeekTimestamp(hit.time) }}
                    </v-btn>
                    <v-btn
                      icon="mdi-check"
                      size="x-small"
                      color="success"
                      variant="text"
                      :title="t('marker_moments.confirm')"
                      :aria-label="t('marker_moments.confirm')"
                      :disabled="busy !== null || loading"
                      :loading="busy === hitKey(hit)"
                      @click="confirm(hit)"
                    />
                    <v-btn
                      icon="mdi-close"
                      size="x-small"
                      variant="text"
                      :title="t('marker_moments.reject')"
                      :aria-label="t('marker_moments.reject')"
                      :disabled="busy !== null || loading"
                      @click="reject(hit)"
                    />
                  </div>
                </template>
              </v-list-item>
            </template>
          </v-virtual-scroll>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {ref} from 'vue'
import {useI18n} from 'vue-i18n'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import {typedApi} from '@/services/typedApi'
import {useAppStore} from '@/stores/app'
import {buildLocalFileUrl} from '@/services/fileService'
import {captureVideoFrameAt} from '@/services/webVideoFrames'
import {getMarkImagePath} from '@/utils/markThumb'
import {resolveMediaThumbDisplayUrl} from '@/utils/thumbSource'
import {useItemsStore} from '@/stores/items'
import {useAppShell} from '@/composable/appShell'
import {useEventBus} from '@/utils/eventBus'
import {markerMomentsAutoRefresh, markerMomentRejectionKey, readMarkerMomentRejections} from '@/services/markerMomentPreferences'
import {formatGridSeekTimestamp} from '@shared/videoPreview'

type MediaBasic = NonNullable<Awaited<ReturnType<typeof typedApi.getMediaBasics>>['data']['items']>[number]
type Hit = {id: number; time: number; markId?: number; video: MediaBasic}

const props = defineProps<{tagId: number}>()
const {t} = useI18n()
const items = useItemsStore()
const app = useAppStore()
const eventBus = useEventBus()
const appShell = useAppShell()
const open = ref(false)
const loading = ref(false)
const failed = ref(false)
const message = ref('')
const hits = ref<Hit[]>([])
const busy = ref<string | null>(null)
const unavailableMarks = ref(new Set<number>())
const capturedFrames = ref(new Map<string, string>())

function hitKey(hit: Pick<Hit, 'id' | 'time'>) {
  return `${hit.id}:${hit.time}`
}

function hitName(hit: Hit): string {
  const {name, basename} = hit.video
  return name || (typeof basename === 'string' ? basename : '') || String(hit.id)
}

function markerThumbnail(hit: Hit) {
  return hit.markId && app.mediaPath && !unavailableMarks.value.has(hit.markId)
    ? buildLocalFileUrl(getMarkImagePath(app.mediaPath, hit.markId))
    : null
}

function thumbnailLabel(hit: Hit) {
  return t(exactThumbnail(hit) ? 'marker_moments.exact_preview' : 'marker_moments.media_preview')
}

function exactThumbnail(hit: Hit) {
  return markerThumbnail(hit) ?? capturedFrames.value.get(hitKey(hit))
}

function thumbnail(hit: Hit, maxEdge?: number) {
  return exactThumbnail(hit)
    ?? resolveMediaThumbDisplayUrl(app.mediaPath, 'videos', hit.id, 'thumbs', {maxEdge})
    ?? '/images/unavailable.png'
}

function onThumbnailError(hit: Hit) {
  if (hit.markId && app.mediaPath) unavailableMarks.value.add(hit.markId)
}

function viewThumbnails(hit: Hit) {
  const sources = hits.value.map((candidate) => {
    const name = `${hitName(candidate)} · ${formatGridSeekTimestamp(candidate.time)}`
    const path = candidate.video.path
    return {
      src: thumbnail(candidate),
      name: `${name} · ${thumbnailLabel(candidate)}`,
      loadPreview: !exactThumbnail(candidate) && path
        ? async (signal: AbortSignal) => {
          const src = await captureVideoFrameAt(buildLocalFileUrl(path, true), candidate.time, signal)
          signal.throwIfAborted()
          capturedFrames.value.set(hitKey(candidate), src)
          return {src, name: `${name} · ${t('marker_moments.exact_preview')}`}
        }
        : undefined,
    }
  })
  eventBus.emit('viewImage', {sources, index: hits.value.indexOf(hit)})
}

async function search(refresh = false) {
  if (!refresh) open.value = true
  loading.value = true
  failed.value = false
  if (!refresh) {
    message.value = ''
    hits.value = []
    unavailableMarks.value.clear()
  }
  try {
    const rejected = readMarkerMomentRejections(markerMomentRejectionKey(props.tagId))
    const {data} = await typedApi.similarMarkerMoments(props.tagId, rejected)
    if (!data.hits.length) hits.value = []
    if (data.hits.length) {
      const {data: videos} = await typedApi.getMediaBasics({ids: data.hits.map(({id}) => id)})
      const byId = new Map((videos.items ?? []).map((video) => [Number(video.id), video]))
      hits.value = data.hits.flatMap((hit) => {
        const video = byId.get(hit.id)
        return video ? [{...hit, video}] : []
      })
    }
    if (!hits.value.length) {
      const reason = !data.markCount ? 'no_marks'
        : !data.seedCount && !['loaded', 'loading', 'downloaded'].includes(data.modelStatus) ? 'no_model'
        : !data.seedCount ? 'no_frames'
        : !data.indexedCount ? 'no_index' : 'empty'
      message.value = t(`marker_moments.${reason}`)
    }
  } catch {
    showError()
  } finally {
    loading.value = false
  }
}

function showError() {
  failed.value = true
  message.value = t('marker_moments.error')
}

function remove(hit: Hit, notice: string) {
  hits.value = hits.value.filter((candidate) => hitKey(candidate) !== hitKey(hit))
  failed.value = false
  message.value = t(notice)
}

async function play(hit: Hit) {
  try {
    await items.playVideo({video: hit.video, time: hit.time, player: 'builtin', inline: true})
  } catch {
    showError()
  }
}

async function confirm(hit: Hit) {
  busy.value = hitKey(hit)
  try {
    const {data} = await typedApi.createMark({type: 'meta', tagId: props.tagId, mediaId: hit.id, time: hit.time})
    remove(hit, 'marker_moments.confirmed')
    if (data.id != null) {
      await typedApi.createMarkThumb({markId: data.id, mediaId: hit.id}).catch(() => {
        message.value = t('marker_moments.confirmed_no_thumb')
      })
    }
    if (markerMomentsAutoRefresh.value && open.value) await search(true)
  } catch {
    showError()
  } finally {
    busy.value = null
  }
}

async function reject(hit: Hit) {
  try {
    const key = markerMomentRejectionKey(props.tagId)
    const rejected = readMarkerMomentRejections(key)
    localStorage.setItem(key, JSON.stringify([...new Set([...rejected, hitKey(hit)])].slice(-1000)))
    remove(hit, 'marker_moments.rejected')
    if (markerMomentsAutoRefresh.value && open.value) await search(true)
  } catch {
    showError()
  }
}
</script>

<style scoped>
.moment-results__row {
  height: 64px;
}

.moment-results__thumb {
  position: relative;
}

.moment-results__thumb-badge {
  position: absolute;
  inset-inline-end: 3px;
  bottom: 3px;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 5px;
  background: rgba(0, 0, 0, 0.42);
  color: white;
}

.moment-results__row.v-list-item:hover,
.moment-results__row.v-list-item:focus-within {
  background: rgba(var(--v-theme-on-surface), 0.05);
}

.moment-results__skeleton {
  display: grid;
  grid-template-columns: 80px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
}

.moment-results__skeleton span {
  display: block;
  background: rgba(var(--v-theme-on-surface), 0.09);
  border-radius: 6px;
}

.moment-results__skeleton-thumb {
  height: 45px;
}

.moment-results__skeleton-title {
  width: min(72%, 240px);
  height: 10px;
}

.moment-results__skeleton:nth-child(2) .moment-results__skeleton-title {
  width: min(56%, 180px);
}

.moment-results__skeleton-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-inline-end: 6px;
}

.moment-results__skeleton-actions span {
  width: 14px;
  height: 14px;
  border-radius: 50%;
}

.moment-results__skeleton-actions .moment-results__skeleton-time {
  width: 70px;
  height: 20px;
  border-radius: 5px;
}

.moment-results__row :deep(.v-list-item-title) {
  font-size: 0.8125rem;
}

.moment-results__time {
  font-variant-numeric: tabular-nums;
}
</style>
