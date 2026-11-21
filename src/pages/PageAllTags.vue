<template>
  <v-container class="all-tags-page">
    <div class="all-tags-page__header">
      <div class="all-tags-page__heading">
        <div class="all-tags-page__icon"><v-icon size="26">mdi-tag-multiple-outline</v-icon></div>
        <div>
          <h1>{{ t('navigation.all_tags') }}</h1>
          <div class="all-tags-page__summary">{{ t('all_tags.tags_count', {count: appStore.tags.length}) }}</div>
        </div>
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
  max-width: 1600px;
  padding: 28px 28px 20px;
}

.all-tags-page__header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}

.all-tags-page__heading {
  display: flex;
  align-items: center;
  gap: 14px;

  h1 {
    font-size: 30px;
    line-height: 1.2;
    font-weight: 650;
    letter-spacing: -0.8px;
  }
}

.all-tags-page__icon {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 16px;
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.09);
}

.all-tags-page__summary {
  margin-top: 5px;
  font-size: 13px;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

@media (max-width: 600px) {
  .all-tags-page { padding: 20px 12px; }
  .all-tags-page__header { gap: 12px; }
  .all-tags-page__heading h1 { font-size: 26px; }
}
</style>
