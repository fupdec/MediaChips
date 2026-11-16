<template>
  <v-menu location="top start" :offset="6" :close-on-content-click="false">
    <template #activator="{props: activatorProps}">
      <v-btn v-bind="activatorProps" class="media-adding-types" size="small" variant="text" rounded="lg"
             prepend-icon="mdi-shape-outline" append-icon="mdi-chevron-up"
             :disabled="disabled" :title="selectionLabel">
        {{ t('media.adding.media_types') }}
      </v-btn>
    </template>
    <v-sheet class="media-adding-types__menu px-2 py-1" rounded="lg" elevation="4"
             role="group" :aria-label="t('media.adding.media_types')">
      <v-checkbox
        v-for="item in items" :key="item.id"
        v-model="checkedIds" :value="item.id" :label="getMediaTypeName(item, t)"
        :disabled="disabled || (checkedIds.length === 1 && checkedIds.includes(item.id))"
        color="primary" density="compact" hide-details
      />
    </v-sheet>
  </v-menu>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {getMenuOrderedMediaTypes, isManagedMediaType} from '@/utils/mediaType'
import {getMediaTypeName} from '@/utils/mediaTypeI18n'

defineProps<{disabled?: boolean}>()
const selected = defineModel<number[]>({required: true})
const app = useAppStore()
const {t} = useI18n()
const items = computed(() => getMenuOrderedMediaTypes(app.mediaTypes).filter(isManagedMediaType))
const checkedIds = computed({
  get: () => selected.value.length ? selected.value : items.value.map(item => item.id),
  set: (ids: number[]) => {
    if (ids.length) selected.value = ids.length === items.value.length ? [] : ids
  },
})
const selectionLabel = computed(() => items.value
  .filter(item => checkedIds.value.includes(item.id))
  .map(item => getMediaTypeName(item, t))
  .join(', '))
</script>

<style scoped>
.media-adding-types__menu :deep(.v-selection-control) { min-height: 30px; }
.media-adding-types__menu :deep(.v-label) {
  margin-inline-start: 5px;
  padding-inline-end: 4px;
  font-size: .8125rem;
}
</style>
