<template>
  <v-card class="rounded-xl pa-4" color="rgb(150 150 150 / 9%)" flat>
    <LineChartGenerator
      v-if="tags.length"
      :data="datasets"
      :options="chartOptions"
      :chart-id="chartId"
      :dataset-id-key="datasetIdKey"
      :plugins="plugins"
      :css-classes="cssClasses"
      :styles="styles"
      :width="width"
      :height="height"
    />
  </v-card>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue'
import {Line as LineChartGenerator} from 'vue-chartjs'
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  LineElement,
  LinearScale,
  CategoryScale,
  PointElement,
} from 'chart.js'
import sortBy from 'lodash/sortBy'
import groupBy from 'lodash/groupBy'
import {useAppStore} from '@/stores/app'

ChartJS.register(
  Title,
  Tooltip,
  Legend,
  LineElement,
  LinearScale,
  CategoryScale,
  PointElement,
)

withDefaults(defineProps<{
  chartId?: string
  datasetIdKey?: string
  width?: number
  height?: number
  cssClasses?: string
  styles?: Record<string, unknown>
  plugins?: unknown[]
}>(), {
  chartId: 'line-chart',
  datasetIdKey: 'label',
  width: 100,
  height: 100,
  cssClasses: '',
  styles: () => ({}),
  plugins: () => [],
})

const appStore = useAppStore()

const chartOptions = ref<Record<string, unknown>>({})

const tags = computed(() => appStore.tags)

const datasets = computed(() => {
  let labels: string[] = []

  const getDataset = (param: 'createdAt' | 'updatedAt', color: string) => {
    const dates = tags.value.map((i) => new Date(String(i[param])))
    const sortedDates = sortBy(dates, (date) => date.getTime())
    const start = sortedDates[0]
    const end = sortedDates[sortedDates.length - 1]

    const getDaysArray = (s: Date, e: Date) => {
      const days: string[] = []
      for (const d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
        days.push(d.toLocaleDateString())
      }
      return days
    }

    const dateStrings = sortedDates.map((date) => date.toLocaleDateString())
    const grouped = groupBy(dateStrings)

    const days = getDaysArray(start, end)
    const res = days.map((day) => grouped[day] ? grouped[day].length : null)

    if (param === 'createdAt') {
      labels = days
    }

    return {
      data: res,
      label: param,
      backgroundColor: color,
    }
  }

  const params = [
    {text: 'createdAt' as const, color: '#E1CB5AFF'},
    {text: 'updatedAt' as const, color: '#8AF879FF'},
  ]

  const data = params.map((item) => getDataset(item.text, item.color))

  return {
    labels,
    datasets: data,
  }
})
</script>
