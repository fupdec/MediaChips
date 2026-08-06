<template>
  <v-container ref="container">
    <div class="text-md-h2 d-flex align-center my-6 playlists-page-title">
      <v-icon size="42" start>mdi-format-list-bulleted</v-icon>
      {{ t('navigation.playlists') }}
      <v-spacer />
      <v-btn
        variant="text"
        size="small"
        color="primary"
        class="smart-playlists-docs-link"
        @click="showSmartPlaylistsDocs"
      >
        <v-icon start size="18">mdi-help-circle-outline</v-icon>
        {{ t('playlists.smart_playlists_docs') }}
      </v-btn>
    </div>

    <section class="smart-playlists-section">
      <div class="section-title text-h5 mb-4 d-flex align-center">
        <v-icon start>mdi-filter-variant</v-icon>
        {{ t('playlists.dynamic_playlists') }}
      </div>

      <v-alert
        v-if="!is_dynamic_loading && !dynamicPlaylists.length"
        type="info"
        variant="tonal"
        density="compact"
        rounded="xl"
        class="mb-4"
        icon="mdi-information-outline"
      >
        {{ t('playlists.no_smart_playlists_hint_before') }}
        <router-link
          v-if="videoPageUrl"
          :to="videoPageUrl"
          class="smart-playlists-video-link font-weight-bold text-decoration-none"
        >
          <v-icon
            :icon="videoPageIcon"
            size="16"
            class="smart-playlists-video-link__icon"
          />
          {{ videoPageLabel }}
        </router-link>
        <span v-else class="font-weight-bold">{{ videoPageLabel }}</span>
        {{ t('playlists.no_smart_playlists_hint_after') }}
      </v-alert>

      <div
        v-if="is_dynamic_loading"
        class="playlists-grid mb-4"
      >
        <PlaylistCard
          v-for="index in dynamicCardsPerRow"
          :key="`dynamic-skeleton-card-${index}`"
          :playlist="dynamicSkeletonPlaylist"
          :loading="true"
          :show-edit="false"
        />
      </div>

      <div
        v-else-if="dynamicFeatured.length"
        class="playlists-grid mb-4"
      >
        <PlaylistCard
          v-for="playlist in dynamicFeatured"
          :key="`dynamic-card-${playlist.id}`"
          :playlist="playlist"
          :video-count="playlist.count ?? undefined"
          :thumbs-loading="!is_dynamic_thumbs_loaded"
          :playing="playingPlaylistId === playlist.id"
          @play="playDynamic(playlist)"
          @edit="editDynamic(playlist)"
        />
      </div>

      <div
        v-if="is_dynamic_loading"
        class="dynamic-playlists-list"
      >
        <DynamicPlaylistRow
          v-for="index in dynamicRowSkeletonCount"
          :key="`dynamic-skeleton-row-${index}`"
          :playlist="dynamicSkeletonPlaylist"
          skeleton
        />
      </div>

      <div
        v-else-if="dynamicList.length"
        class="dynamic-playlists-list"
      >
        <DynamicPlaylistRow
          v-for="playlist in dynamicList"
          :key="`dynamic-row-${playlist.id}`"
          :playlist="playlist"
          :thumbs-loading="!is_dynamic_thumbs_loaded"
          :playing="playingPlaylistId === playlist.id"
          @play="playDynamic(playlist)"
          @edit="editDynamic(playlist)"
        />
      </div>
    </section>

    <div class="section-title text-h5 mb-4 d-flex align-center">
      <v-icon start>mdi-playlist-play</v-icon>
      {{ t('playlists.manual_playlists') }}
    </div>

    <v-btn @click="dialogPlaylistAdd = true" color="success" class="mb-8" rounded depressed>
      <v-icon start>mdi-playlist-plus</v-icon>
      {{ t('playlists.add_new_playlist') }}
    </v-btn>

    <div v-if="playlists.length == 0 && is_manual_loaded" class="layout-img">
      <v-img src="/images/no-data.svg" max-height="40vh" class="my-4" contain></v-img>
      <div class="text-h6 mb-1">{{ t('empty_states.no_items_title') }}</div>
      <div class="text--secondary">{{ t('empty_states.no_items_add_first') }}</div>
    </div>

    <div v-else class="playlists-grid">
      <PlaylistCard
        v-for="playlist in playlists"
        :key="playlist.id"
        :playlist="playlist"
        :thumbs-loading="!is_thumbs_loaded"
        :playing="playingPlaylistId === `manual-${playlist.id}`"
        @play="play(playlist)"
        @edit="edit(playlist)"
      />
    </div>

    <DialogPlaylistAdd
      v-if="dialogPlaylistAdd"
      @close="dialogPlaylistAdd = false"
      @add="addNewPlaylist"
      :dialog="dialogPlaylistAdd"
    />

    <DialogPlaylistEdit
      v-if="dialogPlaylistEdit"
      @close="dialogPlaylistEdit = false"
      @delete="deletePlaylist"
      @updatePlaylist="getPlaylists"
      :dialog="dialogPlaylistEdit"
      :playlist="playlist_edit ?? undefined"
    />

    <DialogSmartPlaylistEdit
      v-if="dialogSmartPlaylistEdit"
      @close="dialogSmartPlaylistEdit = false"
      @delete="deleteSmartPlaylist"
      @updatePlaylist="onSmartPlaylistUpdated"
      :dialog="dialogSmartPlaylistEdit"
      :playlist="smart_playlist_edit ?? undefined"
    />
  </v-container>
</template>

<script setup lang="ts">
import {ref, computed, onMounted} from 'vue'
import {useI18n} from 'vue-i18n'
import {useDisplay} from 'vuetify'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {usePlayerStore} from '@/stores/player'
import {useSettingsStore} from '@/stores/settings'
import {typedApi} from '@/services/typedApi'
import DialogPlaylistAdd from "@/components/dialogs/DialogPlaylistAdd.vue"
import DialogPlaylistEdit from "@/components/dialogs/DialogPlaylistEdit.vue"
import DialogSmartPlaylistEdit from "@/components/dialogs/DialogSmartPlaylistEdit.vue"
import PlaylistCard from "@/components/playlists/PlaylistCard.vue"
import DynamicPlaylistRow from "@/components/playlists/DynamicPlaylistRow.vue"
import {loadPlaylistThumbs} from '@/utils/playlistThumbs'
import {openSeparatePlayer, canOpenSeparatePlayer} from '@/utils/playerWindow'
import {setNotification} from '@/services/notificationService'
import {getFilters} from '@/services/filterService'
import {useAppShell} from '@/composable/appShell'
import {getErrorStatus} from '@/types/vue'
import {getDefaultMediaTypeId, isVideoMediaType} from '@/utils/mediaType'
import {getMediaTypeName} from '@/utils/mediaTypeI18n'
import type { ParsedDynamicPlaylistSummary } from '@shared/schemas/filters'
import type { SavedFilterBasic } from '@shared/entities/filter'
import type { PagePlaylist } from '@/types/playlists'
import type { MediaItem } from '@/types/stores'

const toPagePlaylistFromBasic = (playlist: SavedFilterBasic): PagePlaylist => ({
  id: playlist.id,
  name: playlist.name ?? '',
  count: null,
  countLoading: true,
  previewIds: [],
  thumbs: [],
})

const toPagePlaylistFromSummary = (playlist: ParsedDynamicPlaylistSummary): PagePlaylist => ({
  id: playlist.id,
  name: playlist.name ?? '',
  count: Number(playlist.count) || 0,
  countLoading: false,
  previewIds: playlist.previewIds || [],
  thumbs: [],
})
const appStore = useAppStore()
const itemsStore = useItemsStore()
const playerStore = usePlayerStore()
const settingsStore = useSettingsStore()
const {t} = useI18n()
const {width} = useDisplay()
const appShell = useAppShell()

const container = ref<HTMLElement | null>(null)
const playlists = ref<PagePlaylist[]>([])
const dynamicPlaylists = ref<PagePlaylist[]>([])
const is_thumbs_loaded = ref(false)
const is_manual_loaded = ref(false)
const is_dynamic_loading = ref(false)
const is_dynamic_thumbs_loaded = ref(false)
const playingPlaylistId = ref<string | number | null>(null)
const dialogPlaylistEdit = ref(false)
const dialogSmartPlaylistEdit = ref(false)
const dialogPlaylistAdd = ref(false)
const playlist_edit = ref<PagePlaylist | null>(null)
const smart_playlist_edit = ref<PagePlaylist | null>(null)

const apiUrl = computed(() => appStore.localhost)

const videoMediaType = computed(() => appStore.mediaTypes?.find(isVideoMediaType) ?? null)

const videoPageUrl = computed(() => {
  const mediaTypeId = videoMediaType.value?.id ?? getDefaultMediaTypeId(appStore.mediaTypes)
  return mediaTypeId ? `/media?mediaTypeId=${mediaTypeId}` : null
})

const videoPageLabel = computed(() => {
  if (videoMediaType.value) return getMediaTypeName(videoMediaType.value, t)
  return t('playlists.no_smart_playlists_video_page')
})

const videoPageIcon = computed(() => {
  const icon = videoMediaType.value?.icon
  return icon ? `mdi-${icon}` : 'mdi-video'
})

const dynamicCardsPerRow = computed(() => {
  if (width.value >= 1900) return 5
  if (width.value >= 1500) return 4
  if (width.value >= 1200) return 3
  if (width.value >= 900) return 2
  return 1
})

const dynamicFeatured = computed(() => dynamicPlaylists.value.slice(0, dynamicCardsPerRow.value))
const dynamicList = computed(() => dynamicPlaylists.value.slice(dynamicCardsPerRow.value))
const dynamicRowSkeletonCount = 4
const dynamicSkeletonPlaylist: PagePlaylist = { id: 0, name: '', thumbs: [], count: 0 }

const enrichMediaItem = (item: MediaItem): MediaItem & { key: string } => ({
  ...item,
  tags: item.tags || [],
  values: item.values || [],
  key: String(item.id),
})

const playVideos = async (videos: MediaItem[]) => {
  if (!videos?.length) return false

  return itemsStore.playVideo({
    video: videos[0],
    videos,
    trustPath: true,
  })
}

const applyFullPlaylist = async (videos: MediaItem[]) => {
  const firstPlayable = await itemsStore.findFirstPlayableVideo(videos)
    || videos.find((item) => item?.path)
    || videos[0]

  if (!firstPlayable) return false

  const useSeparatePlayer = settingsStore.open_player_in_separate_window == '1'
    && canOpenSeparatePlayer()

  if (playerStore.active) {
    playerStore.setPlaylistItems(videos, {host: apiUrl.value})

    const currentVideo = playerStore.playlist[playerStore.nowPlaying]
    const shouldRestart = playerStore.playbackError
      || !playerStore.is_file_exists
      || currentVideo?.id !== firstPlayable.id

    if (shouldRestart) {
      await itemsStore.playVideo({
        video: firstPlayable,
        videos,
        trustPath: true,
      })
    }

    return true
  }

  if (useSeparatePlayer) {
    if (openSeparatePlayer({
      video: firstPlayable,
      videos,
      time: 0,
    })) {
      return true
    }
  }

  return false
}

const play = async (playlist: PagePlaylist) => {
  if (!playlist.media?.length || playingPlaylistId.value) return

  playingPlaylistId.value = `manual-${playlist.id}`

  try {
    await playVideos(playlist.media)
  } finally {
    playingPlaylistId.value = null
  }
}

const playDynamic = async (playlist: PagePlaylist) => {
  if (playingPlaylistId.value) return

  playingPlaylistId.value = playlist.id
  let started = false

  try {
    const firstId = playlist.previewIds?.[0]

    if (firstId) {
      try {
        const basicsRes = await typedApi.getMediaBasics({
          ids: [firstId],
        })
        const firstVideo = basicsRes.data?.items?.[0]

        if (firstVideo) {
          started = await playVideos([enrichMediaItem(firstVideo)])
        }
      } catch (e) {
        console.log('Quick play failed, loading full playlist:', e)
      }
    }

    const res = await typedApi.getSavedFilterMedia(playlist.id, {mode: 'play'})
    const videos = (res.data?.items || []).map(enrichMediaItem)
    const videoCount = Number(res.data?.count ?? videos.length) || videos.length

    if (!videos.length) {
      if (!started) {
        setNotification({
          type: 'error',
          title: t('playlists.no_videos_added'),
        })
      }
      return
    }

    if (playlist.count !== videoCount) {
      playlist.count = videoCount
      const stored = dynamicPlaylists.value.find((item) => item.id === playlist.id)
      if (stored) stored.count = videoCount
    }

    if (started) {
      if (await applyFullPlaylist(videos)) return
    }

    const played = await playVideos(videos)

    if (!played && !started) {
      setNotification({
        type: 'error',
        title: t('playlists.preparing_playback_failed'),
      })
    }
  } catch (e) {
    console.log('Error loading dynamic playlist videos:', e)
    setNotification({
      type: 'error',
      title: t('playlists.preparing_playback_failed'),
    })
  } finally {
    playingPlaylistId.value = null
  }
}

const applyDynamicSummaryMap = (
  summaries: Map<number, {count?: number; previewIds?: number[]}>,
) => {
  for (const playlist of dynamicPlaylists.value) {
    const match = summaries.get(Number(playlist.id))
    playlist.count = Number(match?.count) || 0
    playlist.previewIds = match?.previewIds || []
    playlist.countLoading = false
  }
}

const loadDynamicPlaylistSummaries = async () => {
  if (!dynamicPlaylists.value.length) {
    is_dynamic_thumbs_loaded.value = true
    return
  }

  // Prefer one aggregate request (server-cached) over per-playlist summary fan-out.
  try {
    const res = await typedApi.getDynamicPlaylists()
    applyDynamicSummaryMap(new Map(
      (res.data || []).map((item) => [Number(item.id), item]),
    ))
  } catch (aggregateError) {
    console.log('Error loading dynamic playlist summaries; falling back per id:', aggregateError)

    await Promise.all(dynamicPlaylists.value.map(async (playlist) => {
      try {
        const res = await typedApi.getSavedFilterSummary(playlist.id)
        playlist.count = Number(res.data?.count) || 0
        playlist.previewIds = res.data?.previewIds || []
      } catch (e) {
        console.log(`Error loading summary for playlist ${playlist.id}:`, e)
        playlist.count = 0
        playlist.previewIds = []
      } finally {
        playlist.countLoading = false
      }
    }))
  }

  try {
    await loadPlaylistThumbs(dynamicPlaylists.value, { mediaPath: appStore.mediaPath })
  } catch (e) {
    console.log('Error loading dynamic playlist thumbs:', e)
  } finally {
    is_dynamic_thumbs_loaded.value = true
  }
}

const loadDynamicPlaylists = async () => {
  is_dynamic_loading.value = true
  is_dynamic_thumbs_loaded.value = false

  try {
    const res = await typedApi.getDynamicPlaylistsBasic()
    dynamicPlaylists.value = (res.data || []).map(toPagePlaylistFromBasic)
  } catch (e: unknown) {
    if (getErrorStatus(e) === 404) {
      try {
        const res = await typedApi.getDynamicPlaylists()
        dynamicPlaylists.value = (res.data || []).map(toPagePlaylistFromSummary)
        is_dynamic_loading.value = false
        if (!dynamicPlaylists.value.length) {
          is_dynamic_thumbs_loaded.value = true
          return
        }
        try {
          await loadPlaylistThumbs(dynamicPlaylists.value, { mediaPath: appStore.mediaPath })
        } catch (thumbError) {
          console.log('Error loading dynamic playlist thumbs:', thumbError)
        } finally {
          is_dynamic_thumbs_loaded.value = true
        }
        return
      } catch (fallbackError) {
        console.log('Error loading dynamic playlists (fallback):', fallbackError)
      }
    }
    console.log('Error loading dynamic playlists:', e)
    dynamicPlaylists.value = []
  } finally {
    is_dynamic_loading.value = false
  }

  void loadDynamicPlaylistSummaries()
}

const getPlaylists = async () => {
  is_manual_loaded.value = false
  is_thumbs_loaded.value = false

  try {
    const res = await typedApi.getPlaylistSummary()
    playlists.value = (res.data || []).map((playlist) => ({
      ...playlist,
      name: playlist.name ?? '',
      thumbs: [],
    }))
    is_manual_loaded.value = true
    is_thumbs_loaded.value = true
    loadPlaylistThumbs(playlists.value, { mediaPath: appStore.mediaPath })
  } catch (e) {
    console.log('Error loading playlists:', e)
    playlists.value = []
    is_manual_loaded.value = true
    is_thumbs_loaded.value = true
  }
}

const loadAllPlaylists = async () => {
  await getPlaylists()
  loadDynamicPlaylists()
}

const deletePlaylist = async () => {
  dialogPlaylistEdit.value = false

  if (!playlist_edit.value?.id) return

  try {
    await typedApi.deletePlaylist(playlist_edit.value.id)
  } catch (e) {
    console.log(e)
  }

  await getPlaylists()
}

const addNewPlaylist = async () => {
  dialogPlaylistAdd.value = false
  await getPlaylists()
}

const edit = (playlist: PagePlaylist) => {
  playlist_edit.value = playlist
  dialogPlaylistEdit.value = true
}

const editDynamic = (playlist: PagePlaylist) => {
  smart_playlist_edit.value = playlist
  dialogSmartPlaylistEdit.value = true
}

const onSmartPlaylistUpdated = async () => {
  const playlistId = smart_playlist_edit.value?.id
  await loadDynamicPlaylists()
  if (playlistId) {
    const updated = dynamicPlaylists.value.find((item) => item.id === playlistId)
    if (updated) smart_playlist_edit.value = updated
  }
}

const deleteSmartPlaylist = async () => {
  dialogSmartPlaylistEdit.value = false

  if (!smart_playlist_edit.value?.id) return

  try {
    const savedFilter = smart_playlist_edit.value
    const filters = await getFilters(savedFilter.id)

    await typedApi.deleteSavedFilter(savedFilter.id)

    for (const row of filters) {
      if (row?.id) {
        await typedApi.deleteFilterRow(row.id)
      }
    }
  } catch (e) {
    console.log(e)
  }

  smart_playlist_edit.value = null
  await loadDynamicPlaylists()
}

const showSmartPlaylistsDocs = () => {
  appShell.showDocumentation('playlists.smart')
}

onMounted(() => {
  loadAllPlaylists()
})
</script>

<style lang="scss" scoped>
.playlists-grid {
  display: grid;
  gap: 20px 16px;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
}

.dynamic-playlists-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-title {
  font-weight: 600;
}

.smart-playlists-section {
  margin-bottom: 48px;
}

.smart-playlists-video-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: inherit;

  &:hover,
  &:visited,
  &:active {
    color: inherit;
  }

  &__icon {
    color: inherit;
  }
}
</style>
