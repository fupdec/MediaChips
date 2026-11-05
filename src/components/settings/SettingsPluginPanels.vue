<script setup lang="ts">
import {defineAsyncComponent, type Component} from 'vue'
import type {PluginSettingsPanelContribution} from '@shared/plugins/types'
import {resolvePluginComponentLoader} from '@/services/pluginHost'
import SettingsSection from '@/components/ui/SettingsSection.vue'

defineProps<{panels: PluginSettingsPanelContribution[]}>()
const cache = new Map<string, Component>()
function resolveComponent(key: string): Component | null {
  const cached = cache.get(key)
  if (cached) return cached
  const loader = resolvePluginComponentLoader(key)
  if (!loader) return null
  const component = defineAsyncComponent(loader)
  cache.set(key, component)
  return component
}
</script>
<template>
  <SettingsSection v-for="panel in panels" :key="`${panel.pluginId}:${panel.componentKey}`" :id="panel.sectionId">
    <component :is="resolveComponent(panel.componentKey)"/>
  </SettingsSection>
</template>
