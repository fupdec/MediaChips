<template>
  <v-checkbox
    :model-value="item.favorite"
    @click.stop
    @update:model-value="setVal($event, 'favorite')"
    :false-value="0"
    :true-value="1"
    false-icon="mdi-heart-outline"
    true-icon="mdi-heart"
    color="pink"
    class="ma-0 pa-0 fav-btn"
    hide-details
    density="compact"
    dark
  />
</template>

<script setup lang="ts">
import {typedApi} from '@/services/typedApi'
import { useItemsStore } from '@/stores/items'
import type {MediaItem, Tag} from '@/types/stores'

const props = defineProps<{
  item: MediaItem | Tag
  type: 'media' | 'tag'
}>()

const itemsStore = useItemsStore()

const setVal = async (val: boolean | number | null, key: string) => {
  const numVal = val ? 1 : 0
  try {
    await typedApi.updateEntity(props.type, props.item.id, {
      [key]: numVal,
    })

    itemsStore.updateItemField({
      id: props.item.id,
      field: key,
      value: numVal,
    })
  } catch (error) {
    console.error('Error updating favorite:', error)
    ;(props.item as Record<string, unknown>).favorite = numVal === 1 ? 0 : 1
  }
}
</script>
