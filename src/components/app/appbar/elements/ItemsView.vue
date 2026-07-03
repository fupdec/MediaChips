<template>
  <v-chip-group column>
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
import { useEventBus } from '@/utils/eventBus'

const eventBus = useEventBus()

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

  // Отправляем событие через event bus
  eventBus.emit('setItemsView', val)

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