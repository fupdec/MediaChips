<template>
  <div class="storage-summary">
    <span class="storage-summary__count" :title="label" :aria-label="`${label}: ${count}`">
      <v-icon :icon="icon" size="16" aria-hidden="true"/>
      <span>{{ count }}</span>
    </span>
    <span class="storage-summary__divider" aria-hidden="true"/>
    <span class="storage-summary__size">
      <v-icon icon="mdi-harddisk" size="15" aria-hidden="true"/>
      {{ size }}
    </span>
  </div>
</template>

<script setup lang="ts">
defineProps<{count: number; size: string; label: string; icon: string}>()
</script>

<style scoped>
.storage-summary {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  min-height: 34px;
  padding: 6px 12px;
  border: 1px solid rgba(var(--v-theme-primary), .12);
  border-radius: 999px;
  background: rgba(var(--v-theme-surface), .6);
  font-size: .75rem;
  line-height: 1.4;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.storage-summary__count,
.storage-summary__size {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.storage-summary__count { color: rgb(var(--v-theme-primary)); }
.storage-summary__size { color: rgba(var(--v-theme-on-surface), .65); }
.storage-summary__size .v-icon { opacity: .7; }
.storage-summary__divider {
  width: 1px;
  height: 14px;
  background: rgba(var(--v-theme-on-surface), .12);
}
</style>
