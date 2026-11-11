<template>
  <v-virtual-scroll
    v-if="history"
    :items="jobs"
    item-key="id"
    :item-height="100"
    :max-height="320"
    role="region"
    :aria-label="historyLabel"
    tabindex="0"
  >
    <template #default="{item}">
      <slot :job="item"/>
    </template>
  </v-virtual-scroll>
  <div v-else>
    <template v-for="job in jobs" :key="job.id">
      <slot :job="job"/>
    </template>
  </div>
</template>

<script setup lang="ts">
import type {CopyDiscoveryJob} from '@shared/copyDiscovery'

defineProps<{jobs: CopyDiscoveryJob[]; history: boolean; historyLabel?: string}>()
defineSlots<{default(props: {job: CopyDiscoveryJob}): unknown}>()
</script>
