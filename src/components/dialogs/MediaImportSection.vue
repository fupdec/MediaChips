<template>
  <div v-if="embedded" class="media-import-section"><slot /></div>
  <v-expansion-panels v-else class="mb-4" variant="accordion">
    <v-expansion-panel elevation="0" rounded="lg">
      <v-expansion-panel-title class="media-import-section__title">
        <v-icon size="18" color="primary" class="mr-2" :icon="`mdi-${icon}`" />
        {{ title }}
      </v-expansion-panel-title>
      <v-expansion-panel-text><slot /></v-expansion-panel-text>
    </v-expansion-panel>
  </v-expansion-panels>
</template>

<script setup lang="ts">
defineProps<{embedded?: boolean; title: string; icon: string}>()
</script>

<style scoped>
:deep(.v-expansion-panel) { border: 1px solid rgba(var(--v-theme-on-surface), 0.08); }
:deep(.v-expansion-panel-text__wrapper) { padding: 4px 14px 12px; }
.media-import-section__title { min-height: 46px; padding: 10px 14px; font-size: 0.875rem; font-weight: 600; }
</style>
