<template>
  <v-btn
    v-if="!isElectronHost"
    :color="color"
    :rounded="rounded"
    :size="size"
    :variant="variant"
    :icon="iconOnly"
    :loading="clearing"
    :block="block"
    :title="t('settings_labels.general.clear_app_cache_hint')"
    :aria-label="t('settings_labels.general.clear_app_cache')"
    @click="clearCache"
  >
    <v-icon
      icon="mdi-cached"
      :start="!iconOnly"
    />
    <span v-if="!iconOnly">{{ t('settings_labels.general.clear_app_cache') }}</span>
  </v-btn>
</template>

<script setup lang="ts">
import {ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {forceClearAppShellCache} from '@/services/registerPwa'

withDefaults(defineProps<{
  color?: string
  rounded?: boolean | string
  size?: string
  variant?: string
  iconOnly?: boolean
  block?: boolean
}>(), {
  color: 'secondary',
  rounded: true,
  size: 'small',
  variant: 'tonal',
  iconOnly: false,
  block: false,
})

const {t} = useI18n()
const clearing = ref(false)
const isElectronHost = Boolean(window.electronAPI)

async function clearCache() {
  if (clearing.value) return
  clearing.value = true
  try {
    await forceClearAppShellCache()
  } catch (error) {
    console.error('Failed to clear app shell cache:', error)
    clearing.value = false
  }
}
</script>
