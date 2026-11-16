<template>
  <v-btn
    v-if="placement === 'rail'"
    v-tooltip:end="label"
    :aria-label="label"
    :disabled="disabled"
    :icon="icon"
    variant="text"
    size="small"
    rounded="lg"
    @click="emit('click')"
  />
  <v-btn
    v-else
    class="edit-dialog-media-action"
    color="primary"
    variant="tonal"
    rounded="xl"
    size="small"
    :prepend-icon="icon"
    :disabled="disabled"
    @click="emit('click')"
  >
    <span class="text-truncate" :title="label">{{ label }}</span>
  </v-btn>
</template>

<script setup lang="ts">
/** One quick action, rendered the same way in every edit dialog: icon in the collapsed rail, tonal chip under the media. */
defineProps<{
  icon: string
  label: string
  placement: 'rail' | 'media'
  disabled?: boolean
}>()
const emit = defineEmits<{click: []}>()
</script>
