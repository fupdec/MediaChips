<template>
  <button
    type="button"
    class="fav-btn item-favorite-native"
    :class="{'item-favorite-native--on': favoriteValue}"
    :aria-label="t('meta.default_names.favorite')"
    :aria-pressed="Boolean(favoriteValue)"
    :disabled="pending"
    @click.stop="toggleFavorite"
    @dblclick.stop
  >
    <i class="v-icon mdi" :class="favoriteValue ? 'mdi-heart' : 'mdi-heart-outline'" aria-hidden="true"/>
  </button>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import {useI18n} from 'vue-i18n'
import {typedApi} from '@/services/typedApi'
import { useItemsStore } from '@/stores/items'
import type {MediaItem, Tag} from '@/types/stores'

const props = defineProps<{
  item: MediaItem | Tag
  type: 'media' | 'tag'
}>()

const itemsStore = useItemsStore()
const {t} = useI18n()
const pending = ref(false)

const favoriteValue = computed(() => (props.item.favorite ? 1 : 0))

const toggleFavorite = async () => {
  if (pending.value) return
  const id = props.item.id
  const value = favoriteValue.value ? 0 : 1
  pending.value = true
  try {
    await typedApi.updateEntity(props.type, id, {favorite: value})
    if (props.item.id === id) itemsStore.updateItemField({id, field: 'favorite', value})
  } catch (error) {
    console.error('Error updating favorite:', error)
  } finally {
    pending.value = false
  }
}
</script>

<style scoped>
.item-favorite-native {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  color: var(--item-rating-favorite-muted-color, #eee);
  cursor: pointer;
}
.item-favorite-native--on { color: #e91e63; }
.item-favorite-native:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
  border-radius: 4px;
}
</style>
