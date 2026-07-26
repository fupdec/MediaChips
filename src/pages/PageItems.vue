<template>
  <LayoutItems
    v-if="appStore.localhost && appStore.is_app_ready"
    :items_type="itemsType"
    :mediaTypeId="mediaTypeId"
    :metaId="metaId"
    :tagId="tagId"
    :tabId="tabId"
  />
</template>

<script setup lang="ts">
import {computed, watch} from 'vue'
import {useRoute} from 'vue-router'
import LayoutItems from '@/layouts/LayoutItems.vue'

import {useItemsStore} from '@/stores/items'
import {useAppStore} from '@/stores/app'
import type {ItemsPageType} from '@/types/itemsPage'

const itemsStore = useItemsStore()
const appStore = useAppStore()
const route = useRoute()

const env = computed(() => itemsStore.environment)

const readQueryId = (key: string): number | null => {
  const value = route.query[key]
  if (Array.isArray(value)) {
    return value[0] ? Number(value[0]) : null
  }
  return value ? Number(value) : null
}

const mediaTypeId = computed(() => readQueryId('mediaTypeId') ?? undefined)
const metaId = computed(() => readQueryId('metaId') ?? undefined)
const tagId = computed(() => readQueryId('tagId') ?? undefined)
const tabId = computed(() => readQueryId('tabId') ?? undefined)

const itemsType = computed((): ItemsPageType => {
  if (route.query.mediaTypeId || route.path.startsWith('/media')) {
    return 'media'
  }
  if (route.query.metaId || route.path.startsWith('/meta')) {
    return 'tag'
  }
  return (itemsStore.type as ItemsPageType) || 'media'
})

function applyRouteContext() {
  env.value.media_type_id = readQueryId('mediaTypeId')
  env.value.meta_id = readQueryId('metaId')
  env.value.tag_id = readQueryId('tagId')
  env.value.tab_id = readQueryId('tabId')
}

applyRouteContext()

watch(() => route.fullPath, () => {
  applyRouteContext()
})
</script>
