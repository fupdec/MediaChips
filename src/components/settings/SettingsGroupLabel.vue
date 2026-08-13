<template>
  <div
    class="settings-group-label"
    :class="{ 'settings-group-label--accent': accent }"
  >
    <v-icon
      v-if="icon"
      size="16"
      class="settings-group-label__icon"
    >
      {{ iconName }}
    </v-icon>
    <span class="text-caption text-medium-emphasis font-weight-medium">{{ title }}</span>
  </div>
</template>

<script setup lang="ts">
import {computed} from 'vue'

const props = withDefaults(defineProps<{
  title: string
  icon?: string
  accent?: boolean
}>(), {
  icon: undefined,
  accent: false,
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

.settings-group-label__icon {
  color: rgb(var(--v-theme-primary));
  opacity: 0.9;
}
</style>
