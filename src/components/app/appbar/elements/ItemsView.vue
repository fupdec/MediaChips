<template>
  <div
    v-if="dense"
    class="items-view-track"
  >
    <button
      v-for="(item, index) in viewOptions"
      :key="index"
      type="button"
      class="items-view-opt"
      :class="{'items-view-opt--active': currentView == item.val}"
      @click="updateView(item.val)"
    >
      <v-icon size="15">mdi-{{ item.icon }}</v-icon>
      <span>{{ t(item.textKey) }}</span>
    </button>
  </div>
  <v-chip-group
    v-else
    column
  >
    <v-chip
      v-for="(item, index) in viewOptions"
      @click="updateView(item.val)"
      :key="index"
      :variant="currentView == item.val ? 'flat' : 'outlined'"
      base-color="primary"
    >
      <v-icon start>mdi-{{ item.icon }}</v-icon>
      {{ t(item.textKey) }}
    </v-chip>
  </v-chip-group>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useItemsStore } from '@/stores/items'
import { useAppStore } from '@/stores/app'
import { getCurrentMediaType, isVideoMediaType, isImageMediaType } from '@/utils/mediaType'
import { normalizeItemsView } from '@/utils/itemsView'
import { useItemsPageCommands } from '@/composable/itemsPageCommands'

const pageCommands = useItemsPageCommands()

defineProps({
  dense: {
    type: Boolean,
    default: false,
  },
})

// Store
const itemsStore = useItemsStore()
const appStore = useAppStore()
const {t} = useI18n()

// State
const viewOptions = ref<Array<{ val: number; icon: string; textKey: string }>>([
  {
    val: 1,
    icon: "view-module",
    textKey: "items.view.card",
  }
])

// Computed
const currentView = computed(() => itemsStore.view || 1)

const currentMediaType = computed(() => {
  if (itemsStore.type !== 'media') return null
  return getCurrentMediaType(appStore.mediaTypes, itemsStore.environment?.media_type_id)
})

// Methods
const initViewOptions = () => {
  // Сбрасываем к базовому варианту
  viewOptions.value = [
    {
      val: 1,
      icon: "view-module",
      textKey: "items.view.card",
    }
  ]

  // Таймлайн доступен только для видео
  if (itemsStore.type === 'media' && isVideoMediaType(currentMediaType.value)) {
    viewOptions.value.push({
      val: 2,
      icon: "view-sequential",
      textKey: "items.view.timeline",
    })
    viewOptions.value.push({
      val: 4,
      icon: 'view-compact-outline',
      textKey: 'items.view.minimal',
    })
  } else if (itemsStore.type === 'media' && isImageMediaType(currentMediaType.value)) {
    viewOptions.value.push({
      val: 3,
      icon: 'view-dashboard',
      textKey: 'items.view.masonry',
    })
  } else if (itemsStore.type === 'tag') {
    viewOptions.value.push({
      val: 2,
      icon: "format-line-style",
      textKey: "items.view.chip",
    })
    viewOptions.value.push({
      val: 4,
      icon: 'view-compact-outline',
      textKey: 'items.view.minimal',
    })
  }

  const normalizedView = normalizeItemsView(
    currentView.value,
    itemsStore.type === 'tag' ? 'tag' : 'media',
    currentMediaType.value,
  )
  if (normalizedView !== currentView.value) {
    updateView(normalizedView)
  }
}

const updateView = (val: number) => {
  // Обновляем в хранилище
  itemsStore.updateState({ key: 'view', value: val })

  pageCommands.setView(val)

  // Или отправляем кастомное событие
  const viewChangedEvent = new CustomEvent('items-view-changed', {
    detail: { view: val }
  })
  window.dispatchEvent(viewChangedEvent)
}

// Lifecycle
onMounted(() => {
  initViewOptions()
})

// Watchers
watch(() => itemsStore.type, () => {
  initViewOptions()
})

watch(
  () => [itemsStore.environment?.media_type_id, appStore.mediaTypes],
  () => {
    initViewOptions()
  },
  {deep: true},
)
</script>

<style scoped lang="scss">
.items-view-track {
  display: inline-flex;
  align-items: center;
  width: max-content;
  max-width: 100%;
  gap: 2px;
  padding: 2px;
  border-radius: 999px;
  background: rgba(var(--v-theme-surface), 0.9);
  border: 1px solid rgba(var(--v-theme-primary), 0.12);
}

.items-view-opt {
  appearance: none;
  border: 0;
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  background: transparent;
  color: rgba(var(--v-theme-primary), 0.72);
  font: inherit;
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease;

  &:hover {
    background: rgba(var(--v-theme-primary), 0.08);
    color: rgb(var(--v-theme-primary));
  }

  &--active {
    background: rgb(var(--v-theme-primary));
    color: rgb(var(--v-theme-on-primary));

    &:hover {
      background: rgb(var(--v-theme-primary));
      color: rgb(var(--v-theme-on-primary));
    }
  }
}
</style>
