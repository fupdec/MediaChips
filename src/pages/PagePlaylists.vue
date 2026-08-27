<template>
  <v-container
    ref="container"
    class="playlists-layout-container"
  >
    <div
      ref="controlDeckSentinel"
      class="items-control-deck-sentinel"
      aria-hidden="true"
    />
    <div
      class="items-control-deck items-control-deck--browser playlists-control-deck"
      :class="controlDeckClass"
    >
      <div class="items-control-deck__surface items-control-deck__surface--card">
        <div
          class="items-page-header items-control-deck__header items-page-header--deck d-flex align-center justify-space-between flex-nowrap ga-2"
        >
          <button
            type="button"
            class="items-control-deck__sticky-pin"
            :class="{'items-control-deck__sticky-pin--active': stickyControlDeck}"
            :aria-pressed="stickyControlDeck ? 'true' : 'false'"
            :aria-label="stickyControlDeck
              ? t('settings_labels.appearance.sticky_control_deck_unpin')
              : t('settings_labels.appearance.sticky_control_deck_pin')"
            v-tooltip:top="stickyControlDeck
              ? t('settings_labels.appearance.sticky_control_deck_unpin')
              : t('settings_labels.appearance.sticky_control_deck_pin')"
            @click="toggleStickyControlDeck"
          >
            <span class="items-control-deck__sticky-pin-glyph" aria-hidden="true">
              <v-icon size="16" icon="mdi-pin"/>
            </span>
          </button>

          <div class="items-page-header__title min-width-0">
            <div class="items-page-header__heading min-width-0">
              <v-icon class="items-page-header__icon" start>mdi-format-list-bulleted</v-icon>
              <span class="items-page-header__name text-truncate">{{ t('navigation.playlists') }}</span>
            </div>
            <div
              v-if="playlists.length || dynamicPlaylists.length"
              class="items-page-header__badges"
            >
              <span class="items-page-header__meta">
                {{ playlists.length + dynamicPlaylists.length }}
              </span>
            </div>
          </div>

          <div class="d-flex align-center flex-nowrap ga-2 items-control-deck__controls">
            <v-btn
              color="primary"
              variant="tonal"
              size="small"
              :icon="smAndDown"
              :rounded="smAndDown ? undefined : 'xl'"
              v-tooltip:top="t('playlists.smart_playlists_docs')"
              @click="showSmartPlaylistsDocs"
            >
              <v-icon size="18" :start="!smAndDown">mdi-help-circle-outline</v-icon>
              <span v-if="!smAndDown">{{ t('playlists.smart_playlists_docs') }}</span>
            </v-btn>
            <v-btn
              color="success"
              variant="flat"
              size="small"
              :icon="smAndDown"
              :rounded="smAndDown ? undefined : 'xl'"
              v-tooltip:top="t('playlists.add_new_playlist')"
              @click="dialogPlaylistAdd = true"
            >
              <v-icon size="18" :start="!smAndDown">mdi-playlist-plus</v-icon>
              <span v-if="!smAndDown">{{ t('playlists.add_new_playlist') }}</span>
            </v-btn>
          </div>
        </div>

        <div class="items-control-deck__section playlists-control-deck__mix">
          <div
            class="playlists-control-deck__mix-label text-caption text-medium-emphasis"
            v-tooltip:top="t('playlists.mix_hint')"
          >
            <v-icon size="14" class="mr-1">mdi-playlist-music</v-icon>
            {{ t('playlists.mix_title') }}
            <v-icon
              size="14"
              class="ml-1 opacity-70"
              icon="mdi-information-outline"
              aria-hidden="true"
            />
          </div>
          <div class="d-flex align-center flex-wrap ga-2 playlists-control-deck__mix-row">
            <v-text-field
              v-model="mixPhrase"
              :placeholder="t('playlists.mix_placeholder')"
              :aria-label="t('playlists.mix_title')"
              density="compact"
              hide-details
              clearable
              rounded="xl"
              variant="outlined"
              prepend-inner-icon="mdi-magnify"
              single-line
              class="items-control-deck__field playlists-control-deck__mix-field"
              :disabled="mixBusy"
              @update:model-value="onMixPhraseInput"
              @keyup.enter="runMixPlay"
            />
            <v-btn
              color="primary"
              rounded="xl"
              variant="flat"
              size="small"
              :loading="mixBusy"
              :disabled="!mixPhrase.trim() || mixBusy"
              @click="runMixPlay"
            >
              <v-icon start size="18">mdi-play</v-icon>
              {{ t('playlists.mix_play') }}
            </v-btn>
            <v-btn
              color="primary"
              rounded="xl"
              variant="tonal"
              size="small"
              :loading="mixSaving"
              :disabled="!canSaveMix"
              @click="runMixSave"
            >
              <v-icon start size="18">mdi-content-save-outline</v-icon>
              <span v-if="!smAndDown">{{ t('playlists.mix_save') }}</span>
            </v-btn>
          </div>
          <div class="d-flex flex-wrap align-center ga-2 mt-2">
            <v-chip
              v-for="example in mixExamples"
              :key="example"
              size="small"
              variant="tonal"
              color="primary"
              class="nl-mix-example"
              :disabled="mixBusy"
              @click="applyMixExample(example)"
            >
              {{ example }}
            </v-chip>
            <template v-if="lastMix && lastMix.ids.length">
              <v-chip size="small" variant="tonal" color="secondary">
                {{ mixSourceText(lastMix.source) }}
              </v-chip>
              <span class="text-caption text-medium-emphasis">
                {{ t('playlists.mix_count', {count: lastMix.ids.length}) }}
              </span>
            </template>
          </div>
        </div>
      </div>
    </div>

    <section class="smart-playlists-section">
      <div class="playlists-section-title d-flex align-center mb-3">
        <v-icon size="20" start>mdi-filter-variant</v-icon>
        <span>{{ t('playlists.dynamic_playlists') }}</span>
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
          :selectable="itemsStore.isSelect"
          :selected="isPlaylistSelected(playlistSelectId(playlist, 'smart'))"
          :select-id="playlistSelectId(playlist, 'smart')"
          @play="playDynamic(playlist)"
          @edit="editDynamic(playlist)"
          @delete="confirmDeletePlaylist(playlist, 'smart')"
          @update:selected="(_, meta) => onPlaylistCardSelect(playlistSelectId(playlist, 'smart'), meta)"
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
          :selectable="itemsStore.isSelect"
          :selected="isPlaylistSelected(playlistSelectId(playlist, 'smart'))"
          :select-id="playlistSelectId(playlist, 'smart')"
          @play="playDynamic(playlist)"
          @edit="editDynamic(playlist)"
          @delete="confirmDeletePlaylist(playlist, 'smart')"
          @update:selected="(_, meta) => onPlaylistCardSelect(playlistSelectId(playlist, 'smart'), meta)"
        />
      </div>
    </section>

    <section class="manual-playlists-section">
      <div class="playlists-section-title d-flex align-center mb-3">
        <v-icon size="20" start>mdi-playlist-play</v-icon>
        <span>{{ t('playlists.manual_playlists') }}</span>
      </div>

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
        :selectable="itemsStore.isSelect"
        :selected="isPlaylistSelected(playlistSelectId(playlist, 'manual'))"
        :select-id="playlistSelectId(playlist, 'manual')"
        @play="play(playlist)"
        @edit="edit(playlist)"
        @delete="confirmDeletePlaylist(playlist, 'manual')"
        @update:selected="(_, meta) => onPlaylistCardSelect(playlistSelectId(playlist, 'manual'), meta)"
      />
    </div>
    </section>

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
import {ref, computed, watch, onMounted, onBeforeUnmount, nextTick} from 'vue'
import {useI18n} from 'vue-i18n'
import {useDisplay} from 'vuetify'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {usePlayerStore} from '@/stores/player'
import {useSettingsStore} from '@/stores/settings'
import {useStickyControlDeck} from '@/composable/useStickyControlDeck'
import {typedApi} from '@/services/typedApi'
import DialogPlaylistAdd from "@/components/dialogs/DialogPlaylistAdd.vue"
import DialogPlaylistEdit from "@/components/dialogs/DialogPlaylistEdit.vue"
import DialogSmartPlaylistEdit from "@/components/dialogs/DialogSmartPlaylistEdit.vue"
import PlaylistCard from "@/components/playlists/PlaylistCard.vue"
import DynamicPlaylistRow from "@/components/playlists/DynamicPlaylistRow.vue"
import {loadPlaylistThumbs} from '@/utils/playlistThumbs'
import {openSeparatePlayer, canOpenSeparatePlayer} from '@/utils/playerWindow'
import {setNotification} from '@/services/notificationService'
import {useEventBus} from '@/utils/eventBus'
import {useDialogsStore} from '@/stores/dialogs'
import {
  formatNlMixSeekTime,
  nlMixSourceMessageKey,
  playNlPlaylistMix,
  resolveNlPlaylistMix,
  saveNlPlaylistMix,
  type NlPlaylistMixResult,
} from '@/services/nlPlaylistMix'
import {useOpenMediaList} from '@/utils/openMediaList'
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
const dialogsStore = useDialogsStore()
const playerStore = usePlayerStore()
const settingsStore = useSettingsStore()
const {t} = useI18n()
const {width, smAndDown} = useDisplay()
const appShell = useAppShell()
const {openMediaList} = useOpenMediaList()

const {
  controlDeckSentinel,
  controlDeckClass,
  stickyControlDeck,
  toggleStickyControlDeck,
} = useStickyControlDeck()

const mixPhrase = ref('')
const mixBusy = ref(false)
const mixSaving = ref(false)
const lastMix = ref<NlPlaylistMixResult | null>(null)
let mixAbort: AbortController | null = null

const mixExamples = computed(() => [
  t('playlists.mix_example_unwatched'),
  t('playlists.mix_example_favorites'),
  t('playlists.mix_example_vibe'),
])

const canSaveMix = computed(() => (
  Boolean(lastMix.value?.ids.length)
  && !mixBusy.value
  && !mixSaving.value
))

const mixSourceText = (source: NlPlaylistMixResult['source']) =>
  t(`playlists.${nlMixSourceMessageKey(source)}`)

const onMixPhraseInput = () => {
  if (lastMix.value) lastMix.value = null
}

const applyMixExample = (example: string) => {
  mixPhrase.value = example
  lastMix.value = null
  void runMixPlay()
}

const runMixPlay = async () => {
  const phrase = mixPhrase.value.trim()
  if (!phrase || mixBusy.value) return

  mixAbort?.abort()
  const controller = new AbortController()
  mixAbort = controller
  mixBusy.value = true
  lastMix.value = null
  try {
    const mix = await resolveNlPlaylistMix(phrase, {
      mediaTypeId: videoMediaType.value?.id ?? getDefaultMediaTypeId(appStore.mediaTypes),
      signal: controller.signal,
    })
    if (controller.signal.aborted) return
    lastMix.value = mix

    if (!mix.videos.length) {
      setNotification({
        type: 'info',
        title: t('playlists.mix_title'),
        text: t('playlists.mix_empty'),
      })
      return
    }

    const {played, seekTime} = await playNlPlaylistMix(mix)
    if (controller.signal.aborted) return
    if (!played) {
      setNotification({
        type: 'error',
        title: t('playlists.mix_title'),
        text: t('playlists.preparing_playback_failed'),
      })
      return
    }

    setNotification({
      type: 'success',
      title: t('playlists.mix_play'),
      text: [
        mixSourceText(mix.source),
        seekTime > 0
          ? t('playlists.mix_playing_at', {count: mix.videos.length, time: formatNlMixSeekTime(seekTime)})
          : t('playlists.mix_playing', {count: mix.videos.length}),
      ].join(' · '),
      actions: [
        {
          id: 'nl-mix-show-list',
          text: t('playlists.mix_show_list'),
          icon: 'view-grid-outline',
          action: () => {
            void openMediaList({
              mediaTypeId: videoMediaType.value?.id ?? undefined,
              ids: mix.ids,
              filters: mix.filters.length ? mix.filters : undefined,
              scope: {
                kind: 'semantic',
                label: mix.phrase,
              },
            })
          },
          hide: true,
        },
        {
          id: 'nl-mix-save',
          text: t('playlists.mix_save'),
          icon: 'content-save-outline',
          action: () => {
            void runMixSave()
          },
          hide: true,
        },
      ],
    })
  } catch (error) {
    if (controller.signal.aborted) return
    console.error('NL mix failed:', error)
    setNotification({
      type: 'error',
      title: t('playlists.mix_title'),
      text: error instanceof Error ? error.message : String(error),
    })
  } finally {
    if (mixAbort === controller) mixAbort = null
    mixBusy.value = false
  }
}

const runMixSave = async () => {
  if (!lastMix.value?.ids.length || mixSaving.value) return
  mixSaving.value = true
  try {
    const saved = await saveNlPlaylistMix(lastMix.value, mixPhrase.value.trim() || lastMix.value.phrase)
    setNotification({
      type: 'success',
      title: t('playlists.mix_save'),
      text: saved.kind === 'smart'
        ? t('playlists.mix_saved_smart', {name: saved.name})
        : t('playlists.mix_saved_static', {name: saved.name}),
    })
    if (saved.kind === 'smart') {
      await loadDynamicPlaylists()
    } else {
      await getPlaylists()
    }
  } catch (error) {
    console.error('NL mix save failed:', error)
    setNotification({
      type: 'error',
      title: t('playlists.mix_save'),
      text: error instanceof Error ? error.message : String(error),
    })
  } finally {
    mixSaving.value = false
  }
}

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
const eventBus = useEventBus()

/** Smart playlists use negative ids so they never collide with manual playlist ids. */
function playlistSelectId(playlist: PagePlaylist, kind: 'manual' | 'smart') {
  const id = Number(playlist.id)
  if (!Number.isFinite(id) || id <= 0) return 0
  return kind === 'smart' ? -id : id
}

function syncPlaylistsItemsStore() {
  const entities = [
    ...dynamicPlaylists.value
      .map((playlist) => ({
        id: playlistSelectId(playlist, 'smart'),
        name: playlist.name || '',
      }))
      .filter((item) => item.id !== 0),
    ...playlists.value
      .map((playlist) => ({
        id: playlistSelectId(playlist, 'manual'),
        name: playlist.name || '',
      }))
      .filter((item) => item.id !== 0),
  ]
  itemsStore.type = 'playlist'
  itemsStore.entities = entities as typeof itemsStore.entities
  itemsStore.itemsOnPage = entities as typeof itemsStore.itemsOnPage
  itemsStore.totalFiltered = entities.length
}

function isPlaylistSelected(id: number) {
  return itemsStore.isSelect && itemsStore.selection.includes(id)
}

function onPlaylistCardSelect(id: number, meta?: {shiftKey?: boolean}) {
  if (!id) return
  itemsStore.toggleSelect(
    meta?.shiftKey ? ({shiftKey: true} as MouseEvent) : null,
    {id},
  )
}

watch(
  [playlists, dynamicPlaylists],
  () => {
    if (itemsStore.type === 'playlist') syncPlaylistsItemsStore()
  },
  {deep: true},
)

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
  if (playingPlaylistId.value) return

  playingPlaylistId.value = `manual-${playlist.id}`
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

    const res = await typedApi.getMediaInPlaylist(playlist.id)
    const videos = (res.data || [])
      .map((link) => (link.media || link.medium) as MediaItem | undefined)
      .filter((item): item is MediaItem => Boolean(item?.id || item?.path))
      .map(enrichMediaItem)

    const videoCount = videos.length
    if (playlist.count !== videoCount) {
      playlist.count = videoCount
    }

    if (!videos.length) {
      if (!started) {
        setNotification({
          type: 'error',
          title: t('playlists.no_videos_added'),
        })
      }
      return
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
    console.log('Error loading playlist videos:', e)
    setNotification({
      type: 'error',
      title: t('playlists.preparing_playback_failed'),
    })
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
      (res.data || []).map((item) => [Number(item.id), {
        count: item.count == null ? undefined : Number(item.count),
        previewIds: item.previewIds,
      }]),
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

function confirmDeletePlaylist(playlist: PagePlaylist, kind: 'manual' | 'smart') {
  const selectId = playlistSelectId(playlist, kind)
  if (!selectId) return
  dialogsStore.confirm.checkBox = false
  dialogsStore.confirm.checkBox2 = false
  dialogsStore.confirm.checkBox2RequiresPrimary = false
  dialogsStore.confirm.checkBoxText = t('actions.delete_permanently')
  dialogsStore.confirm.checkBox2Text = ''
  dialogsStore.confirm.text = kind === 'smart'
    ? t('playlists.delete_smart_playlist_confirm')
    : t('playlists.delete_confirm')
  dialogsStore.confirm.action = async () => {
    const permanent = Boolean(dialogsStore.confirm.checkBox)
    try {
      if (kind === 'smart') {
        await typedApi.deleteSavedFilter(playlist.id, {permanent})
        await loadDynamicPlaylists()
      } else {
        await typedApi.deletePlaylist(playlist.id, {permanent})
        await getPlaylists()
      }
      itemsStore.selection = itemsStore.selection.filter((id) => Number(id) !== selectId)
      setNotification({
        type: 'success',
        title: t('playlists.delete_selected_done', {count: 1}),
      })
    } catch (error) {
      console.warn('Failed deleting playlist', playlist.id, error)
      setNotification({
        type: 'warning',
        title: t('playlists.delete_selected_failed'),
      })
    }
  }
  dialogsStore.confirm.show = true
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
    await typedApi.deleteSavedFilter(savedFilter.id)
  } catch (e) {
    console.log(e)
  }

  smart_playlist_edit.value = null
  await loadDynamicPlaylists()
}

const showSmartPlaylistsDocs = () => {
  appShell.showDocumentation('playlists.smart')
}

async function onPlaylistsReload() {
  await loadAllPlaylists()
  syncPlaylistsItemsStore()
}

onMounted(async () => {
  syncPlaylistsItemsStore()
  eventBus.on('playlists:reload', onPlaylistsReload)
  await nextTick()
  await loadAllPlaylists()
  syncPlaylistsItemsStore()
})

onBeforeUnmount(() => {
  eventBus.off('playlists:reload', onPlaylistsReload)
  if (itemsStore.type === 'playlist') {
    itemsStore.clearSelection()
    itemsStore.type = ''
    itemsStore.entities = []
    itemsStore.itemsOnPage = []
    itemsStore.totalFiltered = 0
  }
})
</script>

<style lang="scss" scoped>
.playlists-layout-container.v-container {
  padding-top: 8px;
}

.playlists-control-deck {
  &__mix {
    padding: 10px var(--deck-pad-x, 14px) 12px;
  }

  &__mix-label {
    display: inline-flex;
    align-items: center;
    margin-bottom: 8px;
    line-height: 1.35;
    cursor: help;
  }

  &__mix-row {
    min-width: 0;
  }

  &__mix-field {
    flex: 1 1 280px;
    min-width: 180px;
    max-width: 560px;
    margin-inline: 0 !important;

    :deep(.v-field) {
      --v-input-control-height: var(--deck-control-h, 40px);
      height: var(--deck-control-h, 40px) !important;
      min-height: var(--deck-control-h, 40px) !important;
      font-size: 0.75rem;
    }

    :deep(.v-field__input) {
      min-height: var(--deck-control-h, 40px) !important;
      max-height: var(--deck-control-h, 40px) !important;
      padding-top: 0 !important;
      padding-bottom: 0 !important;
      font-size: 0.75rem !important;
      line-height: 1.2 !important;
      align-items: center;
    }

    :deep(.v-field__prepend-inner),
    :deep(.v-field__clearable) {
      padding-top: 0 !important;
      align-self: center;
    }
  }
}

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

.playlists-section-title {
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.3;
}

.smart-playlists-section {
  margin-bottom: 32px;
}

.manual-playlists-section {
  margin-bottom: 24px;
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

.nl-mix-example {
  cursor: pointer;
}
</style>
