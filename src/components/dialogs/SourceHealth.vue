<template>
  <div v-if="failed || state === 'disconnected'" class="source-health" :class="{'source-health--warning': failed}" role="status" aria-live="polite">
    <v-icon class="source-health__icon" size="18" :icon="icon" aria-hidden="true" />
    <div class="source-health__content">
      <div class="source-health__title">{{ t(`sources.states.${state}`) }}</div>
      <p v-if="failed" class="source-health__description">{{ t(`sources.help.${state}`) }}</p>
    </div>
    <v-btn v-if="state === 'auth_required' || state === 'disconnected'" class="source-health__action" size="x-small" variant="tonal" color="primary" :disabled="disabled" @click="$emit('reconnect')">{{ t('sources.reconnect') }}</v-btn>
  </div>
</template>
<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import type {SourceFailure} from '@shared/sourceErrors'
const props = defineProps<{state: SourceFailure | 'ready' | 'unchecked' | 'disconnected' | 'unknown'; disabled?: boolean}>()
defineEmits<{reconnect: []}>()
const {t} = useI18n()
const failed = computed(() => !['ready', 'unchecked', 'disconnected'].includes(props.state))
const icon = computed(() => ({ready: 'mdi-check-circle-outline', unchecked: 'mdi-help-circle-outline', disconnected: 'mdi-lan-disconnect',
  network_error: 'mdi-wifi-off', permission_denied: 'mdi-lock-outline', auth_required: 'mdi-login', unknown: 'mdi-alert-circle-outline'}[props.state]))
</script>
<style scoped>
.source-health {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 8px 0 12px;
  padding: 10px 12px;
  border: 1px solid rgba(var(--v-theme-on-surface), .1);
  border-radius: 12px;
  background: rgba(var(--v-theme-on-surface), .03);
}
.source-health--warning {
  border-color: rgba(var(--v-theme-warning), .22);
  background: rgba(var(--v-theme-warning), .06);
}
.source-health__icon {
  flex-shrink: 0;
  margin-top: 1px;
  color: rgba(var(--v-theme-on-surface), .55);
}
.source-health--warning .source-health__icon { color: rgb(var(--v-theme-warning)); }
.source-health__content { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.source-health__title { font-size: .75rem; font-weight: 600; line-height: 1.5; }
.source-health__description {
  margin: 2px 0 0;
  font-size: .6875rem;
  line-height: 1.6;
  color: rgba(var(--v-theme-on-surface), .68);
}
.source-health__action { flex-shrink: 0; letter-spacing: 0; text-transform: none; }
@media (max-width: 599px) {
  .source-health { flex-wrap: wrap; }
  .source-health__content { flex-basis: calc(100% - 26px); }
  .source-health__action { margin-inline-start: 26px; }
}
</style>
