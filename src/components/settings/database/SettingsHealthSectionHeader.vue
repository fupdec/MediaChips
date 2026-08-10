<template>
  <div
    class="health-section-header"
    :class="{
      'health-section-header--compact': compact,
      'health-section-header--done': status === 'done',
      'health-section-header--pending': status === 'pending',
      'health-section-header--optional': status === 'optional',
    }"
  >
    <div v-if="step != null" class="health-section-header__step">
      <v-icon v-if="status === 'done'" size="16">mdi-check</v-icon>
      <span v-else>{{ step }}</span>
    </div>

    <div class="health-section-header__icon" aria-hidden="true">
      <v-icon size="22">{{ iconName }}</v-icon>
    </div>

    <div class="health-section-header__text">
      <div class="health-section-header__title-row">
        <span class="health-section-header__title">{{ title }}</span>
        <v-chip
          v-if="statusChip"
          size="x-small"
          :color="statusChip.color"
          variant="tonal"
          class="health-section-header__chip"
        >
          {{ statusChip.label }}
        </v-chip>
        <slot name="actions"/>
      </div>
      <p v-if="hint" class="health-section-header__hint">{{ hint }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'

const props = withDefaults(defineProps<{
  title: string
  icon: string
  hint?: string
  step?: number | null
  status?: 'done' | 'pending' | 'optional' | 'idle' | null
  statusLabel?: string
  compact?: boolean
}>(), {
  hint: undefined,
  step: null,
  status: null,
  statusLabel: undefined,
  compact: false,
})

const {t} = useI18n()

const iconName = computed(() =>
  props.icon.startsWith('mdi-') ? props.icon : `mdi-${props.icon}`,
)

const statusChip = computed(() => {
  if (!props.status || props.status === 'idle') return null
  if (props.status === 'done') {
    return {
      color: 'success',
      label: props.statusLabel || t('settings_labels.database.health_guide_done'),
    }
  }
  if (props.status === 'optional') {
    return {
      color: 'primary',
      label: props.statusLabel || t('settings_labels.database.health_guide_optional'),
    }
  }
  return {
    color: 'warning',
    label: props.statusLabel || t('settings_labels.database.health_guide_needs_work'),
  }
})
</script>

<style scoped lang="scss">
.health-section-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 16px;
}

.health-section-header--compact {
  margin-bottom: 12px;
}

.health-section-header__step {
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
  margin-top: 2px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: rgb(var(--v-theme-on-primary));
  background: rgb(var(--v-theme-primary));
  box-shadow: 0 0 0 4px rgba(var(--v-theme-primary), 0.12);
}

.health-section-header--done .health-section-header__step {
  background: rgb(var(--v-theme-success));
  box-shadow: 0 0 0 4px rgba(var(--v-theme-success), 0.14);
  color: rgb(var(--v-theme-on-success));
}

.health-section-header--optional .health-section-header__step {
  background: transparent;
  color: rgb(var(--v-theme-primary));
  border: 1.5px dashed rgba(var(--v-theme-primary), 0.55);
  box-shadow: none;
}

.health-section-header__icon {
  flex: 0 0 42px;
  width: 42px;
  height: 42px;
  border-radius: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgb(var(--v-theme-primary));
  background:
    linear-gradient(145deg, rgba(var(--v-theme-primary), 0.18), rgba(var(--v-theme-primary), 0.05));
  border: 1px solid rgba(var(--v-theme-primary), 0.16);
}

.health-section-header--done .health-section-header__icon {
  color: rgb(var(--v-theme-success));
  background:
    linear-gradient(145deg, rgba(var(--v-theme-success), 0.18), rgba(var(--v-theme-success), 0.05));
  border-color: rgba(var(--v-theme-success), 0.16);
}

.health-section-header--pending .health-section-header__icon {
  color: rgb(var(--v-theme-warning));
  background:
    linear-gradient(145deg, rgba(var(--v-theme-warning), 0.18), rgba(var(--v-theme-warning), 0.05));
  border-color: rgba(var(--v-theme-warning), 0.18);
}

.health-section-header__text {
  flex: 1 1 auto;
  min-width: 0;
}

.health-section-header__title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.health-section-header__title {
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1.3;
}

.health-section-header__chip {
  font-weight: 600;
}

.health-section-header__hint {
  margin: 6px 0 0;
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 0.8125rem;
  line-height: 1.45;
}
</style>
