<template>
  <draggable
    v-model="widgets"
    @end="saveConfig"
    item-key="id"
    handle=".home-widget-drag"
    class="d-flex flex-column ga-2"
  >
    <template #item="{ element: widget }">
      <v-card rounded="lg" variant="outlined" class="pa-3">
        <div class="d-flex align-center ga-2">
          <v-btn
            class="home-widget-drag"
            icon
            size="small"
            variant="text"
            :title="t('settings_labels.appearance.drag_to_change_order')"
          >
            <v-icon>mdi-drag</v-icon>
          </v-btn>

          <v-checkbox
            v-model="widget.enabled"
            @update:model-value="saveConfig"
            color="primary"
            hide-details
            density="compact"
          />

          <v-icon :icon="widget.icon" size="20" class="mr-1"/>

          <div class="flex-grow-1 text-body-2">
            {{ widget.title }}
          </div>

          <v-text-field
            v-if="widget.hasLimit"
            v-model.number="widget.limit"
            @change="saveConfig"
            type="number"
            min="4"
            max="24"
            density="compact"
            hide-details
            variant="outlined"
            rounded="lg"
            style="max-width: 88px"
            :label="t('settings_labels.general.home_widgets_limit')"
          />
        </div>
      </v-card>
    </template>
  </draggable>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import draggable from 'vuedraggable'
import {useSettingsStore} from '@/stores/settings'
import {
  HOME_WIDGETS_WITH_LIMIT,
  parseHomeWidgetsConfig,
  serializeHomeWidgetsConfig,
  type HomeWidgetId,
  type HomeWidgetsConfig,
  type HomeWidgetWithLimit,
} from '@/utils/homeWidgets'
import {setOption} from '@/services/settingsService'
import type { HomeWidgetEditorItem } from '@/types/widgets'

const {t} = useI18n()
const settingsStore = useSettingsStore()

const widgetMeta = computed(() => ({
  stats: {
    title: t('settings_labels.general.home_widget_stats'),
    icon: 'mdi-chart-bar',
  },
  extendedStats: {
    title: t('settings_labels.general.home_widget_extended_stats'),
    icon: 'mdi-chart-box-outline',
  },
  chartStats: {
    title: t('settings_labels.general.home_widget_chart_stats'),
    icon: 'mdi-chart-line',
  },
  createdCalendar: {
    title: t('settings_labels.general.home_widget_created_calendar'),
    icon: 'mdi-calendar-star',
  },
  quickActions: {
    title: t('settings_labels.general.home_widget_quick_actions'),
    icon: 'mdi-flash',
  },
  inbox: {
    title: t('home.widgets.inbox'),
    icon: 'mdi-inbox-arrow-down',
  },
  continue: {
    title: t('home.widgets.continue_watching'),
    icon: 'mdi-history',
  },
  similar: {
    title: t('home.widgets.similar'),
    icon: 'mdi-creation-outline',
  },
  favorites: {
    title: t('home.widgets.favorites'),
    icon: 'mdi-heart',
  },
  topViews: {
    title: t('home.widgets.top_views'),
    icon: 'mdi-eye',
  },
  markers: {
    title: t('home.widgets.random_markers'),
    icon: 'mdi-tooltip-outline',
  },
  health: {
    title: t('home.widgets.health_title'),
    icon: 'mdi-heart-pulse',
  },
  topTags: {
    title: t('settings_labels.general.home_widget_top_tags'),
    icon: 'mdi-tag-multiple',
  },
}))

const widgets = ref<HomeWidgetEditorItem[]>([])

function buildWidgetsList(config: HomeWidgetsConfig): HomeWidgetEditorItem[] {
  return config.order.map((id) => ({
    id,
    title: widgetMeta.value[id]?.title || id,
    icon: widgetMeta.value[id]?.icon || 'mdi-widgets',
    enabled: config.enabled[id] !== false,
    hasLimit: (HOME_WIDGETS_WITH_LIMIT as readonly HomeWidgetId[]).includes(id),
    limit: config.limits[id as HomeWidgetWithLimit],
  }))
}

function syncFromSettings() {
  widgets.value = buildWidgetsList(parseHomeWidgetsConfig(settingsStore.home_widgets_config))
}

watch(
  () => settingsStore.home_widgets_config,
  () => syncFromSettings(),
  {immediate: true},
)

watch(
  () => widgetMeta.value,
  () => syncFromSettings(),
  {deep: true},
)

async function saveConfig() {
  const current = parseHomeWidgetsConfig(settingsStore.home_widgets_config)
  const enabled: Partial<HomeWidgetsConfig['enabled']> = {}
  const limits: Partial<HomeWidgetsConfig['limits']> = {}

  for (const widget of widgets.value) {
    enabled[widget.id] = widget.enabled
    if (widget.hasLimit && widget.limit != null) {
      limits[widget.id as HomeWidgetWithLimit] = widget.limit
    }
  }

  const serialized = serializeHomeWidgetsConfig({
    order: widgets.value.map((widget) => widget.id),
    enabled,
    limits,
    collapsed: current.collapsed,
  } as Partial<HomeWidgetsConfig>)
  settingsStore.home_widgets_config = serialized
  await setOption(serialized, 'home_widgets_config')
}
</script>
