<template>
  <v-card
    class="home-media-card"
    :class="{
      'home-media-card--big-preview': bigPreview,
      'home-media-card--seed': Boolean(badge),
    }"
    rounded="lg"
    variant="outlined"
    flat
    @click="handleCardClick"
  >
    <div
      class="home-media-card__preview"
      :class="{ 'no-file': !isFileExists }"
    >
      <ItemPreviewVideo
        v-if="isVideoMedia"
        :media="item"
        :is-file-exists="isFileExists"
        :thumb-url="thumb || undefined"
        preview-host="compact"
        :play-time="continuePlayTime"
        @update-big-preview="bigPreview = $event"
      />

      <template v-else>
        <v-img
          :src="displayThumb"
          cover
          class="home-media-card__thumb"
          @error="onThumbError"
        />
      </template>

      <v-chip
        v-if="badge"
        class="home-media-card__seed-badge"
        color="primary"
        size="x-small"
        variant="flat"
      >
        {{ badge }}
      </v-chip>

      <v-chip
        v-else-if="variant === 'views' && item.views"
        class="home-media-card__badge"
        color="primary"
        size="x-small"
        variant="flat"
      >
        <v-icon start size="12">mdi-eye</v-icon>
        {{ item.views }}
      </v-chip>

      <v-icon
        v-if="item.favorite && variant !== 'favorite'"
        class="home-media-card__favorite"
        color="pink"
        size="18"
      >
        mdi-heart
      </v-icon>

      <v-rating
        v-if="variant === 'favorite' && (item.rating ?? 0) > 0"
        class="home-media-card__rating"
        :model-value="item.rating"
        active-color="yellow-darken-2"
        color="grey-darken-1"
        density="compact"
        half-increments
        readonly
        size="x-small"
      />
    </div>

    <v-progress-linear
      v-if="variant === 'continue' && progress > 0"
      :model-value="progress"
      class="home-media-card__progress"
      color="primary"
      height="3"
    />

    <div
      class="home-media-card__body"
      @click="handleBodyClick"
    >
      <div class="text-caption text-truncate" :title="item.name">
        {{ item.name }}
      </div>
      <div
        v-if="metaLine"
        class="home-media-card__meta text-caption text-medium-emphasis"
        :title="metaLine.title"
      >
        <v-icon
          size="12"
          class="home-media-card__meta-icon"
        >
          {{ metaLine.icon }}
        </v-icon>
        <span class="text-truncate">{{ metaLine.text }}</span>
      </div>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/en'
import 'dayjs/locale/de'
import 'dayjs/locale/fr'
import 'dayjs/locale/ja'
import 'dayjs/locale/pt-br'
import 'dayjs/locale/es'
import 'dayjs/locale/zh-cn'
import 'dayjs/locale/ru'
import {useAppStore} from '@/stores/app'
import {useSettingsStore} from '@/stores/settings'
import {checkFileExists as checkPathExists} from '@/services/fileService'
import {findMediaTypeById, isVideoMediaType} from '@/utils/mediaType'
import {IMAGE_UNAVAILABLE_URL} from '@/utils/imageSource'
import {isThumbUnavailable} from '@/utils/thumbSource'
import ItemPreviewVideo from '@/components/items/ItemPreviewVideo.vue'
import type { HomeMediaCardVariant, HomeMediaItem } from '@/types/widgets'

const props = withDefaults(defineProps<{
  item: HomeMediaItem
  thumb?: string | null
  variant?: HomeMediaCardVariant
  /** Optional overlay badge (e.g. seed / original). */
  badge?: string | null
}>(), {
  thumb: null,
  variant: 'views',
  badge: null,
})

const emit = defineEmits<{
  click: []
}>()

const bigPreview = ref(false)
const isFileExists = ref(true)

async function verifyFileExists() {
  if (!props.item?.path) {
    isFileExists.value = false
    return
  }
  isFileExists.value = await checkPathExists(String(props.item.path))
}

onMounted(verifyFileExists)
watch(() => props.item?.path, verifyFileExists)

dayjs.extend(relativeTime)

const {t} = useI18n()
const appStore = useAppStore()
const settingsStore = useSettingsStore()

const dayjsLocale = computed(() => {
  const locale = settingsStore.locale
  if (locale === 'cn') return 'zh-cn'
  if (locale === 'pt') return 'pt-br'
  return locale || 'en'
})

const mediaType = computed(() =>
  findMediaTypeById(appStore.mediaTypes, props.item.mediaTypeId),
)

const isVideoMedia = computed(() => isVideoMediaType(mediaType.value))

const brokenThumb = ref(false)

const displayThumb = computed(() => {
  if (brokenThumb.value) return IMAGE_UNAVAILABLE_URL
  if (isThumbUnavailable(props.thumb)) return IMAGE_UNAVAILABLE_URL
  return props.thumb || IMAGE_UNAVAILABLE_URL
})

function onThumbError() {
  brokenThumb.value = true
}

watch(() => props.thumb, () => {
  brokenThumb.value = false
})

const continuePlayTime = computed(() => {
  if (props.variant !== 'continue') return undefined
  const time = Number(props.item.time || 0)
  return time > 0 ? time : undefined
})

const progress = computed(() => {
  const duration = Number(props.item.duration || 0)
  const time = Number(props.item.time || 0)
  if (!duration) return 0
  return Math.min(100, (time / duration) * 100)
})

const metaLine = computed(() => {
  dayjs.locale(dayjsLocale.value)

  const formatAdded = () => {
    if (!props.item.createdAt) return null
    const time = dayjs(props.item.createdAt).fromNow()
    return {
      icon: 'mdi-calendar-plus',
      text: time,
      title: t('home.widgets.added_ago', {time}),
    }
  }

  const hasContinueProgress = props.variant === 'continue' && Number(props.item.time || 0) > 0
  if (hasContinueProgress) {
    const percent = Math.round(progress.value)
    const percentText = t('home.widgets.continue_progress_short', {percent})
    if (props.item.viewedAt) {
      const when = dayjs(props.item.viewedAt).fromNow()
      return {
        icon: 'mdi-eye',
        text: `${percentText} · ${when}`,
        title: `${t('home.widgets.continue_progress', {percent})} · ${t('home.widgets.viewed_ago', {time: when})}`,
      }
    }
    return {
      icon: 'mdi-eye',
      text: percentText,
      title: t('home.widgets.continue_progress', {percent}),
    }
  }

  // Inbox / recent adds: date added is the useful signal.
  if (props.variant === 'inbox') {
    return formatAdded() || {
      icon: 'mdi-inbox-arrow-down',
      text: t('home.widgets.inbox'),
      title: t('home.widgets.inbox'),
    }
  }

  if (props.item.viewedAt) {
    const time = dayjs(props.item.viewedAt).fromNow()
    return {
      icon: 'mdi-eye',
      text: time,
      title: t('home.widgets.viewed_ago', {time}),
    }
  }

  // Never viewed: show when it was added instead of an empty/useless line.
  const added = formatAdded()
  if (added) return added

  return {
    icon: 'mdi-eye-off-outline',
    text: t('home.widgets.not_viewed'),
    title: t('home.widgets.not_viewed'),
  }
})

function handleCardClick() {
  if (!isVideoMedia.value) {
    emit('click')
  }
}

function handleBodyClick() {
  if (isVideoMedia.value) {
    emit('click')
  }
}
</script>

<style lang="scss" scoped>
.home-media-card {
  width: 148px;
  flex: 0 0 148px;
  align-self: stretch;
  height: auto;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  cursor: pointer;
  border-color: rgba(var(--v-theme-on-surface), 0.12) !important;
  box-shadow: none !important;
  transition: border-color 180ms ease;

  &:hover:not(.home-media-card--big-preview) {
    border-color: rgb(var(--v-theme-primary)) !important;
  }

  &--seed {
    border-color: rgba(var(--v-theme-primary), 0.55) !important;
  }

  &--big-preview {
    position: relative;
    z-index: 1010;
    overflow: visible;
  }

  &__preview {
    position: relative;
    aspect-ratio: 16 / 9;
    flex: 0 0 auto;
    overflow: hidden;
    border-radius: 0;
    background: rgba(var(--v-theme-on-surface), 0.06);

    &.no-file {
      .home-media-card__thumb,
      :deep(.v-img__img),
      :deep(.thumb .v-img__img) {
        filter: saturate(0.1) opacity(50%);
      }
    }

    :deep(.video-preview-host--compact) {
      position: absolute;
      inset: 0;
      height: 100%;
      border-radius: inherit;
    }

    :deep(.video-preview-container) {
      height: 100%;
      border-radius: inherit;
    }

    :deep(.video-preview-host__anchor) {
      border-radius: inherit;
    }

    :deep(.thumb) {
      border-radius: inherit;

      .v-img__img {
        object-fit: cover;
        border-radius: inherit;
      }
    }
  }

  &__thumb {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;

    :deep(.v-img__img) {
      object-fit: cover;
    }
  }

  &__badge {
    position: absolute;
    right: 6px;
    bottom: 6px;
    z-index: 3;
  }

  &__seed-badge {
    position: absolute;
    left: 6px;
    top: 6px;
    z-index: 3;
  }

  &__favorite {
    position: absolute;
    top: 6px;
    right: 6px;
    z-index: 3;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.45));
  }

  &__rating {
    position: absolute;
    left: 4px;
    bottom: 4px;
    z-index: 3;
  }

  &__progress {
    :deep(.v-progress-linear__background) {
      opacity: 1 !important;
      background: rgba(0, 0, 0, 0.2) !important;
    }
  }

  &__body {
    flex: 0 0 auto;
    margin-top: auto;
    min-height: 0;
    padding: 6px 8px;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  &__meta {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }

  &__meta-icon {
    flex: 0 0 auto;
    opacity: 0.75;
  }
}

.v-theme--dark .home-media-card__progress {
  :deep(.v-progress-linear__background) {
    background: rgba(255, 255, 255, 0.24) !important;
  }
}
</style>
