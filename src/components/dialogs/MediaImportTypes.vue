<template>
  <div class="media-adding-types mb-4">
    <div class="text-caption text-medium-emphasis mb-2">{{ t('media.adding.media_types') }}</div>
    <div class="d-flex flex-wrap ga-2">
      <v-chip v-for="item in items" :key="item.id"
              :prepend-icon="item.icon ? `mdi-${item.icon}` : undefined"
              :variant="isActive(item.id) ? 'flat' : 'tonal'"
              :color="isActive(item.id) ? 'primary' : undefined"
              :disabled="disabled" :aria-pressed="isActive(item.id)" filter label @click="toggle(item.id)">
        {{ getMediaTypeName(item, t) }}
      </v-chip>
    </div>
  </div>
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
const isActive = (id: number) => !selected.value.length || selected.value.includes(id)
function toggle(id: number) {
  if (!selected.value.length) { selected.value = [id]; return }
  const next = selected.value.includes(id) ? selected.value.filter(value => value !== id) : [...selected.value, id]
  selected.value = !next.length || next.length === items.value.length ? [] : next
}
</script>
