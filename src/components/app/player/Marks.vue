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
          @click="player.marksVisible = false"
          variant="text"
          icon
          size="small"
          density="comfortable"
        >
          <v-icon size="small">mdi-close</v-icon>
        </v-btn>
      </div>

      <div class="player-sidebar__filters">
        <PlayerMarksFilters
          v-model="marksType"
          :assigned="assigned"
        />
      </div>

      <div class="player-sidebar__body">
        <template v-if="marks.length > 0">
          <PlayerMarkListItem
            v-for="mark in marks"
            :key="mark.id"
            :mark="mark"
            :is-thumbs-loaded="is_thumbs_loaded"
            :get-icon="getIcon"
            :get-color="getColor"
            :get-duration="getDuration"
            :jump-to="jumpTo"
            :edit="edit"
            :remove="remove"
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
      </div>
    </aside>
  </v-theme-provider>
</template>

<script setup lang="ts">
import {ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {usePlayerMarks} from '@/composable/usePlayerMarks'
import {typedApi} from '@/services/typedApi'
import {usePlayerStore} from '@/stores/player'
import {setNotification} from '@/services/notificationService'
import PlayerMarksFilters from '@/components/app/player/PlayerMarksFilters.vue'
import PlayerMarkListItem from '@/components/app/player/PlayerMarkListItem.vue'
import type {PlayerMark} from '@/types/player'
import {MARK_FILTER_CHAPTER} from '@/utils/markAdding'

const emit = defineEmits<{
  removeMark: [mark: PlayerMark]
  editMark: [mark: PlayerMark]
}>()
const {t} = useI18n()
const playerStore = usePlayerStore()
const generatingChapters = ref(false)

const {
  player,
  marksType,
  is_thumbs_loaded,
  assigned,
  marks,
  getThumbs,
  getIcon,
  getColor,
  getDuration,
  jumpTo,
  edit,
  remove,
} = usePlayerMarks({emit})

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
    const chapters = Number(result.data?.chapters) || 0
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
