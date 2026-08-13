<template>
  <section v-if="items.length || loading" class="home-media-row mb-6">
    <div class="d-flex align-center justify-space-between mb-3">
      <div class="d-flex align-center text-h6">
        <v-icon class="mr-2" size="24">{{ icon }}</v-icon>
        <span>{{ title }}</span>
      </div>

      <div class="d-flex align-center ga-1">
        <v-btn
          v-if="showShuffle && items.length"
          @click="emit('shuffle')"
          :loading="shuffleLoading"
          color="primary"
          icon
          size="small"
          variant="text"
          :title="t('home.widgets.reshuffle')"
        >
          <v-icon>mdi-shuffle</v-icon>
        </v-btn>

        <v-btn
          v-if="showViewAll && items.length"
          @click="emit('view-all')"
          color="primary"
          variant="text"
          rounded
          size="small"
        >
          {{ t('home.widgets.view_all') }}
          <v-icon end size="18">mdi-chevron-right</v-icon>
        </v-btn>
      </div>
    </div>

    <div v-if="items.length" class="home-media-row__scroll">
      <WidgetMediaCard
        v-for="item in items"
        :key="item.id"
        :item="item"
        :thumb="item.thumb"
        :variant="variant"
        @click="emit('open', item)"
      />
    </div>

    <div
      v-else
      class="home-media-row__scroll"
      aria-hidden="true"
    >
      <div
        v-for="index in 4"
        :key="index"
        class="home-media-row__skeleton"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import WidgetMediaCard from '@/components/widgets/WidgetMediaCard.vue'
import type {HomeMediaCardVariant, HomeMediaItem} from '@/types/widgets'

withDefaults(defineProps<{
  title: string
  icon?: string
  items?: HomeMediaItem[]
  variant?: HomeMediaCardVariant
  showViewAll?: boolean
  /** Parent must reload a meaningful new sample (not local reorder). */
  showShuffle?: boolean
  shuffleLoading?: boolean
  loading?: boolean
}>(), {
  icon: 'mdi-play-circle-outline',
  items: () => [],
  variant: 'views',
  showViewAll: true,
  showShuffle: false,
  shuffleLoading: false,
  loading: false,
})

const emit = defineEmits<{
  open: [item: HomeMediaItem]
  'view-all': []
  shuffle: []
}>()
const {t} = useI18n()
</script>

<style lang="scss" scoped>
.home-media-row {
  &__scroll {
    display: flex;
    align-items: stretch;
    gap: 12px;
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 2px;
    scroll-snap-type: x proximity;
    -webkit-overflow-scrolling: touch;

    & > * {
      scroll-snap-align: start;
    }
  }

  &__skeleton {
    width: 148px;
    flex: 0 0 148px;
    align-self: stretch;
    min-height: 148px;
    border-radius: 8px;
    border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
    background: rgba(var(--v-theme-on-surface), 0.06);
  }
}
</style>
