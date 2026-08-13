<template>
  <v-card class="rounded-lg widget-chart-stats mb-8" color="primary" variant="tonal">
    <v-card-text class="pa-3">
      <div class="widget-chart-stats__toolbar mb-3">
        <div class="d-flex align-center text-body-1 font-weight-medium widget-chart-stats__title">
          <v-icon class="mr-2" size="20">mdi-chart-line</v-icon>
          {{ t('home.widgets.chart_stats_title') }}
        </div>

        <div class="widget-chart-stats__controls">
          <v-btn-toggle
            v-model="scope"
            density="compact"
            color="primary"
            variant="outlined"
            divided
            mandatory
          >
            <v-btn value="media" size="small">
              {{ t('home.widgets.chart_stats_scope_media') }}
            </v-btn>
            <v-btn value="tags" size="small">
              {{ t('home.widgets.chart_stats_scope_tags') }}
            </v-btn>
          </v-btn-toggle>

          <v-btn-toggle
            v-model="period"
            density="compact"
            color="primary"
            variant="tonal"
            divided
            mandatory
          >
            <v-btn
              v-for="option in periodOptions"
              :key="String(option.value)"
              :value="option.value"
              size="small"
            >
              {{ option.label }}
            </v-btn>
          </v-btn-toggle>
        </div>
      </div>

      <div
        v-if="loading"
        class="widget-chart-stats__chart widget-chart-stats__skeleton"
        aria-hidden="true"
      >
        <v-skeleton-loader
          class="widget-chart-stats__skeleton-plot"
          type="image"
        />
        <div class="widget-chart-stats__skeleton-legend">
          <v-skeleton-loader
            v-for="index in 3"
            :key="index"
            type="text"
            width="72"
          />
        </div>
      </div>

      <div
        v-else-if="isEmpty"
        class="widget-chart-stats__empty text-medium-emphasis text-caption"
      >
        {{ t('home.widgets.chart_stats_empty') }}
      </div>

      <div v-else class="widget-chart-stats__chart">
        <Line
          :data="lineData"
          :options="lineOptions"
        />
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useTheme} from 'vuetify'
import {Line} from 'vue-chartjs'
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from 'chart.js'
import {typedApi} from '@/services/typedApi'
import type {ParsedChartActivitySeries, ParsedChartStats} from '@shared/schemas/home'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
)

const SERIES_COLORS = {
  added: '#3DBE8B',
  viewed: '#5B8DEF',
  edited: '#F0A202',
} as const

const CHART_PERIODS = [7, 30, 90, 365, 0] as const
const CHART_SCOPES = ['media', 'tags'] as const
type ChartPeriod = typeof CHART_PERIODS[number]
type ChartScope = typeof CHART_SCOPES[number]

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)] as T
}

const emptySeries = (): ParsedChartActivitySeries => ({
  added: [],
  viewed: [],
  edited: [],
})

const emptyStats = (): ParsedChartStats => ({
  days: [],
  period: 30,
  granularity: 'day',
  mediaTotal: 0,
  tagsTotal: 0,
  media: emptySeries(),
  tags: emptySeries(),
})

const {t} = useI18n()
const theme = useTheme()

const stats = ref<ParsedChartStats>(emptyStats())
const loading = ref(true)
const scope = ref<ChartScope>(pickRandom(CHART_SCOPES))
const period = ref<ChartPeriod>(pickRandom(CHART_PERIODS))

const periodOptions = computed(() => ([
  {value: 7 as ChartPeriod, label: t('home.widgets.chart_stats_period_7')},
  {value: 30 as ChartPeriod, label: t('home.widgets.chart_stats_period_30')},
  {value: 90 as ChartPeriod, label: t('home.widgets.chart_stats_period_90')},
  {value: 365 as ChartPeriod, label: t('home.widgets.chart_stats_period_365')},
  {value: 0 as ChartPeriod, label: t('home.widgets.chart_stats_period_all')},
]))

const isEmpty = computed(() => !stats.value.mediaTotal && !stats.value.tagsTotal)

const activeSeries = computed(() => (
  scope.value === 'tags' ? stats.value.tags : stats.value.media
))

const mutedColor = computed(() => {
  const onSurface = theme.current.value.colors['on-surface'] || '#888'
  return withAlpha(onSurface, 0.55)
})

const gridColor = computed(() => {
  const onSurface = theme.current.value.colors['on-surface'] || '#888'
  return withAlpha(onSurface, 0.12)
})

const lineData = computed<ChartData<'line'>>(() => {
  const series = activeSeries.value
  return {
    labels: stats.value.days.map((day) => formatBucketLabel(day, stats.value.granularity)),
    datasets: [
      {
        label: t('home.widgets.chart_stats_metric_added'),
        data: series.added,
        borderColor: SERIES_COLORS.added,
        backgroundColor: withAlpha(SERIES_COLORS.added, 0.15),
        tension: 0.3,
        fill: false,
        pointRadius: 2,
        pointHoverRadius: 4,
        borderWidth: 2,
      },
      {
        label: t('home.widgets.chart_stats_metric_viewed'),
        data: series.viewed,
        borderColor: SERIES_COLORS.viewed,
        backgroundColor: withAlpha(SERIES_COLORS.viewed, 0.15),
        tension: 0.3,
        fill: false,
        pointRadius: 2,
        pointHoverRadius: 4,
        borderWidth: 2,
      },
      {
        label: t('home.widgets.chart_stats_metric_edited'),
        data: series.edited,
        borderColor: SERIES_COLORS.edited,
        backgroundColor: withAlpha(SERIES_COLORS.edited, 0.15),
        tension: 0.3,
        fill: false,
        pointRadius: 2,
        pointHoverRadius: 4,
        borderWidth: 2,
      },
    ],
  }
})

const lineOptions = computed<ChartOptions<'line'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: {
    mode: 'index',
    intersect: false,
  },
  plugins: {
    legend: {
      position: 'bottom',
      labels: {
        boxWidth: 10,
        boxHeight: 10,
        font: {size: 11},
        color: mutedColor.value,
        padding: 12,
      },
    },
  },
  scales: {
    x: {
      ticks: {
        color: mutedColor.value,
        font: {size: 10},
        maxRotation: 0,
        autoSkip: true,
        maxTicksLimit: 8,
      },
      grid: {display: false},
    },
    y: {
      beginAtZero: true,
      ticks: {
        color: mutedColor.value,
        font: {size: 10},
        precision: 0,
      },
      grid: {
        color: gridColor.value,
      },
      border: {display: false},
    },
  },
}))

function withAlpha(color: string, alpha: number) {
  if (color.startsWith('#') && (color.length === 7 || color.length === 4)) {
    const hex = color.length === 4
      ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
      : color
    const r = Number.parseInt(hex.slice(1, 3), 16)
    const g = Number.parseInt(hex.slice(3, 5), 16)
    const b = Number.parseInt(hex.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  return color
}

function formatBucketLabel(day: string, granularity: ParsedChartStats['granularity']) {
  const date = new Date(`${day}T00:00:00`)
  if (Number.isNaN(date.getTime())) return day
  if (granularity === 'month') {
    return date.toLocaleDateString(undefined, {month: 'short', year: '2-digit'})
  }
  return date.toLocaleDateString(undefined, {month: 'short', day: 'numeric'})
}

async function loadStats() {
  loading.value = true
  try {
    const response = await typedApi.getHomeChartStats({period: period.value})
    stats.value = response.data
  } catch (error) {
    console.error(error)
    stats.value = emptyStats()
  } finally {
    loading.value = false
  }
}

watch(period, () => {
  void loadStats()
})

onMounted(() => {
  void loadStats()
})
</script>

<style lang="scss" scoped>
.widget-chart-stats {
  &__toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px 12px;
    flex-wrap: wrap;
  }

  &__title {
    min-width: 0;
  }

  &__controls {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: nowrap;
    margin-left: auto;
  }

  &__chart {
    height: 240px;
  }

  &__skeleton {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  &__skeleton-plot {
    flex: 1 1 auto;
    min-height: 0;
    width: 100%;
    background: transparent !important;

    :deep(.v-skeleton-loader__bone) {
      margin: 0;
      height: 100%;
      border-radius: 10px;
    }
  }

  &__skeleton-legend {
    display: flex;
    justify-content: center;
    gap: 12px;
    flex: 0 0 auto;

    :deep(.v-skeleton-loader) {
      background: transparent !important;
      padding: 0 !important;
    }
  }

  &__empty {
    min-height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
}
</style>
