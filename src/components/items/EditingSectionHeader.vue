<template>
  <div class="editing-group-header">
    <v-icon v-if="icon" size="18" class="editing-group-header__icon" :icon="icon" />
    <span class="editing-group-header__title">{{ title }}</span>
    <span
      v-if="total"
      class="editing-group-header__count"
      :class="{'editing-group-header__count--done': filled === total}"
    >{{ filled }}/{{ total }}</span>
    <span class="editing-group-header__line" aria-hidden="true" />
    <slot name="actions" />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  icon?: string
  filled?: number
  total?: number
}>()
</script>

<style lang="scss">
.editing-group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 12px 4px 2px;

  &:first-child {
    padding-top: 0;
  }

  &__icon {
    opacity: 0.6;
  }

  &__title {
    font-size: 0.8125rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    opacity: 0.75;
    white-space: nowrap;
  }

  &__count {
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    padding: 0 6px;
    border-radius: 999px;
    background: rgba(var(--v-theme-on-surface), 0.07);
    opacity: 0.8;

    &--done {
      background: rgba(var(--v-theme-success), 0.15);
      color: rgb(var(--v-theme-success));
      opacity: 1;
    }
  }

  &__line {
    flex: 1 1 auto;
    height: 1px;
    min-width: 12px;
    background: rgba(var(--v-border-color), var(--v-border-opacity));
  }
}
</style>
