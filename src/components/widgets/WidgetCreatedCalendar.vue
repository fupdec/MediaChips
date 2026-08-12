<template>
  <v-card class="rounded-lg widget-created-calendar mb-8" color="primary" variant="tonal">
    <v-card-text class="pa-3">
      <div class="widget-created-calendar__toolbar mb-3">
        <div class="d-flex align-center text-body-1 font-weight-medium">
          <v-icon class="mr-2" size="20">mdi-calendar-star</v-icon>
          {{ t('home.widgets.created_calendar_title') }}
        </div>

        <div class="d-flex align-center ga-1">
          <v-btn
            icon
            size="small"
            variant="text"
            :aria-label="t('home.widgets.created_calendar_prev')"
            @click="shiftMonth(-1)"
          >
            <v-icon>mdi-chevron-left</v-icon>
          </v-btn>
          <div class="text-body-2 font-weight-medium widget-created-calendar__month">
            {{ monthLabel }}
          </div>
          <v-btn
            icon
            size="small"
            variant="text"
            :aria-label="t('home.widgets.created_calendar_next')"
            @click="shiftMonth(1)"
          >
            <v-icon>mdi-chevron-right</v-icon>
          </v-btn>
          <v-btn
            size="small"
            variant="tonal"
            rounded
            class="ml-1"
            @click="openMonth"
          >
            {{ t('home.widgets.created_calendar_open_month') }}
          </v-btn>
        </div>
      </div>

      <div v-if="loading" class="text-medium-emphasis text-caption py-6 text-center">
        {{ t('common.loading') }}
      </div>

      <template v-else>
        <div class="widget-created-calendar__weekdays mb-1">
          <div
            v-for="label in weekdayLabels"
            :key="label"
            class="widget-created-calendar__weekday text-caption text-medium-emphasis"
          >
            {{ label }}
          </div>
        </div>

        <div class="widget-created-calendar__grid">
          <button
            v-for="cell in calendarCells"
            :key="cell.key"
            type="button"
            class="widget-created-calendar__day"
            :class="{
              'widget-created-calendar__day--empty': !cell.day,
              'widget-created-calendar__day--has': cell.count > 0,
              'widget-created-calendar__day--today': cell.isToday,
            }"
            :disabled="!cell.day || cell.count <= 0"
            :style="cell.count > 0 ? { '--heat': cell.heat } : undefined"
            :title="cell.title"
            @click="cell.day && cell.count > 0 && openDay(cell.day)"
          >
            <span class="widget-created-calendar__day-num">{{ cell.label }}</span>
            <span v-if="cell.count > 0" class="widget-created-calendar__day-count">
              {{ cell.count }}
            </span>
          </button>
        </div>

        <div class="d-flex flex-wrap align-center justify-space-between ga-2 mt-3">
          <div class="text-caption text-medium-emphasis">
            <span v-if="stats.totalInMonth > 0">
              {{ t('home.widgets.created_calendar_month_total', {count: stats.totalInMonth}) }}
            </span>
            <span v-else>
              {{ t('home.widgets.created_calendar_empty_month') }}
            </span>
            <span v-if="stats.totalMissingDate > 0" class="ml-2">
              · {{ t('home.widgets.created_calendar_missing', {count: stats.totalMissingDate}) }}
            </span>
          </div>
          <v-btn
            size="small"
            variant="text"
            rounded
            @click="browseByCreated"
          >
            {{ t('home.widgets.created_calendar_browse') }}
          </v-btn>
        </div>
      </template>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {typedApi} from '@/services/typedApi'
import {useOpenMediaList} from '@/utils/openMediaList'
import {
  buildMediaCreatedDayFilters,
  buildMediaCreatedMonthFilters,
} from '@/utils/homeMediaListFilters'
import {shiftCalendarMonth} from '@shared/calendarMonth'
import type {ParsedCreatedCalendarMonth} from '@shared/schemas/home'

const {t, locale} = useI18n()
const {openMediaList} = useOpenMediaList()

const now = new Date()
const year = ref(now.getFullYear())
const month = ref(now.getMonth() + 1)
const loading = ref(false)
const stats = ref<ParsedCreatedCalendarMonth>({
  year: year.value,
  month: month.value,
  days: [],
  totalInMonth: 0,
  totalWithDate: 0,
  totalMissingDate: 0,
})

const countsByDay = computed(() => {
  const map = new Map<string, number>()
  for (const row of stats.value.days || []) {
    map.set(row.day, row.count)
  }
  return map
})

const maxCount = computed(() =>
  Math.max(0, ...[...countsByDay.value.values()], 0),
)

const monthLabel = computed(() => {
  const date = new Date(year.value, month.value - 1, 1)
  return new Intl.DateTimeFormat(locale.value, {month: 'long', year: 'numeric'}).format(date)
})

const weekdayLabels = computed(() => {
  const formatter = new Intl.DateTimeFormat(locale.value, {weekday: 'short'})
  // Monday-first week to match denser library browsing.
  return Array.from({length: 7}, (_, index) => {
    const day = new Date(Date.UTC(2024, 0, 1 + index)) // Mon=1 Jan 2024
    return formatter.format(day)
  })
})

type CalendarCell = {
  key: string
  day: string | null
  label: string
  count: number
  heat: number
  isToday: boolean
  title?: string
}

const calendarCells = computed((): CalendarCell[] => {
  const y = year.value
  const m = month.value
  const first = new Date(y, m - 1, 1)
  const daysInMonth = new Date(y, m, 0).getDate()
  // JS: 0=Sun … 6=Sat → Monday-first offset
  const startOffset = (first.getDay() + 6) % 7
  const today = new Date()
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const cells: CalendarCell[] = []

  for (let i = 0; i < startOffset; i += 1) {
    cells.push({
      key: `pad-${i}`,
      day: null,
      label: '',
      count: 0,
      heat: 0,
      isToday: false,
    })
  }

  for (let dayNum = 1; dayNum <= daysInMonth; dayNum += 1) {
    const day = `${y}-${String(m).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
    const count = countsByDay.value.get(day) || 0
    const heat = maxCount.value > 0 ? count / maxCount.value : 0
    cells.push({
      key: day,
      day,
      label: String(dayNum),
      count,
      heat,
      isToday: day === todayKey,
      title: count > 0
        ? t('home.widgets.created_calendar_day_title', {count, day: dayNum})
        : undefined,
    })
  }

  return cells
})

async function loadMonth() {
  loading.value = true
  try {
    const res = await typedApi.getHomeCreatedCalendar({
      year: year.value,
      month: month.value,
    })
    stats.value = res.data
    year.value = res.data.year
    month.value = res.data.month
  } catch (error) {
    console.error('Failed to load created calendar', error)
    stats.value = {
      year: year.value,
      month: month.value,
      days: [],
      totalInMonth: 0,
      totalWithDate: 0,
      totalMissingDate: 0,
    }
  } finally {
    loading.value = false
  }
}

function shiftMonth(delta: number) {
  const next = shiftCalendarMonth(year.value, month.value, delta)
  year.value = next.year
  month.value = next.month
}

function openDay(day: string) {
  void openMediaList({
    sortBy: 'mediaCreatedAt',
    sortDir: 'desc',
    filters: buildMediaCreatedDayFilters(day),
  })
}

function openMonth() {
  void openMediaList({
    sortBy: 'mediaCreatedAt',
    sortDir: 'desc',
    groupBy: 'dateDay',
    filters: buildMediaCreatedMonthFilters(year.value, month.value),
  })
}

function browseByCreated() {
  void openMediaList({
    sortBy: 'mediaCreatedAt',
    sortDir: 'desc',
    groupBy: 'dateDay',
  })
}

watch([year, month], () => {
  void loadMonth()
}, {immediate: true})
</script>

<style scoped>
.widget-created-calendar__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.widget-created-calendar__month {
  min-width: 9.5rem;
  text-align: center;
  text-transform: capitalize;
}

.widget-created-calendar__weekdays,
.widget-created-calendar__grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
}

.widget-created-calendar__weekday {
  text-align: center;
}

.widget-created-calendar__day {
  appearance: none;
  border: 1px solid transparent;
  border-radius: 10px;
  min-height: 44px;
  padding: 4px 2px;
  background: transparent;
  color: inherit;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  cursor: default;
}

.widget-created-calendar__day--has {
  cursor: pointer;
  background: rgba(var(--v-theme-primary), calc(0.12 + var(--heat, 0) * 0.45));
  border-color: rgba(var(--v-theme-primary), calc(0.18 + var(--heat, 0) * 0.35));
  transition: transform 120ms ease, background 120ms ease;
}

.widget-created-calendar__day--has:hover {
  transform: translateY(-1px);
}

.widget-created-calendar__day--today {
  border-color: rgb(var(--v-theme-primary));
}

.widget-created-calendar__day:disabled {
  opacity: 0.55;
}

.widget-created-calendar__day--empty {
  visibility: hidden;
}

.widget-created-calendar__day-num {
  font-size: 0.8rem;
  line-height: 1.1;
  font-weight: 600;
}

.widget-created-calendar__day-count {
  font-size: 0.65rem;
  line-height: 1;
  opacity: 0.85;
}
</style>
