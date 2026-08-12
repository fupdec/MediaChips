<template>
  <div v-if="savedFilters.length" :key="route.fullPath + 'sf'" class="sf-chips d-flex flex-wrap">
    <v-chip
      v-for="sf in savedFilters"
      :key="sf.id"
      @click="activate(sf)"
      class="ma-1"
      variant="tonal"
      color="primary"
    >
      {{ sf.name }}
    </v-chip>
  </div>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount} from 'vue'
import {useRoute} from 'vue-router'
import {useItemsStore} from '@/stores/items'
import {useItemsFiltersController} from '@/composable/itemsFiltersController'
import {useItemsPageCommands} from '@/composable/itemsPageCommands'
import {
  hasSavedViewLayout,
  pickSavedViewLayout,
} from '@/utils/savedViewLayout'
import type { SavedFilter } from '@/types/stores'

const route = useRoute()
const itemsStore = useItemsStore()
const filtersController = useItemsFiltersController()
const pageCommands = useItemsPageCommands()

const savedFilters = computed(() => itemsStore.filters_saved || [])

const activate = async (savedFilter: SavedFilter) => {
  const layout = pickSavedViewLayout(savedFilter as Record<string, unknown>)
  if (hasSavedViewLayout(layout)) {
    await pageCommands.applySavedViewLayout(layout)
  }

  let filters = savedFilter.filters
  if (filters && Array.isArray(filters)) {
    filters = filters.map((filter) => ({...filter, id: null}))
  }

  await Promise.resolve(filtersController.applySaved(filters || []))
}

onBeforeUnmount(() => {
  itemsStore.clearSavedFilters()
})
</script>

<style lang="scss" scoped>
.sf-chips {
  margin-bottom: 16px;

  .v-chip {
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      transform: translateY(-1px);
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
  }
}
</style>
