<script setup lang="ts">
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {highlightSettingsMatch, settingsMatchContext, searchSettings, type SettingsSearchItem} from '@/utils/settingsNavigation'

const props = withDefaults(defineProps<{items: SettingsSearchItem[]; inputId?: string; placeholder?: string}>(), {inputId: 'settings-search'})
const emit = defineEmits<{select: [item: SettingsSearchItem]}>()
const {t} = useI18n()
const query = ref('')
const menuOpen = ref(false)
const results = computed(() => searchSettings(props.items, query.value || ''))
function matchContext(item: SettingsSearchItem) { return settingsMatchContext(item, query.value || '') }
function parts(text: string) { return highlightSettingsMatch(text, query.value || '') }
function select(item: SettingsSearchItem) {
  emit('select', item)
  query.value = ''
  menuOpen.value = false
}
</script>
<template>
  <div class="settings-search">
    <v-menu :transition="false" v-model="menuOpen" :open-on-click="false" :close-on-content-click="false"
      :disabled="!query?.trim()" location="bottom start" :offset="8" :min-width="320" :max-width="440">
      <template #activator="{props: activatorProps}">
        <v-text-field
          v-bind="activatorProps"
          :id="inputId" v-model="query" :placeholder="placeholder || t('settingsLayout.search')" :aria-label="placeholder || t('settingsLayout.search')"
          prepend-inner-icon="mdi-magnify" variant="outlined" density="compact" rounded="pill"
          clearable hide-details autocomplete="off"
          @focus="menuOpen = !!query?.trim()"
          @update:model-value="menuOpen = !!query?.trim()"
          @click:clear="query = ''; menuOpen = false"
          @keydown.enter.prevent="results[0] && select(results[0])"
          @keydown.esc="query = ''; menuOpen = false"
        />
      </template>
      <div v-if="query?.trim()" class="settings-search__results" aria-live="polite">
        <div class="settings-search__count">{{ t('settingsLayout.search_count', {count: results.length}) }}</div>
        <v-list v-if="results.length" density="compact" :aria-label="t('settingsLayout.search_results')">
          <v-list-item v-for="item in results" :key="`${item.tab}:${item.section}`" @click="select(item)">
            <v-list-item-title>
              <template v-for="(part, index) in parts(item.title)" :key="index"><mark v-if="part.matched">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template>
            </v-list-item-title>
            <v-list-item-subtitle>
              <template v-for="(part, index) in parts(item.category)" :key="index"><mark v-if="part.matched">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template>
            </v-list-item-subtitle>
            <p v-if="matchContext(item)" class="settings-search__context">
              <template v-for="(part, index) in parts(matchContext(item))" :key="index"><mark v-if="part.matched">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template>
            </p>
          </v-list-item>
        </v-list>
        <p v-else class="text-body-2 pa-3">{{ t('settingsLayout.search_empty') }}</p>
      </div>
    </v-menu>
  </div>
</template>
<style scoped>
.settings-search { margin-bottom: 16px; }
.settings-search__results {
  max-height: min(480px, 60vh);
  overflow-y: auto;
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), .12);
  border-radius: 16px;
}
.settings-search__count { padding: 12px 16px 8px; font-size: .75rem; color: rgba(var(--v-theme-on-surface), .6); }
.settings-search__results :deep(.v-list) { background: transparent; padding: 0 4px 4px; }
.settings-search__results :deep(.v-list-item) { border-radius: 10px; margin-bottom: 2px; padding-block: 10px; }
.settings-search__results :deep(.v-list-item-title) { white-space: normal; font-size: .875rem; font-weight: 600; }
.settings-search__results :deep(.v-list-item-subtitle) { font-size: .75rem; margin-top: 3px; }
.settings-search__context { margin: 6px 0 0; font-size: .75rem; line-height: 1.5; color: rgba(var(--v-theme-on-surface), .7); display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.settings-search__results mark { background: rgba(var(--v-theme-primary), .16); color: rgb(var(--v-theme-primary)); border-radius: 3px; font-weight: 600; }
</style>
