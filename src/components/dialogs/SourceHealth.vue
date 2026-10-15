<template>
  <div v-if="failed || state === 'disconnected'" class="source-health" role="status" aria-live="polite">
    <div class="d-flex flex-wrap align-center ga-2">
      <v-icon size="18" :icon="icon" :color="state === 'ready' ? 'success' : failed ? 'warning' : undefined" />
      <span class="text-body-2">{{ t(`sources.states.${state}`) }}</span>
      <v-btn v-if="state === 'auth_required' || state === 'disconnected'" size="small" variant="tonal" color="primary" :disabled="disabled" @click="$emit('reconnect')">{{ t('sources.reconnect') }}</v-btn>
    </div>
    <p v-if="failed" class="text-body-2 mt-1 mb-2">{{ t(`sources.help.${state}`) }}</p>
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
<style scoped>.source-health { margin-bottom: 12px; }</style>
