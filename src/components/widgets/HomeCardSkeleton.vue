<template>
  <div
    class="home-card-skeleton"
    :class="[
      `home-card-skeleton--${variant}`,
      {'home-card-skeleton--seed': seed},
    ]"
    aria-hidden="true"
  >
    <div class="home-card-skeleton__preview">
      <v-skeleton-loader
        class="home-card-skeleton__image"
        type="image"
      />
    </div>
    <div class="home-card-skeleton__footer">
      <v-skeleton-loader
        class="home-card-skeleton__text"
        :type="textType"
        width="78%"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed} from 'vue'

const props = withDefaults(defineProps<{
  /** Matches home card geometries. */
  variant?: 'media' | 'tag' | 'marker'
  /** Highlight like the similar-seed card. */
  seed?: boolean
}>(), {
  variant: 'media',
  seed: false,
})

const textType = computed(() => (
  props.variant === 'marker' ? 'text@2' : 'text'
))
</script>

<style lang="scss" scoped>
.home-card-skeleton {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  background: transparent;
  box-sizing: border-box;

  &--seed {
    border-color: rgba(var(--v-theme-primary), 0.35);
  }

  &--media {
    width: 148px;
    flex: 0 0 148px;
  }

  &--tag {
    width: 104px;
    flex: 0 0 104px;
    border-radius: 12px;
  }

  &--marker {
    width: 168px;
    flex: 0 0 168px;
    border-radius: 12px;
  }

  &__preview {
    position: relative;
    width: 100%;
    flex: 0 0 auto;
    overflow: hidden;
  }

  &--media &__preview {
    aspect-ratio: 16 / 9;
  }

  &--tag &__preview {
    aspect-ratio: 3 / 4;
  }

  &--marker &__preview {
    aspect-ratio: 16 / 9;
  }

  &__image {
    width: 100%;
    height: 100%;
    background: transparent !important;

    :deep(.v-skeleton-loader__bone) {
      margin: 0;
      border-radius: 0;
      height: 100%;
    }
  }

  &__footer {
    flex: 0 0 auto;
    padding: 6px 8px;
    min-height: 36px;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  &--marker &__footer {
    min-height: 48px;
    padding: 8px;
  }

  &__text {
    background: transparent !important;
    padding: 0 !important;

    :deep(.v-skeleton-loader__bone) {
      margin-block: 4px;
    }
  }
}
</style>
