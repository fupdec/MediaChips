<template>
  <div class="settings-list">
    <slot/>
  </div>
</template>

<style scoped>
.settings-list {
  display: flex;
  flex-direction: column;
  gap: var(--settings-block-gap, 24px);
}

.settings-list > :slotted(*) {
  min-width: 0;
  max-width: 100%;
}
</style>
