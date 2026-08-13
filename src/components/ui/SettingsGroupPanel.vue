<template>
  <section
    class="settings-group-panel"
    :class="{'settings-group-panel--spaced': spaced}"
  >
    <div
      v-if="title || hint || $slots.title || $slots.hint"
      class="settings-group-panel__heading"
    >
      <div
        v-if="title || $slots.title"
        class="settings-group-panel__title text-subtitle-2 text-high-emphasis"
      >
        <slot name="title">{{ title }}</slot>
      </div>
      <div
        v-if="hint || $slots.hint"
        class="settings-group-panel__hint text-caption text-medium-emphasis"
      >
        <slot name="hint">{{ hint }}</slot>
      </div>
    </div>

    <div class="settings-group-panel__body">
      <slot/>
    </div>
  </section>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  title?: string
  hint?: string
  /** Extra bottom margin when stacking panels. */
  spaced?: boolean
}>(), {
  spaced: true,
})
</script>

<style scoped>
.settings-group-panel {
  padding: 12px 14px;
  border-radius: 18px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background: rgba(var(--v-theme-surface), 0.55);
}

.settings-group-panel--spaced {
  margin-bottom: 12px;
}

.settings-group-panel--spaced:last-child {
  margin-bottom: 0;
}

.settings-group-panel__heading {
  margin-bottom: 8px;
}

.settings-group-panel__title {
  line-height: 1.3;
  letter-spacing: -0.01em;
}

.settings-group-panel__hint {
  margin-top: 2px;
  line-height: 1.35;
}

.settings-group-panel__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
</style>
