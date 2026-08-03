<template>
  <v-container class="all-tags-page">
    <div class="text-md-h2 d-flex align-center my-6 ga-4">
      <div class="d-flex align-center">
        <v-icon size="42" start>mdi-tag-multiple-outline</v-icon>
        {{ t('navigation.all_tags') }}
      </div>

      <v-spacer />

      <v-btn
        v-if="tagCategories.length >= 2"
        variant="tonal"
        color="primary"
        class="text-none"
        rounded="xl"
        prepend-icon="mdi-set-merge"
        :text="t('meta.dialogs.merge_categories_title')"
        @click="openCategoryMerge"
      />
    </div>

    <AllTagsBoard />
  </v-container>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import AllTagsBoard from '@/components/tags/AllTagsBoard.vue'
import {useAppStore} from '@/stores/app'
import {useDialogsStore} from '@/stores/dialogs'

const {t} = useI18n()
const appStore = useAppStore()
const dialogsStore = useDialogsStore()

const tagCategories = computed(() =>
  appStore.meta.filter((item) => item.type === 'array'),
)

const openCategoryMerge = () => {
  if (tagCategories.value.length < 2) return
  dialogsStore.openTagCategoryMerge(tagCategories.value)
}
</script>

<style scoped lang="scss">
.all-tags-page {
  max-width: 1400px;
}
</style>
