<template>
  <v-theme-provider theme="dark">
    <aside
      v-if="player.marksVisible"
      class="player-sidebar player-sidebar--marks"
    >
      <div class="player-sidebar__header">
        <v-icon size="small" class="player-sidebar__header-icon">mdi-tooltip</v-icon>
        <div class="player-sidebar__header-text">
          <span class="player-sidebar__title">{{ t('player.marks_list') }}</span>
          <span class="player-sidebar__subtitle">{{ t('player.marks_count', {count: marks.length}) }}</span>
        </div>
        <v-spacer/>
        <v-btn
          v-tooltip:bottom="t('player.controls.add_mark')"
          :title="t('player.controls.add_mark')"
          variant="text"
          icon
          size="small"
          density="comfortable"
          @click="session?.openAddingMark()"
        >
          <v-icon size="small">mdi-plus</v-icon>
        </v-btn>
        <v-btn
          v-tooltip:bottom="t('player.generate_chapters')"
          :title="t('player.generate_chapters')"
          :loading="generatingChapters"
          :disabled="generatingChapters || !player.media?.id"
          variant="text"
          icon
          size="small"
          density="comfortable"
          @click="generateChapters"
        >
          <v-icon size="small">mdi-movie-open-outline</v-icon>
        </v-btn>
        <v-btn
          v-tooltip:bottom="t(clipMode ? 'player.clip_mode_on' : 'player.clip_mode')"
          :title="t(clipMode ? 'player.clip_mode_on' : 'player.clip_mode')"
          :color="clipMode ? 'primary' : undefined"
          variant="text"
          icon
          size="small"
          density="comfortable"
          @click="toggleClipMode"
        >
          <v-icon size="small">mdi-content-cut</v-icon>
        </v-btn>
        <v-btn
          @click="player.marksVisible = false"
          variant="text"
          icon
          size="small"
          density="comfortable"
        >
          <v-icon size="small">mdi-close</v-icon>
        </v-btn>
      </div>

      <div v-if="!clipMode" class="player-sidebar__filters">
        <PlayerMarksFilters
          v-model="marksType"
          :assigned="assigned as any"
          :has-favorite="hasFavoriteMarks"
          :has-bookmark="hasBookmarkMarks"
          :has-chapter="hasChapterMarks"
        />
      </div>

      <div class="player-sidebar__body">
        <template v-if="clipMode">
          <template v-if="clipModeMarks.length > 0">
            <PlayerMarkListItem
              v-for="mark in clipModeMarks"
              :key="mark.id"
              :mark="mark"
              :is-thumbs-loaded="is_thumbs_loaded"
              :get-icon="getIcon"
              :get-color="getColor"
              :get-duration="getDuration"
              :jump-to="jumpTo"
              :edit="edit"
              :remove="remove"
              selectable
              :selected="selectedClipMarkIds.includes(Number(mark.id))"
              @toggle-select="toggleClipSelection"
            />
          </template>

          <div v-else class="player-sidebar__empty">
            <img
              src="/images/filters/filters-no-results-marks.svg"
              alt=""
              class="player-sidebar__empty-img"
            />
            <span>{{ t('player.clip_mode_empty') }}</span>
          </div>
        </template>

        <template v-else>
          <template v-if="marks.length > 0">
            <PlayerMarkListItem
              v-for="mark in marks"
              :key="mark.id"
              :mark="mark"
              :is-thumbs-loaded="is_thumbs_loaded"
              :get-icon="getIcon"
              :get-color="getColor"
              :get-duration="getDuration"
              :jump-to="(time: number) => onMarkActivate(mark, time)"
              :edit="edit"
              :remove="remove"
              :selected="player.studioMode && player.selectedMarkId === mark.id"
            />
          </template>

          <div v-else-if="player.marks.length == 0" class="player-sidebar__empty">
            <img
              src="/images/no-marks.svg"
              alt=""
              class="player-sidebar__empty-img"
            />
            <span>{{ t('player.no_marks') }}</span>
            <v-btn
              class="mt-3"
              color="primary"
              rounded
              size="small"
              variant="tonal"
              :loading="generatingChapters"
              :disabled="generatingChapters || !player.media?.id"
              prepend-icon="mdi-movie-open-outline"
              @click="generateChapters"
            >
              {{ t('player.generate_chapters') }}
            </v-btn>
          </div>

          <div v-else class="player-sidebar__empty">
            <img
              src="/images/filters/filters-no-results-marks.svg"
              alt=""
              class="player-sidebar__empty-img"
            />
            <span>{{ t('player.no_marks_selected_types') }}</span>
          </div>
        </template>
      </div>

      <div v-if="clipMode && selectedClipMarkIds.length > 0" class="player-sidebar__clip-bar">
        <v-btn
          v-tooltip:top="t('player.clip_mode_on')"
          :title="t('player.clip_mode_on')"
          variant="text"
          icon
          size="small"
          density="comfortable"
          @click="toggleClipMode"
        >
          <v-icon size="small">mdi-close</v-icon>
        </v-btn>
        <span class="player-sidebar__clip-bar-count">
          {{ t('player.clip_mode_selected', {count: selectedClipMarkIds.length}) }}
        </span>
        <v-btn
          color="primary"
          rounded
          size="small"
          variant="tonal"
          :loading="exportingClips"
          prepend-icon="mdi-export"
          @click="exportClips"
        >
          {{ t('markers.export_selected_clips', {count: selectedClipMarkIds.length}) }}
        </v-btn>
      </div>
    </aside>
  </v-theme-provider>
</template>

<script setup lang="ts">
import {ref, computed, inject, watch, nextTick} from 'vue'
import {useI18n} from 'vue-i18n'
import {usePlayerMarks} from '@/composable/usePlayerMarks'
import {typedApi} from '@/services/typedApi'
import {usePlayerStore} from '@/stores/player'
import {setNotification} from '@/services/notificationService'
import {runMarkClipsExport} from '@/services/exportMarkClipsUi'
import PlayerMarksFilters from '@/components/app/player/PlayerMarksFilters.vue'
import PlayerMarkListItem from '@/components/app/player/PlayerMarkListItem.vue'
import type {PlayerMark} from '@/types/player'
import {MARK_FILTER_CHAPTER} from '@/utils/markAdding'
import {PLAYER_SESSION_KEY} from '@/composable/usePlayerSession'

const emit = defineEmits<{
  removeMark: [mark: PlayerMark]
  editMark: [mark: PlayerMark]
}>()
const {t} = useI18n()
const playerStore = usePlayerStore()
const session = inject(PLAYER_SESSION_KEY, null)
const generatingChapters = ref(false)
const clipMode = ref(false)
const selectedClipMarkIds = ref<number[]>([])
const exportingClips = ref(false)

const {
  player,
  marksType,
  is_thumbs_loaded,
  assigned,
  hasFavoriteMarks,
  hasBookmarkMarks,
  hasChapterMarks,
  marks,
  getThumbs,
  getIcon,
  getColor,
  getDuration,
  jumpTo,
  edit,
  remove,
} = usePlayerMarks({emit})

const clipModeMarks = computed(() => player.value.marks.filter((mark) => mark.end != null))

const onMarkActivate = (mark: PlayerMark, time: number) => {
  if (playerStore.studioMode && mark.id != null) {
    playerStore.selectedMarkId = mark.id
    edit(mark)
  }
  jumpTo(time)
}

watch(() => playerStore.selectedMarkId, async (id) => {
  if (!id || !playerStore.studioMode) return
  await nextTick()
  document.querySelector('.player-sidebar--marks .mark-item--selected')
    ?.scrollIntoView({ block: 'nearest' })
})

const toggleClipMode = () => {
  clipMode.value = !clipMode.value
  selectedClipMarkIds.value = []
}

const toggleClipSelection = (mark: PlayerMark) => {
  if (mark.id == null) return
  const id = Number(mark.id)
  const index = selectedClipMarkIds.value.indexOf(id)
  if (index === -1) {
    selectedClipMarkIds.value = [...selectedClipMarkIds.value, id]
  } else {
    selectedClipMarkIds.value = selectedClipMarkIds.value.filter((markId) => markId !== id)
  }
}

const exportClips = async () => {
  if (!selectedClipMarkIds.value.length || exportingClips.value) return

  exportingClips.value = true
  try {
    const done = await runMarkClipsExport({
      scope: {markIds: [...selectedClipMarkIds.value]},
      sort: 'selection',
      mode: 'concat',
      t,
    })
    if (done) {
      clipMode.value = false
      selectedClipMarkIds.value = []
    }
  } finally {
    exportingClips.value = false
  }
}

async function generateChapters() {
  const mediaId = Number(playerStore.media?.id)
  if (!Number.isFinite(mediaId) || mediaId <= 0 || generatingChapters.value) return

  generatingChapters.value = true
  try {
    const result = await typedApi.generateAutoChapters({
      mediaId,
      force: true,
      useSilence: true,
      useLlmTitles: true,
    })
    const chapters = Number((result.data as {chapters?: number} | undefined)?.chapters) || 0
    const res = await typedApi.getMarksForVideo(mediaId)
    playerStore.marks = Array.isArray(res.data) ? res.data : []
    if (!marksType.value.includes(MARK_FILTER_CHAPTER)) {
      marksType.value = [...marksType.value, MARK_FILTER_CHAPTER]
    }
    setNotification({
      type: chapters >= 2 ? 'success' : 'info',
      title: t('player.generate_chapters'),
      text: chapters >= 2
        ? t('player.generate_chapters_done', {count: chapters})
        : t('player.generate_chapters_none'),
      icon: 'movie-open-outline',
    })
  } catch (error) {
    setNotification({
      type: 'error',
      title: t('player.generate_chapters'),
      text: error instanceof Error ? error.message : String(error),
    })
  } finally {
    generatingChapters.value = false
  }
}

defineExpose({getThumbs})
</script>
