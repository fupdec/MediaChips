<template>
  <v-btn
    variant="text"
    size="small"
    color="primary"
    class="meta-assignment-settings-link px-1"
    :to="link"
  >
    <v-icon start size="16">mdi-open-in-new</v-icon>
    {{ t('settings_labels.field_pinning.open_in_settings') }}
  </v-btn>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import type {MetaAssignmentView} from '@/types/metaAssignment'

const props = withDefaults(defineProps<{
  view?: MetaAssignmentView
  mediaTypeId?: number | null
  metaId?: number | null
}>(), {
  view: 'media',
  mediaTypeId: null,
  metaId: null,
})

const {t} = useI18n()

const link = computed(() => {
  const query: Record<string, string | number> = {
    tab: 'library',
    section: 'field_pinning',
    view: props.view,
  }
  if (props.mediaTypeId) query.mediaTypeId = props.mediaTypeId
  if (props.metaId) query.metaId = props.metaId
  return {path: '/settings', query}
})
</script>
