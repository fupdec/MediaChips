<script setup lang="ts">
import {computed, nextTick, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {highlightSettingsMatch, settingsMatchContext, searchSettings, type SettingsSearchItem} from '@/utils/settingsNavigation'

const props = withDefaults(defineProps<{items: SettingsSearchItem[]; inputId?: string; placeholder?: string}>(), {inputId: 'settings-search'})
const emit = defineEmits<{select: [item: SettingsSearchItem]}>()
const {t} = useI18n()
const query = ref<string | null>('')
const menuOpen = ref(false)
const results = computed(() => searchSettings(props.items, query.value || ''))
const activeIndex = ref(0)
const listId = computed(() => `${props.inputId}-results`)
const activeResult = computed(() => results.value[activeIndex.value] ?? results.value[0])
const activeId = computed(() => menuOpen.value && activeResult.value
  ? `${listId.value}-${results.value.indexOf(activeResult.value)}`
  : undefined)

function updateQuery(value: string | null) {
  activeIndex.value = 0
  menuOpen.value = !!value?.trim()
}

async function moveSelection(direction: number) {
  if (!results.value.length) return
  const lastIndex = results.value.length - 1
  activeIndex.value = menuOpen.value
    ? Math.max(0, Math.min(lastIndex, results.value.indexOf(activeResult.value!) + direction))
    : direction > 0 ? 0 : lastIndex
  menuOpen.value = true
  await nextTick()
  if (activeId.value) document.getElementById(activeId.value)?.scrollIntoView({block: 'nearest'})
}

function matchContext(item: SettingsSearchItem) { return settingsMatchContext(item, query.value || '') }
function parts(text: string) { return highlightSettingsMatch(text, query.value || '') }
function confirmSelection(event: KeyboardEvent) {
  if (event.isComposing || !menuOpen.value || !activeResult.value) return
  event.preventDefault()
  select(activeResult.value)
}

function select(item: SettingsSearchItem) {
  emit('select', item)
  query.value = ''
  menuOpen.value = false
}
</script>
<template>
  <div class="settings-search">
    <v-overlay v-model="menuOpen" :scrim="false" :transition="false" :open-on-click="false"
      location-strategy="connected" scroll-strategy="reposition"
      :disabled="!query?.trim()" location="bottom start" :offset="8" :width="480" max-width="calc(100vw - 24px)">
      <template #activator="{props: activatorProps}">
        <v-text-field
          v-bind="activatorProps"
          :id="inputId" v-model="query" :placeholder="placeholder || t('settingsLayout.search')" :aria-label="placeholder || t('settingsLayout.search')"
          prepend-inner-icon="mdi-magnify" variant="outlined" density="compact" rounded="pill"
          clearable hide-details autocomplete="off"
          role="combobox" aria-autocomplete="list" aria-haspopup="listbox"
          :aria-expanded="menuOpen" :aria-controls="menuOpen ? listId : undefined" :aria-activedescendant="activeId"
          @focus="menuOpen = !!query?.trim()"
          @update:model-value="updateQuery"
          @keydown.down.stop.prevent="moveSelection(1)"
          @keydown.up.stop.prevent="moveSelection(-1)"
          @keydown.enter="confirmSelection"
          @keydown.tab="menuOpen = false"
          @keydown.esc.stop="menuOpen = false"
        />
      </template>
      <div v-if="query?.trim()" class="settings-search__results">
        <div class="settings-search__count" role="status">{{ t('settingsLayout.search_count', {count: results.length}) }}</div>
        <div :id="listId" class="settings-search__list" role="listbox" :aria-label="t('settingsLayout.search_results')">
          <button
            v-for="(item, index) in results" :id="`${listId}-${index}`" :key="`${item.tab}:${item.section}`"
            type="button" role="option" tabindex="-1" :aria-selected="item === activeResult"
            class="settings-search__result" @mousedown.prevent @click="select(item)"
          >
            <span class="settings-search__heading">
              <span class="settings-search__label settings-search__category" :title="item.category">
                <v-icon v-if="item.categoryIcon" :icon="item.categoryIcon" size="14" class="me-1" aria-hidden="true"/>
                <span><template v-for="(part, index) in parts(item.category)" :key="index"><mark v-if="part.matched">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></span>
              </span>
              <span class="settings-search__category">·</span>
              <span class="settings-search__label" :title="item.title">
                <v-icon v-if="item.sectionIcon" :icon="item.sectionIcon" size="16" class="me-1" aria-hidden="true"/>
                <span><template v-for="(part, index) in parts(item.title)" :key="index"><mark v-if="part.matched">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></span>
              </span>
            </span>
            <span v-if="matchContext(item)" class="settings-search__context" :title="matchContext(item)">
              <template v-for="(part, index) in parts(matchContext(item))" :key="index"><mark v-if="part.matched">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template>
            </span>
          </button>
        </div>
        <p v-if="!results.length" class="text-body-2 px-4 pb-4">{{ t('settingsLayout.search_empty') }}</p>
      </div>
    </v-overlay>
  </div>
</template>
<style scoped>
.settings-search { margin-bottom: 16px; }
.settings-search__results {
  max-height: min(480px, 60vh);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding-bottom: 6px;
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), .12);
  border-radius: 16px;
  box-shadow: 0 8px 28px rgba(var(--v-theme-on-surface), .14);
}
.settings-search__count { padding: 12px 16px 8px; font-size: .75rem; color: rgba(var(--v-theme-on-surface), .6); }
.settings-search__list { overflow-y: auto; overscroll-behavior: contain; padding-inline: 6px; }
.settings-search__list:empty { display: none; }
.settings-search__result {
  display: block;
  width: 100%;
  padding: 10px 12px;
  border-radius: 10px;
  text-align: start;
  font-size: .875rem;
  font-weight: 600;
}
.settings-search__result + .settings-search__result { margin-top: 2px; }
.settings-search__result:hover { background: rgba(var(--v-theme-on-surface), .06); }
.settings-search__result[aria-selected="true"] {
  background: rgba(var(--v-theme-primary), .10);
  box-shadow: inset 0 0 0 1px rgba(var(--v-theme-primary), .24);
}
.settings-search__heading { display: flex; align-items: center; gap: 6px; }
.settings-search__category { color: rgba(var(--v-theme-on-surface), .7); font-weight: 500; }
.settings-search__label { display: inline-flex; align-items: center; min-width: 0; }
.settings-search__label > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.settings-search__context { display: block; margin: 6px 0 0; font-size: .75rem; font-weight: 400; line-height: 1.5; color: rgba(var(--v-theme-on-surface), .7); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.settings-search__results mark { background: rgba(var(--v-theme-primary), .16); color: rgb(var(--v-theme-primary)); border-radius: 3px; font-weight: 600; }
</style>
