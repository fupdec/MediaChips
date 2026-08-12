<template>
  <div v-if="visible" class="health-progress">
    <div class="health-progress__row">
      <span class="health-progress__label">{{ label }}</span>
      <span
        v-if="showPercent && percent != null"
        class="health-progress__pct"
      >
        {{ displayPercent }}%
      </span>
    </div>
    <div
      class="health-progress__track"
      :class="{
        'health-progress__track--active': active,
        'health-progress__track--done': !active && clampedPercent >= 100,
        'health-progress__track--pending': !active && clampedPercent < 100,
      }"
    >
      <div
        class="health-progress__fill"
        :class="{ 'health-progress__fill--striped': striped && active }"
        :style="{ width: `${clampedPercent}%` }"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed} from 'vue'

const props = withDefaults(defineProps<{
  label: string
  /** 0–100 completion. */
  percent?: number | null
  active?: boolean
  showPercent?: boolean
  striped?: boolean
}>(), {
  percent: null,
  active: false,
  showPercent: true,
  striped: false,
})

const visible = computed(() => Boolean(props.label))

const clampedPercent = computed(() => {
  if (props.percent == null || Number.isNaN(props.percent)) return 0
  return Math.max(0, Math.min(100, props.percent))
})

/** Floor incomplete progress so e.g. 99.8% never reads as 100% while work remains. */
const displayPercent = computed(() => {
  const value = clampedPercent.value
  if (value >= 100) return 100
  return Math.floor(value)
})
</script>

<style scoped lang="scss">
.health-progress {
  margin-bottom: 12px;
}

.health-progress__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.health-progress__label {
  min-width: 0;
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 0.8125rem;
  line-height: 1.35;
}

.health-progress__pct {
  flex: 0 0 auto;
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-size: 0.75rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.health-progress__track {
  position: relative;
  height: 8px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(var(--v-theme-on-surface), 0.1);
  box-shadow: inset 0 0 0 1px rgba(var(--v-theme-on-surface), 0.06);
}

.health-progress__track--pending {
  background: rgba(var(--v-theme-warning), 0.14);
  box-shadow: inset 0 0 0 1px rgba(var(--v-theme-warning), 0.16);
}

.health-progress__track--done {
  background: rgba(var(--v-theme-success), 0.14);
  box-shadow: inset 0 0 0 1px rgba(var(--v-theme-success), 0.16);
}

.health-progress__track--active {
  background: rgba(var(--v-theme-primary), 0.14);
  box-shadow: inset 0 0 0 1px rgba(var(--v-theme-primary), 0.18);
}

.health-progress__fill {
  height: 100%;
  border-radius: inherit;
  background: rgb(var(--v-theme-warning));
  transition: width 0.25s ease;
}

.health-progress__track--done .health-progress__fill {
  background: rgb(var(--v-theme-success));
}

.health-progress__track--active .health-progress__fill {
  background: rgb(var(--v-theme-primary));
}

.health-progress__fill--striped {
  background-image: linear-gradient(
    45deg,
    rgba(255, 255, 255, 0.22) 25%,
    transparent 25%,
    transparent 50%,
    rgba(255, 255, 255, 0.22) 50%,
    rgba(255, 255, 255, 0.22) 75%,
    transparent 75%,
    transparent
  );
  background-size: 16px 16px;
  animation: health-progress-stripes 0.7s linear infinite;
}

@keyframes health-progress-stripes {
  from { background-position: 0 0; }
  to { background-position: 16px 0; }
}
</style>
