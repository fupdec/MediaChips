<template>
  <div>
    <div class="d-flex justify-end mb-2">
      <MetaAssignmentSettingsLink
        v-if="meta?.id"
        :view="meta.type === 'array' ? 'tags' : 'media'"
        :meta-id="meta.id"
      />
    </div>

    <MetaAssignmentPanel
      mode="from-meta"
      :meta="meta"
      @pinned-meta-updated="$emit('pinned-meta-updated')"
    />
  </div>
</template>

<script setup lang="ts">
import MetaAssignmentPanel from '@/components/meta/assignment/MetaAssignmentPanel.vue'
import MetaAssignmentSettingsLink from '@/components/meta/assignment/MetaAssignmentSettingsLink.vue'
import type {Meta} from '@/types/stores'

defineProps<{
  meta: Meta
}>()

defineEmits(['pinned-meta-updated'])
</script>
