<template>
  <nav class="settings-nav" aria-label="Settings sections">
    <v-list
      v-model:selected="selected"
      color="primary"
      density="comfortable"
      :lines="compact ? 'one' : 'two'"
      nav
      class="settings-nav__list"
      :class="{'settings-nav__list--compact': compact}"
    >
      <v-list-item
        v-for="item in items"
        :key="item.value"
        :id="item.docId"
        :value="item.value"
        :prepend-icon="item.icon"
        :slim="compact"
        class="settings-nav__item"
      >
        <v-list-item-title>{{ t(item.labelKey) }}</v-list-item-title>
        <v-list-item-subtitle v-if="!compact" class="settings-nav__subtitle">
          {{ t(item.descKey) }}
        </v-list-item-subtitle>
      </v-list-item>
    </v-list>
  </nav>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {useDisplay} from 'vuetify'

export interface SettingsNavItem {
  value: string
  icon: string
  labelKey: string
  descKey: string
  docId?: string
}

const props = defineProps<{
  modelValue: string
  items: SettingsNavItem[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const {t} = useI18n()
const {smAndDown} = useDisplay()

const compact = computed(() => smAndDown.value)

const selected = computed({
  get: () => [props.modelValue],
  set: (value: string[]) => {
    const next = value[0]
    if (next && next !== props.modelValue) {
      emit('update:modelValue', next)
    }
  },
})
</script>

<style scoped>
.settings-nav__list {
  background: transparent;
  padding: 0;
}

.settings-nav__item {
  margin-bottom: 6px;
  border-radius: 10px;
  min-height: 64px;
  align-items: center;
  padding-block: 10px;
}

.settings-nav__item :deep(.v-list-item__overlay),
.settings-nav__item :deep(.v-list-item__underlay) {
  border-radius: 10px;
}

.settings-nav__item :deep(.v-list-item__prepend),
.settings-nav__item.v-list-item--two-line :deep(.v-list-item__prepend),
.settings-nav__item.v-list-item--three-line :deep(.v-list-item__prepend) {
  margin-top: 0 !important;
  padding-top: 0 !important;
  align-self: center !important;
}

.settings-nav__item :deep(.v-list-item-title) {
  font-weight: 400;
  line-height: 1.3;
  margin-bottom: 2px;
}

.settings-nav__subtitle {
  white-space: normal;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  line-height: 1.35;
  opacity: 0.72;
}

.settings-nav__list--compact {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
  scrollbar-width: thin;
}

.settings-nav__list--compact .settings-nav__item {
  --v-list-prepend-gap: 8px;
  flex: 0 0 auto;
  display: grid !important;
  grid-template-areas: "prepend content" !important;
  grid-template-columns: max-content max-content !important;
  grid-template-rows: auto !important;
  justify-content: center;
  justify-items: center;
  align-items: center;
  width: max-content !important;
  max-width: none;
  margin-bottom: 0;
  min-width: 0;
  min-height: 40px !important;
  height: auto;
  padding-block: 8px !important;
  padding-inline: 12px !important;
}

.settings-nav__list--compact .settings-nav__item :deep(.v-list-item__prepend) {
  grid-area: prepend;
  align-self: center !important;
  margin: 0;
  padding: 0;
  width: auto;
  max-width: none;
}

.settings-nav__list--compact .settings-nav__item :deep(.v-list-item__prepend > .v-icon) {
  margin: 0;
  opacity: 1;
}

.settings-nav__list--compact .settings-nav__item :deep(.v-list-item__spacer) {
  width: var(--v-list-prepend-gap, 8px) !important;
}

.settings-nav__list--compact .settings-nav__item :deep(.v-list-item__content) {
  grid-area: content;
  flex: none !important;
  width: max-content !important;
  min-width: 0 !important;
  max-width: none;
  overflow: visible;
  white-space: nowrap;
  padding: 0;
  align-self: center !important;
  text-align: start;
}

.settings-nav__list--compact .settings-nav__item :deep(.v-list-item-title) {
  margin: 0;
  overflow: visible;
  text-overflow: unset;
  white-space: nowrap;
}
</style>
