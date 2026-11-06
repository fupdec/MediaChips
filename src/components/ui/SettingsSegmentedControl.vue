<script setup lang="ts" generic="T extends string | number">
const props = defineProps<{
  modelValue: T
  label: string
  items: Array<{value: T; title: string; icon?: string; badge?: string; disabled?: boolean; tooltip?: string}>
  disabled?: boolean
  compact?: boolean
}>()

const emit = defineEmits<{'update:modelValue': [value: T]}>()
function moveSelection(event: KeyboardEvent, value: T) {
  const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
    : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
  if (!step || props.disabled) return
  const items = props.items.filter(item => !item.disabled)
  if (!items.length) return
  event.preventDefault()
  const index = items.findIndex(item => item.value === value)
  const next = items[(index + step + items.length) % items.length]
  emit('update:modelValue', next.value)
  const group = (event.currentTarget as HTMLElement).parentElement
  const buttons = group?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
  buttons?.[(index + step + items.length) % items.length]?.focus()
}
</script>

<template>
  <div class="settings-segmented" :class="{'settings-segmented--compact': compact}" role="radiogroup" :aria-label="label">
    <button
      v-for="item in items"
      :key="item.value"
      type="button"
      role="radio"
      :aria-checked="modelValue === item.value"
      :tabindex="modelValue === item.value ? 0 : -1"
      :disabled="disabled || item.disabled"
      @click="emit('update:modelValue', item.value)"
      @keydown="moveSelection($event, item.value)"
      class="settings-segmented__option"
      :title="item.tooltip"
      :class="{'is-selected': modelValue === item.value, 'is-disabled': disabled || item.disabled}"
    >
      <v-icon v-if="item.icon" :icon="item.icon" size="18"/>
      <span>{{ item.title }}</span>
      <span v-if="item.badge" class="settings-segmented__badge">{{ item.badge }}</span>
    </button>
  </div>
</template>

<style scoped>
.settings-segmented {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
  max-width: 100%;
  padding: 4px;
  border: 1px solid rgba(var(--v-theme-on-surface), .07);
  border-radius: 14px;
  background: rgba(var(--v-theme-on-surface), .035);
}

.settings-segmented__option {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 38px;
  padding: 8px 14px;
  border: 1px solid transparent;
  border-radius: 10px;
  color: rgba(var(--v-theme-on-surface), .7);
  font-size: .875rem;
  line-height: 1.4;
  cursor: pointer;
  transition: background-color .15s, color .15s, box-shadow .15s;
}

.settings-segmented__option:hover {
  background: rgba(var(--v-theme-primary), .05);
}

.settings-segmented__option.is-selected {
  background: rgb(var(--v-theme-surface));
  border-color: rgba(var(--v-theme-primary), .18);
  color: rgb(var(--v-theme-primary));
  box-shadow: 0 1px 4px rgb(0 0 0 / 7%);
}

.settings-segmented__option:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

.settings-segmented__badge {
  padding: 2px 6px;
  border-radius: 5px;
  background: rgba(var(--v-theme-warning), .1);
  color: rgb(var(--v-theme-warning));
  font-size: .625rem;
  font-weight: 600;
  line-height: 1.4;
}

.settings-segmented__option.is-disabled {
  opacity: .45;
  cursor: default;
}

.settings-segmented--compact {
  padding: 3px;
  gap: 3px;
  border-radius: 11px;
}

.settings-segmented--compact .settings-segmented__option {
  min-height: 28px;
  padding: 4px 9px;
  border-radius: 8px;
  font-size: .75rem;
}

@media (prefers-reduced-motion: reduce) {
  .settings-segmented__option {
    transition: none;
  }
}
</style>
