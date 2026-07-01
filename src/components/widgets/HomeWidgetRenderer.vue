<template>
  <WidgetLazyMount
    v-if="widgetId === 'stats'"
    class="mt-2 mb-4"
    min-height="88px"
  >
    <WidgetTotalStats class="mb-0"/>
  </WidgetLazyMount>

  <WidgetLazyMount
    v-else-if="widgetId === 'extendedStats'"
    min-height="120px"
  >
    <WidgetExtendedStats/>
  </WidgetLazyMount>

  <WidgetLazyMount
    v-else-if="widgetId === 'quickActions'"
    min-height="96px"
  >
    <WidgetQuickActions/>
  </WidgetLazyMount>

  <WidgetLazyMount
    v-else-if="widgetId === 'continue'"
    min-height="180px"
    @activate="ensureHomeMediaLoaded"
  >
    <WidgetMediaRow
      :title="t('home.widgets.continue_watching')"
      icon="mdi-history"
      :items="continueWatching"
      variant="continue"
      @open="onOpenContinue"
      @view-all="onOpenContinueList"
    />
  </WidgetLazyMount>

  <WidgetLazyMount
    v-else-if="widgetId === 'favorites'"
    min-height="180px"
    @activate="ensureHomeMediaLoaded"
  >
    <WidgetMediaRow
      :title="t('home.widgets.favorites')"
      icon="mdi-heart"
      :items="favorites"
      variant="favorite"
      @open="onOpenMedia"
      @view-all="onOpenFavoritesList"
    />
  </WidgetLazyMount>

  <WidgetLazyMount
    v-else-if="widgetId === 'topViews'"
    min-height="180px"
    @activate="ensureHomeMediaLoaded"
  >
    <WidgetMediaRow
      :title="t('home.widgets.top_views')"
      icon="mdi-eye"
      :items="topViews"
      variant="views"
      @open="onOpenMedia"
      @view-all="onOpenTopViewsList"
    />
  </WidgetLazyMount>

  <WidgetLazyMount
    v-else-if="widgetId === 'markers'"
    min-height="180px"
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
    min-height="180px"
  >
    <WidgetTopTags :limit="limits?.topTags ?? 10"/>
  </WidgetLazyMount>
</template>

<script setup lang="ts">
import {defineAsyncComponent} from 'vue'
import {useI18n} from 'vue-i18n'
import WidgetLazyMount from '@/components/widgets/WidgetLazyMount.vue'
import { useHomeMedia } from '@/composable/useHomeMedia'
import type { HomeWidgetLimits } from '@/types/widgets'
import type { MediaItem } from '@/types/stores'

const WidgetTopTags = defineAsyncComponent(() => import('@/components/widgets/WidgetTopTags.vue'))
const WidgetTotalStats = defineAsyncComponent(() => import('@/components/widgets/WidgetTotalStats.vue'))
const WidgetExtendedStats = defineAsyncComponent(() => import('@/components/widgets/WidgetExtendedStats.vue'))
const WidgetQuickActions = defineAsyncComponent(() => import('@/components/widgets/WidgetQuickActions.vue'))
const WidgetMediaRow = defineAsyncComponent(() => import('@/components/widgets/WidgetMediaRow.vue'))
const WidgetRandomMarkers = defineAsyncComponent(() => import('@/components/widgets/WidgetRandomMarkers.vue'))
const WidgetHealthAlerts = defineAsyncComponent(() => import('@/components/widgets/WidgetHealthAlerts.vue'))

const props = defineProps<{
  widgetId: string
  limits?: HomeWidgetLimits
  mediaWidgetsEnabled: {
    continue: boolean
    favorites: boolean
    topViews: boolean
  }
  onOpenMedia: (item: MediaItem) => void | Promise<void>
  onOpenContinue: (item: MediaItem) => void | Promise<void>
  onOpenContinueList: () => void
  onOpenFavoritesList: () => void
  onOpenTopViewsList: () => void
}>()

const {t} = useI18n()
const { continueWatching, favorites, topViews, loadHomeMedia } = useHomeMedia()

function ensureHomeMediaLoaded() {
  void loadHomeMedia({
    limits: props.limits ?? {},
    loadContinue: props.mediaWidgetsEnabled.continue,
    loadFavorites: props.mediaWidgetsEnabled.favorites,
    loadTopViews: props.mediaWidgetsEnabled.topViews,
  })
}
</script>
