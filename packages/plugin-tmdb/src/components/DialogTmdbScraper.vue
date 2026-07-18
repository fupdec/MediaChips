<template>
  <v-dialog
    :model-value="dialogsStore.tmdbScraper.show"
    max-width="760"
    scrollable
    @update:model-value="onToggle"
  >
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon start>mdi-movie-search-outline</v-icon>
        TMDB
        <v-spacer/>
        <v-btn icon variant="text" @click="close"><v-icon>mdi-close</v-icon></v-btn>
      </v-card-title>

      <v-card-text>
        <div v-if="media" class="text-body-2 mb-3 text-medium-emphasis">
          File: <strong class="text-high-emphasis">{{ media.basename || media.path?.split(/[/\\]/).pop() || media.name }}</strong>
        </div>

        <v-text-field
          v-model="query"
          label="Search title, TMDB id, or IMDb id (tt…)"
          variant="outlined"
          rounded
          hide-details
          class="mb-2"
          @keyup.enter="runSearch"
        />
        <v-text-field
          v-model="year"
          label="Year (optional)"
          variant="outlined"
          rounded
          hide-details
          class="mb-3"
          style="max-width: 160px"
        />

        <v-btn color="primary" rounded class="mb-4" :loading="loading" :disabled="!query.trim()" @click="runSearch">
          Search
        </v-btn>

        <v-alert v-if="error" type="error" variant="tonal" class="mb-4" density="comfortable">
          {{ error }}
        </v-alert>

        <div v-else-if="searched && !hits.length && !extras" class="text-body-2 text-medium-emphasis mb-4">
          Nothing found. Try a shorter title, or search movies and TV separately by id.
        </div>

        <v-list v-if="hits.length" density="compact" class="mb-4">
          <v-list-item
            v-for="hit in hits"
            :key="`${hit.mediaType}-${hit.id}`"
            :title="hit.title"
            :subtitle="hitSubtitle(hit)"
            @click="selectHit(hit)"
          >
            <template #prepend>
              <v-avatar rounded size="40">
                <v-img v-if="hit.posterUrl" :src="hit.posterUrl"/>
                <v-icon v-else>{{ hit.mediaType === 'tv' ? 'mdi-television-classic' : 'mdi-movie-outline' }}</v-icon>
              </v-avatar>
            </template>
            <template #append>
              <v-chip size="x-small" variant="tonal">{{ hit.mediaType }}</v-chip>
            </template>
          </v-list-item>
        </v-list>

        <template v-if="extras">
          <v-img
            v-if="extras.image"
            :src="extras.image"
            max-height="180"
            max-width="120"
            class="mb-4 rounded"
            cover
          />
          <v-checkbox
            v-for="field in fieldOptions"
            :key="field.key"
            v-model="selectedFields"
            :label="field.label"
            :value="field.key"
            :disabled="!field.enabled"
            density="compact"
            hide-details
          />
        </template>
      </v-card-text>

      <v-card-actions>
        <v-spacer/>
        <v-btn variant="text" @click="close">Cancel</v-btn>
        <v-btn
          color="success"
          rounded
          :loading="applying"
          :disabled="!extras || selectedFields.length === 0"
          @click="apply"
        >
          Apply
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue'
import {useDialogsStore} from '@/stores/dialogs'
import {useAppStore} from '@/stores/app'
import {
  findTmdbByImdb,
  getTmdbMovie,
  getTmdbTitle,
  searchTmdbMovies,
  type TmdbSearchHit,
} from '../services/tmdbApi'
import {
  applyTmdbExtrasToMedia,
  normalizeTmdbExtras,
  type TmdbApplyFieldKey,
  type TmdbExtras,
} from '../services/tmdbApply'
import {useEventBus} from '@/utils/eventBus'
import {typedApi} from '@/services/typedApi'
import {useItemsStore} from '@/stores/items'
import {invalidateVideoThumbCaches} from '@/utils/thumbDisplayCache'
import {parseMediaFilePath} from '@shared/mediaPath'

const emit = defineEmits<{close: []}>()
const dialogsStore = useDialogsStore()
const appStore = useAppStore()
const itemsStore = useItemsStore()
const eventBus = useEventBus()

const query = ref('')
const year = ref('')
const loading = ref(false)
const applying = ref(false)
const searched = ref(false)
const error = ref('')
const hits = ref<TmdbSearchHit[]>([])
const extras = ref<TmdbExtras | null>(null)
const selectedFields = ref<TmdbApplyFieldKey[]>([])

const media = computed(() => dialogsStore.tmdbScraper.media)

function searchQueryFromMedia(item: NonNullable<typeof media.value>): string {
  // Use the real filename (no extension) so each episode/file stays distinct.
  // Do not strip SxxExx / codec tags — that made every BBT episode become
  // the same "The Big Bang Theory" query.
  const fromPath = item.path ? parseMediaFilePath(item.path).name : ''
  const fromBasename = item.basename
    ? parseMediaFilePath(item.basename).name
    : ''
  const raw = fromBasename || fromPath || item.name || ''
  return raw.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim()
}

const fieldOptions = computed(() => {
  const data = extras.value
  if (!data) return []
  return [
    {key: 'title' as const, label: `Title: ${data.title || '—'}`, enabled: Boolean(data.title)},
    {key: 'release_date' as const, label: `Release date: ${data.release_date || '—'}`, enabled: Boolean(data.release_date)},
    {key: 'studio' as const, label: `Studio: ${data.studio || '—'}`, enabled: Boolean(data.studio)},
    {key: 'cast' as const, label: `Cast: ${(data.cast || []).slice(0, 5).join(', ') || '—'}`, enabled: (data.cast || []).length > 0},
    {key: 'genres' as const, label: `Genres: ${(data.genres || []).join(', ') || '—'}`, enabled: (data.genres || []).length > 0},
    {key: 'poster' as const, label: 'Poster', enabled: Boolean(data.image)},
  ]
})

function hitSubtitle(hit: TmdbSearchHit): string {
  const parts = [
    hit.mediaType.toUpperCase(),
    hit.releaseDate?.slice(0, 4),
    hit.overview?.slice(0, 80),
  ].filter(Boolean)
  return parts.join(' · ')
}

function close() {
  dialogsStore.tmdbScraper.show = false
  emit('close')
}

function onToggle(show: boolean) {
  if (!show) close()
}

function looksLikeImdbId(value: string): boolean {
  return /^tt\d+$/i.test(value.trim()) || /^\d{6,8}$/.test(value.trim())
}

function looksLikeTmdbId(value: string): boolean {
  return /^\d+$/.test(value.trim())
}

async function selectHit(hit: TmdbSearchHit) {
  loading.value = true
  error.value = ''
  try {
    const hint = media.value?.name || media.value?.basename || query.value
    const response = hit.mediaType === 'tv'
      ? await getTmdbTitle('tv', hit.id, {hint: String(hint || '')})
      : await getTmdbTitle('movie', hit.id)
    extras.value = normalizeTmdbExtras(response.extras)
    selectedFields.value = fieldOptions.value.filter((field) => field.enabled).map((field) => field.key)
  } catch (err) {
    error.value = (err as {response?: {data?: {error?: string}}})?.response?.data?.error
      || (err instanceof Error ? err.message : String(err))
  } finally {
    loading.value = false
  }
}

async function runSearch() {
  loading.value = true
  error.value = ''
  searched.value = true
  hits.value = []
  extras.value = null
  try {
    const q = query.value.trim()
    if (looksLikeImdbId(q) && !looksLikeTmdbId(q)) {
      const response = await findTmdbByImdb(q)
      extras.value = normalizeTmdbExtras(response.extras)
      selectedFields.value = fieldOptions.value.filter((field) => field.enabled).map((field) => field.key)
      return
    }
    if (looksLikeTmdbId(q)) {
      // Prefer TV when filename looks like an episode.
      const hint = String(media.value?.name || media.value?.basename || '')
      const preferTv = /[Ss]\d{1,2}[Ee]\d{1,3}/.test(hint)
      try {
        const response = preferTv
          ? await getTmdbTitle('tv', q, {hint})
          : await getTmdbMovie(q)
        extras.value = normalizeTmdbExtras(response.extras)
      } catch {
        const response = preferTv
          ? await getTmdbMovie(q)
          : await getTmdbTitle('tv', q, {hint})
        extras.value = normalizeTmdbExtras(response.extras)
      }
      selectedFields.value = fieldOptions.value.filter((field) => field.enabled).map((field) => field.key)
      return
    }
    const response = await searchTmdbMovies({
      query: q,
      year: year.value.trim() || undefined,
    })
    hits.value = response.results
    if (hits.value.length === 1) await selectHit(hits.value[0])
  } catch (err) {
    error.value = (err as {response?: {data?: {error?: string}}})?.response?.data?.error
      || (err instanceof Error ? err.message : String(err))
  } finally {
    loading.value = false
  }
}

async function refreshAfterApply(mediaId: number, refreshThumb: boolean) {
  try {
    const tagsRes = await typedApi.getTags()
    appStore.tags = (tagsRes.data || []).map((tag) => ({
      ...tag,
      metaId: tag.metaId ?? undefined,
      name: tag.name ?? undefined,
      synonyms: tag.synonyms ?? undefined,
      color: tag.color ?? undefined,
      bookmark: tag.bookmark ?? undefined,
    }))
  } catch {
    // non-fatal
  }

  const nextName = extras.value?.title
  if (nextName && selectedFields.value.includes('title')) {
    itemsStore.updateItem({
      id: mediaId,
      item: {name: nextName},
    })
    if (dialogsStore.tmdbScraper.media?.id === mediaId) {
      dialogsStore.tmdbScraper.media = {
        ...dialogsStore.tmdbScraper.media,
        name: nextName,
      }
    }
    if (dialogsStore.mediaEditing.media?.id === mediaId) {
      dialogsStore.mediaEditing.media = {
        ...dialogsStore.mediaEditing.media,
        name: nextName,
      }
    }
  }

  try {
    const [tagsRes, valuesRes] = await Promise.all([
      typedApi.getTagsInMedia(mediaId),
      typedApi.getValuesInMedia(mediaId),
    ])
    itemsStore.updateItem({
      id: mediaId,
      item: {
        tags: (tagsRes.data || []).map((entry) => ({
          tagId: Number(entry.tagId),
          metaId: Number(entry.metaId),
        })),
        values: (valuesRes.data || []).map((entry) => ({
          metaId: Number(entry.metaId),
          value: entry.value,
        })),
      },
    })
  } catch {
    // non-fatal — editor reload below still hits the API
  }

  eventBus.emit('getMeta')
  eventBus.emit('getItemsFromDb', {ids: [mediaId], type: 'media'})
  // Reload open media editor form (same path as adult scene scraper).
  eventBus.emit('transferSceneScrapedInfo')

  if (refreshThumb) {
    invalidateVideoThumbCaches(mediaId)
    itemsStore.refreshThumb(mediaId)
  }
}

async function apply() {
  if (!media.value || !extras.value) return
  applying.value = true
  error.value = ''
  try {
    const mediaId = Number(media.value.id)
    const result = await applyTmdbExtrasToMedia({
      media: media.value,
      extras: extras.value,
      selectedFields: selectedFields.value,
      mediaPath: appStore.mediaPath,
    })
    if (!result.success) {
      error.value = result.error || 'Apply failed'
      return
    }

    await refreshAfterApply(mediaId, Boolean(selectedFields.value.includes('poster')))

    if (result.posterFailed) {
      error.value = 'Metadata applied, but poster download failed.'
      return
    }
    if (result.error) {
      error.value = result.error
      return
    }
    close()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    applying.value = false
  }
}

function resetDialogState() {
  query.value = media.value ? searchQueryFromMedia(media.value) : ''
  year.value = ''
  hits.value = []
  extras.value = null
  error.value = ''
  searched.value = false
  selectedFields.value = []
}

// Dialog is mounted with v-if when show is already true — watch alone never fires.
onMounted(resetDialogState)
watch(() => dialogsStore.tmdbScraper.show, (show) => {
  if (show) resetDialogState()
})
</script>
