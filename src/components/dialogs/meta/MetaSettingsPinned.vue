<template>
  <MetaWhereAppears
    :meta="meta"
    @updated="$emit('pinned-meta-updated')"
  />
</template>

<script setup lang="ts">
import MetaWhereAppears from '@/components/dialogs/meta/MetaWhereAppears.vue'
import type {Meta} from '@/types/stores'

defineProps<{
  meta: Meta
}>()

defineEmits(['pinned-meta-updated'])
</script>
