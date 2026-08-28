<template>
  <div id="settings-default-tag-category" class="settings-default-tag-category">
    <div class="settings-default-tag-category__copy">
      <div class="text-body-1 text-high-emphasis">
        {{ t('settings_labels.library.default_tag_category') }}
      </div>
      <div class="text-caption text-medium-emphasis mt-1">
        {{ t('settings_labels.library.default_tag_category_hint') }}
      </div>
    </div>

    <v-autocomplete
      v-model="selectedMeta"
      class="settings-default-tag-category__field"
      :items="arrayMetas"
      item-value="id"
      item-title="name"
      :placeholder="t('settings_labels.library.default_tag_category_placeholder')"
      return-object
      variant="outlined"
      rounded
      density="compact"
      hide-details
      @update:model-value="onMetaChange"
    >
      <template #selection="{ item }">
        <v-icon start size="18">mdi-{{ item.raw.icon || 'tag-multiple-outline' }}</v-icon>
        <span class="text-truncate">{{ item.raw.name }}</span>
      </template>
      <template #item="{ item, props: itemProps }">
        <v-list-item v-bind="itemProps" :title="item.raw.pickerTitle || item.raw.name">
          <template #title>
            <v-icon start size="18">mdi-{{ item.raw.icon || 'tag-multiple-outline' }}</v-icon>
            <span>{{ item.raw.pickerTitle || item.raw.name }}</span>
          </template>
        </v-list-item>
      </template>
    </v-autocomplete>
  </div>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {useSettingsStore} from '@/stores/settings'
import {setOption} from '@/services/settingsService'
import {getDefaultTagCategoryId} from '@/services/ensureStarterMeta'
import {leafCategoryOptions} from '@/utils/tagCategoryTree'
import type {Meta} from '@/types/stores'

const {t} = useI18n()
const appStore = useAppStore()
const settingsStore = useSettingsStore()

const selectedMeta = ref<Meta | null>(null)

const arrayMetas = computed(() =>
  leafCategoryOptions(appStore.meta || []),
)

function syncFromSettings() {
  const resolvedId = getDefaultTagCategoryId(
    appStore.meta,
    settingsStore.defaultTagCategoryId,
  )
  selectedMeta.value = arrayMetas.value.find((meta) => Number(meta.id) === resolvedId) || null
}

function onMetaChange(meta: Meta | null) {
  if (!meta?.id) {
    syncFromSettings()
    return
  }
  selectedMeta.value = meta
  void setOption(String(meta.id), 'defaultTagCategoryId')
}

watch(
  [() => settingsStore.defaultTagCategoryId, arrayMetas],
  () => syncFromSettings(),
  {immediate: true},
)
</script>

<style scoped>
.settings-default-tag-category {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.settings-default-tag-category__copy {
  min-width: 0;
  flex: 1 1 auto;
}

.settings-default-tag-category__field {
  flex: 0 0 42%;
  max-width: 280px;
  min-width: 180px;
}

@media (max-width: 720px) {
  .settings-default-tag-category {
    flex-direction: column;
    align-items: stretch;
  }

  .settings-default-tag-category__field {
    flex: 1 1 auto;
    max-width: none;
    min-width: 0;
  }
}
</style>
