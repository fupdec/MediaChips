<template>
  <div
    class="settings-group-label"
    :class="{
      'settings-group-label--accent': accent,
      'settings-group-label--error': error,
      'settings-group-label--large': large,
    }"
  >
    <v-icon
      v-if="icon"
      :size="large ? 24 : 16"
      class="settings-group-label__icon"
    >
      {{ iconName }}
    </v-icon>
    <span
      class="text-medium-emphasis font-weight-medium"
      :class="large ? 'text-subtitle-1' : 'text-caption'"
    >{{ title }}</span>
  </div>
</template>

<script setup lang="ts">
import {computed} from 'vue'

const props = withDefaults(defineProps<{
  title: string
  icon?: string
  accent?: boolean
  error?: boolean
  large?: boolean
}>(), {
  icon: undefined,
  accent: false,
  error: false,
  large: false,
})

const iconName = computed(() => {
  if (!props.icon) return ''
  return props.icon.startsWith('mdi-') ? props.icon : `mdi-${props.icon}`
})
</script>

<style scoped>
.settings-group-label {
  display: flex;
  align-items: center;
  gap: 8px;
  letter-spacing: 0.02em;
  padding-inline: 4px;
  margin-bottom: 8px;
}

.settings-group-label--accent {
  padding: 8px 12px;
  margin-bottom: 4px;
  border-radius: 12px;
  background: linear-gradient(
    90deg,
    rgba(var(--v-theme-primary), 0.1),
    transparent 70%
  );
  border: 1px solid rgba(var(--v-theme-primary), 0.1);
}

.settings-group-label--large {
  gap: 10px;
  margin-bottom: 14px;
  margin-top: 16px;
}

.settings-group-label--large span {
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: 0.01em;
}

.settings-group-label__icon {
  color: rgb(var(--v-theme-primary));
  opacity: 0.9;
}

.settings-group-label--accent.settings-group-label--error {
  background: linear-gradient(
    90deg,
    rgba(var(--v-theme-error), 0.12),
    transparent 70%
  );
  border-color: rgba(var(--v-theme-error), 0.16);
}

.settings-group-label--error .settings-group-label__icon {
  color: rgb(var(--v-theme-error));
}
</style>
