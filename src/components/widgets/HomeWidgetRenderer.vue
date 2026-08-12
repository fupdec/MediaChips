<template>
  <WidgetLazyMount
    v-if="widgetId === 'stats'"
    class="mt-2 mb-4"
    min-height="96px"
  >
    <WidgetTotalStats class="mb-0"/>
  </WidgetLazyMount>

  <WidgetLazyMount
    v-else-if="widgetId === 'extendedStats'"
    min-height="200px"
  >
    <WidgetExtendedStats/>
  </WidgetLazyMount>

  <WidgetLazyMount
    v-else-if="widgetId === 'chartStats'"
    min-height="280px"
  >
    <WidgetChartStats/>
  </WidgetLazyMount>

  <WidgetLazyMount
    v-else-if="widgetId === 'createdCalendar'"
    min-height="320px"
  >
    <WidgetCreatedCalendar/>
  </WidgetLazyMount>

  <WidgetLazyMount
    v-else-if="widgetId === 'quickActions'"
    min-height="120px"
  >
    <WidgetQuickActions/>
  </WidgetLazyMount>

  <WidgetLazyMount
    v-else-if="widgetId === 'inbox'"
    min-height="220px"
    @activate="ensureHomeMediaLoaded"
  >
    <WidgetMediaRow
      :title="t('home.widgets.inbox')"
      icon="mdi-inbox-arrow-down"
      :items="inbox"
      :loading="homeMediaLoading"
      variant="inbox"
      @open="onOpenMedia"
      @view-all="onOpenInboxList"
    />
  </WidgetLazyMount>

  <WidgetLazyMount
    v-else-if="widgetId === 'continue'"
    min-height="220px"
    @activate="ensureHomeMediaLoaded"
  >
    <WidgetMediaRow
      :title="t('home.widgets.continue_watching')"
      icon="mdi-history"
      :items="continueWatching"
      :loading="homeMediaLoading"
      variant="continue"
      @open="onOpenContinue"
      @view-all="onOpenContinueList"
    />
  </WidgetLazyMount>

  <WidgetLazyMount
    v-else-if="widgetId === 'similar'"
    min-height="220px"
  >
    <WidgetHomeSimilar :limit="limits?.similar ?? 12"/>
  </WidgetLazyMount>

  <WidgetLazyMount
    v-else-if="widgetId === 'favorites'"
    min-height="220px"
    @activate="ensureHomeMediaLoaded"
  >
    <WidgetMediaRow
      :title="t('home.widgets.favorites')"
      icon="mdi-heart"
      :items="favorites"
      :loading="homeMediaLoading"
      :show-shuffle="true"
      :shuffle-loading="favoritesLoading"
      variant="favorite"
      @open="onOpenMedia"
      @view-all="onOpenFavoritesList"
      @shuffle="onReshuffleFavorites"
    />
  </WidgetLazyMount>

  <WidgetLazyMount
    v-else-if="widgetId === 'topViews'"
    min-height="220px"
    @activate="ensureHomeMediaLoaded"
  >
    <WidgetMediaRow
      :title="t('home.widgets.top_views')"
      icon="mdi-eye"
      :items="topViews"
      :loading="homeMediaLoading"
      variant="views"
      @open="onOpenMedia"
      @view-all="onOpenTopViewsList"
    />
  </WidgetLazyMount>

  <WidgetLazyMount
    v-else-if="widgetId === 'markers'"
    min-height="220px"
  >
    <WidgetRandomMarkers :limit="limits?.markers ?? 8"/>
  </WidgetLazyMount>

  <WidgetLazyMount
    v-else-if="widgetId === 'health'"
    min-height="120px"
  >
    <WidgetHealthAlerts/>
  </WidgetLazyMount>

  <WidgetLazyMount
    v-else-if="widgetId === 'topTags'"
  >
    <WidgetTopTags :limit="limits?.topTags ?? 10"/>
  </WidgetLazyMount>
</template>

<script setup lang="ts">
import {defineAsyncComponent} from 'vue'
import {useI18n} from 'vue-i18n'
import WidgetLazyMount from '@/components/widgets/WidgetLazyMount.vue'
// Above-the-fold widgets: sync import avoids async 0-height flash / CLS.
import WidgetTotalStats from '@/components/widgets/WidgetTotalStats.vue'
import WidgetExtendedStats from '@/components/widgets/WidgetExtendedStats.vue'
import WidgetChartStats from '@/components/widgets/WidgetChartStats.vue'
import WidgetCreatedCalendar from '@/components/widgets/WidgetCreatedCalendar.vue'
import WidgetQuickActions from '@/components/widgets/WidgetQuickActions.vue'
import WidgetMediaRow from '@/components/widgets/WidgetMediaRow.vue'
import {useHomeMedia} from '@/composable/useHomeMedia'
import type {HomeWidgetLimits} from '@/types/widgets'
import type {MediaItem} from '@/types/stores'

const WidgetTopTags = defineAsyncComponent(() => import('@/components/widgets/WidgetTopTags.vue'))
const WidgetRandomMarkers = defineAsyncComponent(() => import('@/components/widgets/WidgetRandomMarkers.vue'))
const WidgetHealthAlerts = defineAsyncComponent(() => import('@/components/widgets/WidgetHealthAlerts.vue'))
const WidgetHomeSimilar = defineAsyncComponent(() => import('@/components/widgets/WidgetHomeSimilar.vue'))

const props = defineProps<{
  widgetId: string
  limits?: HomeWidgetLimits
  mediaWidgetsEnabled: {
    inbox: boolean
    continue: boolean
    favorites: boolean
    topViews: boolean
  }
  onOpenMedia: (item: MediaItem) => void | Promise<void>
  onOpenContinue: (item: MediaItem) => void | Promise<void>
  onOpenContinueList: () => void
  onOpenFavoritesList: () => void
  onOpenTopViewsList: () => void
  onOpenInboxList: () => void
}>()

const {t} = useI18n()
const {
  continueWatching,
  favorites,
  topViews,
  inbox,
  loadHomeMedia,
  reshuffleFavorites,
  isLoading: homeMediaLoading,
  favoritesLoading,
} = useHomeMedia()

function ensureHomeMediaLoaded() {
  void loadHomeMedia({
    limits: props.limits ?? {},
    loadContinue: props.mediaWidgetsEnabled.continue,
    loadFavorites: props.mediaWidgetsEnabled.favorites,
    loadTopViews: props.mediaWidgetsEnabled.topViews,
    loadInbox: props.mediaWidgetsEnabled.inbox,
  })
}

function onReshuffleFavorites() {
  void reshuffleFavorites(props.limits?.favorites ?? 12)
}
</script>
