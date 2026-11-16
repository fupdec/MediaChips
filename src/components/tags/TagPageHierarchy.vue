<template>
  <div class="tag-page-hierarchy d-flex flex-wrap align-center ga-2">
    <v-btn
      class="tag-meta-link"
      rounded
      variant="tonal"
      :title="t('actions.open_page')"
      :prepend-icon="`mdi-${meta.icon}`"
      append-icon="mdi-arrow-left"
      @click="openMeta"
    >
      {{ meta.name }}
    </v-btn>
  </div>
</template>

<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import type {Meta, Tag} from '@/types/stores'

defineProps<{
  tag: Tag
  meta: Meta
}>()

const emit = defineEmits<{
  openMeta: []
}>()

const {t} = useI18n()

function openMeta() {
  emit('openMeta')
}
</script>
