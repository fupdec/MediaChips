<template>
  <div
    class="mark-time-hms"
    :class="{
      'mark-time-hms--compact': compact,
      'mark-time-hms--disabled': disabled,
    }"
    role="group"
    :aria-label="ariaLabel"
    :aria-disabled="disabled || undefined"
  >
    <input
      class="mark-time-hms__field"
      type="number"
      inputmode="numeric"
      min="0"
      :max="maxHours"
      :value="parts.hours"
      :disabled="disabled"
      :aria-label="t('player.mark_dialog.hours')"
      @change="onPartChange('hours', $event)"
      @keydown.up.prevent="nudge('hours', 1)"
      @keydown.down.prevent="nudge('hours', -1)"
    >
    <span class="mark-time-hms__sep" aria-hidden="true">:</span>
    <input
      class="mark-time-hms__field"
      type="number"
      inputmode="numeric"
      min="0"
      max="59"
      :value="parts.minutes"
      :disabled="disabled"
      :aria-label="t('player.mark_dialog.minutes')"
      @change="onPartChange('minutes', $event)"
      @keydown.up.prevent="nudge('minutes', 1)"
      @keydown.down.prevent="nudge('minutes', -1)"
    >
    <span class="mark-time-hms__sep" aria-hidden="true">:</span>
    <input
      class="mark-time-hms__field"
      type="number"
      inputmode="numeric"
      min="0"
      max="59"
      :value="parts.seconds"
      :disabled="disabled"
      :aria-label="t('player.mark_dialog.seconds')"
      @change="onPartChange('seconds', $event)"
      @keydown.up.prevent="nudge('seconds', 1)"
      @keydown.down.prevent="nudge('seconds', -1)"
    >
  </div>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {
  clampMarkSeconds,
  joinHmsToSeconds,
  splitSecondsToHms,
  type MarkTimeParts,
} from '@/utils/markTimeHms'

const props = withDefaults(defineProps<{
  modelValue?: number | null
  min?: number
  max?: number
  ariaLabel?: string
  compact?: boolean
  disabled?: boolean
}>(), {
  modelValue: 0,
  min: 0,
  max: undefined,
  ariaLabel: undefined,
  compact: false,
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

const {t} = useI18n()

const parts = computed(() => splitSecondsToHms(props.modelValue))
const maxHours = computed(() => {
  if (typeof props.max === 'number' && Number.isFinite(props.max) && props.max >= 0) {
    return Math.floor(props.max / 3600)
  }
  return 99
})

const commit = (next: MarkTimeParts) => {
  if (props.disabled) return
  const joined = joinHmsToSeconds(next.hours, next.minutes, next.seconds, {
    maxSeconds: props.max,
  })
  emit('update:modelValue', clampMarkSeconds(joined, props.min, props.max))
}

const onPartChange = (key: keyof MarkTimeParts, event: Event) => {
  const target = event.target as HTMLInputElement
  const raw = Math.floor(Number(target.value) || 0)
  const next = {...parts.value}
  if (key === 'hours') next.hours = Math.max(0, raw)
  if (key === 'minutes') next.minutes = Math.max(0, Math.min(59, raw))
  if (key === 'seconds') next.seconds = Math.max(0, Math.min(59, raw))
  commit(next)
}

const nudge = (key: keyof MarkTimeParts, delta: number) => {
  if (props.disabled) return
  const current = clampMarkSeconds(props.modelValue, props.min, props.max)
  const step = key === 'hours' ? 3600 : key === 'minutes' ? 60 : 1
  emit('update:modelValue', clampMarkSeconds(current + delta * step, props.min, props.max))
}
</script>

<style scoped lang="scss">
.mark-time-hms {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 6px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 12px;
  background: rgb(var(--v-theme-surface));
  min-height: 36px;
}

.mark-time-hms__field {
  width: 2.1rem;
  border: 0;
  outline: none;
  background: transparent;
  text-align: center;
  font-variant-numeric: tabular-nums;
  font-size: 0.875rem;
  line-height: 1.2;
  color: inherit;
  padding: 4px 0;
  -moz-appearance: textfield;

  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  &:focus {
    background: rgba(var(--v-theme-primary), 0.08);
    border-radius: 6px;
  }
}

.mark-time-hms__sep {
  opacity: 0.45;
  font-size: 0.875rem;
  user-select: none;
}

.mark-time-hms--compact {
  min-height: 28px;
  padding: 0 4px;
  border-radius: 8px;

  .mark-time-hms__field {
    width: 1.7rem;
    font-size: 0.8125rem;
    padding: 2px 0;
  }
}

.mark-time-hms--disabled {
  pointer-events: none;
}
</style>
