<template>
  <div
    class="editing-group-header"
    :class="{
      'editing-group-header--collapsible': collapsible,
      'editing-group-header--collapsed': collapsible && collapsed,
    }"
    @click="toggle"
  >
    <v-icon
      v-if="collapsible"
      size="18"
      class="editing-group-header__chevron"
      icon="mdi-chevron-down"
      aria-hidden="true"
    />
    <v-icon v-if="icon" size="18" class="editing-group-header__icon" :icon="icon" />
    <span
      class="editing-group-header__title"
      :role="collapsible ? 'button' : undefined"
      :tabindex="collapsible ? 0 : undefined"
      :aria-expanded="collapsible ? !collapsed : undefined"
      @keydown.enter.self.prevent="toggle"
      @keydown.space.self.prevent="toggle"
    >{{ title }}</span>
    <span
      v-if="total"
      class="editing-group-header__count"
      :class="{'editing-group-header__count--done': filled === total}"
    >{{ filled }}/{{ total }}</span>
    <span v-if="$slots.lead" class="editing-group-header__lead" @click.stop>
      <slot name="lead" />
    </span>
    <span class="editing-group-header__line" aria-hidden="true" />
    <span v-if="$slots.actions" class="editing-group-header__actions" @click.stop>
      <slot name="actions" />
    </span>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  title: string
  icon?: string
  filled?: number
  total?: number
  /** Header toggles its section; the parent hides the content. */
  collapsible?: boolean
  collapsed?: boolean
}>()

const emit = defineEmits<{'update:collapsed': [value: boolean]}>()

function toggle() {
  if (!props.collapsible) return
  emit('update:collapsed', !props.collapsed)
}
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

  &__chevron {
    opacity: 0.6;
    transition: transform 0.18s ease;
  }

  &--collapsed &__chevron {
    transform: rotate(-90deg);
  }

  &--collapsible {
    cursor: pointer;
    user-select: none;

    &:hover .editing-group-header__title {
      opacity: 1;
    }
  }

  &__title {
    font-size: 0.8125rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    opacity: 0.75;
    white-space: nowrap;

    &:focus-visible {
      outline: 2px solid rgb(var(--v-theme-primary));
      outline-offset: 2px;
      border-radius: 4px;
    }
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

  // Keeps slotted actions as direct flex items of the header (layout of existing usages unchanged).
  &__actions {
    display: contents;
  }

  // Controls placed right after the title (before the divider line); clicks must not fold the section.
  &__lead {
    display: contents;
  }
}
</style>
