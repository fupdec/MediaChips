<template>
  <div class="tag-page-hierarchy d-flex flex-wrap align-center ga-2">
    <v-btn
      class="tag-meta-link"
      rounded
      variant="tonal"
      :title="t('actions.open_page')"
      @click="openMeta"
    >
      <v-icon start>mdi-{{ meta.icon }}</v-icon>
      <div class="text">{{ meta.name }}</div>
      <v-icon end>mdi-arrow-left</v-icon>
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
