<template>
  <div class="dup-progress" role="status" aria-live="polite" data-testid="duplicate-progress">
    <div class="dup-progress__head">
      <span class="dup-progress__label">{{ label }}</span>
      <span v-if="known" class="dup-progress__percent">{{ percent }}%</span>
    </div>
    <v-progress-linear
      :model-value="percent"
      :indeterminate="!known"
      color="primary"
      rounded
      height="6"
    />
    <div v-if="known" class="dup-progress__meta">
      <span>{{ t('media.dialogs.duplicate_review_progress_counts', {done: fmt(done), total: fmt(total), left: fmt(left)}) }}</span>
      <span>{{ eta }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {estimateRemainingMs, formatClock} from '@/utils/progressEta'

const props = defineProps<{
  label: string
  done: number
  total: number
  /** When this phase began; the pace (and so the ETA) is measured from it. */
  startedAt: number
}>()

const {t, locale} = useI18n()
const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | undefined
// The estimate keeps counting down between server/progress updates.
onMounted(() => { ticker = setInterval(() => { now.value = Date.now() }, 1000) })
onBeforeUnmount(() => clearInterval(ticker))

const known = computed(() => props.total > 0)
const left = computed(() => Math.max(0, props.total - props.done))
const percent = computed(() => known.value ? Math.min(100, Math.floor((props.done / props.total) * 100)) : 0)
const fmt = (value: number) => value.toLocaleString(locale.value)
const eta = computed(() => {
  const remaining = estimateRemainingMs({done: props.done, total: props.total, startedAt: props.startedAt}, now.value)
  return remaining == null
    ? t('media.dialogs.duplicate_review_eta_pending')
    : t('media.dialogs.duplicate_review_eta', {time: formatClock(remaining)})
})
</script>

<style scoped>
.dup-progress { display: grid; gap: 8px; }
.dup-progress__head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; font-size: .875rem; font-weight: 500; }
.dup-progress__percent { font-variant-numeric: tabular-nums; color: rgba(var(--v-theme-on-surface), .65); }
.dup-progress__meta { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 16px; font-size: .75rem; font-variant-numeric: tabular-nums; color: rgba(var(--v-theme-on-surface), .65); }
</style>
