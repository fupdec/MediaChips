<template>
  <div
    :id="id"
    class="health-task"
    :class="{
      'health-task--done': status === 'done',
      'health-task--pending': status === 'pending',
      'health-task--optional': status === 'optional',
      'health-task--compact': compact,
    }"
  >
    <div class="health-task__rail" aria-hidden="true"/>
    <div class="health-task__body">
      <slot/>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  id?: string
  status?: 'done' | 'pending' | 'optional' | 'idle' | null
  compact?: boolean
}>(), {
  id: undefined,
  status: null,
  compact: false,
})
</script>

<style scoped lang="scss">
.health-task {
  position: relative;
  display: flex;
  gap: 0;
  border-radius: 18px;
  overflow: hidden;
  background:
    linear-gradient(
      135deg,
      rgba(var(--v-theme-primary), 0.06) 0%,
      rgba(var(--v-theme-surface), 0) 42%
    ),
    rgba(var(--v-theme-on-surface), 0.02);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}

.health-task--pending {
  background:
    linear-gradient(
      135deg,
      rgba(var(--v-theme-warning), 0.08) 0%,
      rgba(var(--v-theme-surface), 0) 46%
    ),
    rgba(var(--v-theme-on-surface), 0.02);
  border-color: rgba(var(--v-theme-warning), 0.16);
}

.health-task--done {
  background:
    linear-gradient(
      135deg,
      rgba(var(--v-theme-success), 0.07) 0%,
      rgba(var(--v-theme-surface), 0) 46%
    ),
    rgba(var(--v-theme-on-surface), 0.015);
  border-color: rgba(var(--v-theme-success), 0.14);
}

.health-task--optional {
  border-style: dashed;
  border-color: rgba(var(--v-theme-primary), 0.28);
}

.health-task__rail {
  flex: 0 0 4px;
  background: linear-gradient(
    180deg,
    rgb(var(--v-theme-primary)),
    rgba(var(--v-theme-primary), 0.25)
  );
}

.health-task--pending .health-task__rail {
  background: linear-gradient(
    180deg,
    rgb(var(--v-theme-warning)),
    rgba(var(--v-theme-warning), 0.25)
  );
}

.health-task--done .health-task__rail {
  background: linear-gradient(
    180deg,
    rgb(var(--v-theme-success)),
    rgba(var(--v-theme-success), 0.25)
  );
}

.health-task--optional .health-task__rail {
  background: repeating-linear-gradient(
    180deg,
    rgba(var(--v-theme-primary), 0.55) 0 6px,
    transparent 6px 12px
  );
}

.health-task__body {
  flex: 1 1 auto;
  min-width: 0;
  padding: 16px 16px 16px 14px;
}

.health-task--compact .health-task__body {
  padding: 14px 14px 14px 12px;
}
</style>
