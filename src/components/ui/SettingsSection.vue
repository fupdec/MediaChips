<template>
  <v-card
    class="settings-section"
    :class="sectionClass"
    :id="id"
    rounded="xl"
    variant="flat"
  >
    <slot/>
  </v-card>
</template>

<script setup lang="ts">
import {computed} from 'vue'

const props = defineProps({
  padded: {
    type: Boolean,
    default: false,
  },
  id: {
    type: String,
    default: undefined,
  },
})

const sectionClass = computed(() => ({
  'settings-section--padded': props.padded,
}))
</script>

<style scoped>
.settings-section {
  background-color: rgb(120 120 120 / 5%) !important;
}

.settings-section:not(.settings-section--padded) {
  padding-block: 16px;
}

.settings-section--padded {
  padding: 16px;
}
</style>
