<template>
  <v-container class="all-tags-page">
    <div class="text-md-h2 d-flex align-center my-6">
      <v-icon size="42" start>mdi-tag-multiple-outline</v-icon>
      {{ t('navigation.all_tags') }}
    </div>

    <AllTagsBoard />
  </v-container>
</template>

<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import AllTagsBoard from '@/components/tags/AllTagsBoard.vue'

const {t} = useI18n()
</script>

<style scoped lang="scss">
.all-tags-page {
  max-width: 1400px;
}
</style>
