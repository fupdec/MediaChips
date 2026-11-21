<template>
  <div class="meta-assignment-anchor">
    <div class="meta-assignment-anchor__icon">
      <v-icon size="24" color="primary">mdi-{{ icon }}</v-icon>
    </div>
    <div class="meta-assignment-anchor__body">
      <span class="meta-assignment-anchor__name text-subtitle-1 font-weight-medium">{{ name }}</span>
      <span v-if="subtitle" class="meta-assignment-anchor__subtitle text-body-2 text-medium-emphasis">
        {{ subtitle }}
      </span>
    </div>
    <v-chip v-if="typeLabel" size="x-small" variant="tonal" color="primary" class="meta-assignment-anchor__type">
      {{ typeLabel }}
    </v-chip>
    <div v-if="$slots.actions" class="meta-assignment-anchor__actions">
      <slot name="actions"/>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  icon: string
  name: string
  subtitle?: string
  typeLabel?: string
}>(), {
  subtitle: '',
  typeLabel: '',
})
</script>
