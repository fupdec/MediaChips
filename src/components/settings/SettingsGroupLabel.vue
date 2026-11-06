<template>
  <div
    class="settings-group-label"
    :class="{
      'settings-group-label--accent': accent,
      'settings-group-label--error': error,
      'settings-group-label--large': large,
    }"
  >
    <v-avatar
      v-if="icon && accent"
      :icon="iconName"
      :color="error ? 'error' : 'primary'"
      variant="tonal"
      size="40"
      rounded="lg"
    />
    <v-icon
      v-else-if="icon"
      :size="accent || large ? 20 : 16"
      class="settings-group-label__icon"
    >
      {{ iconName }}
    </v-icon>
    <span
      class="settings-group-label__title"
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
  --group-accent: var(--v-theme-primary);
  gap: 12px;
  min-height: 56px;
  padding: 8px 0;
  margin-block: 12px 4px;
}

.settings-group-label__title {
  color: rgba(var(--v-theme-on-surface), .65);
  font-size: .75rem;
  font-weight: 400;
  line-height: 1.4;
}

.settings-group-label--accent .settings-group-label__title {
  color: rgb(var(--v-theme-on-surface));
  font-size: 1.125rem;
  font-weight: 400;
  letter-spacing: -.025em;
}

.settings-group-label--accent::after {
  content: '';
  flex: 1;
  min-width: 24px;
  height: 1px;
  margin-inline-start: 8px;
  background: linear-gradient(90deg, rgba(var(--group-accent), .24), rgba(var(--group-accent), .03));
}

.settings-group-label--large {
  gap: 10px;
  margin-bottom: 14px;
  margin-top: 16px;
}

.settings-group-label--large span {
  font-size: 1.125rem;
  font-weight: 400;
  line-height: 1.3;
  letter-spacing: 0.01em;
}

.settings-group-label__icon {
  color: rgb(var(--v-theme-primary));
  opacity: 0.9;
}

.settings-group-label--accent.settings-group-label--error {
  --group-accent: var(--v-theme-error);
}

.settings-group-label--error .settings-group-label__icon {
  color: rgb(var(--v-theme-error));
}

@media (max-width: 600px) {
  .settings-group-label--accent {
    gap: 12px;
  }

  .settings-group-label--accent .settings-group-label__title {
    font-size: 1rem;
  }


}
</style>
