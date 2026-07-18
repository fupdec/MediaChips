<template>
  <div class="media-types-settings">
    <SettingsCategoryDivider
      :title="t('settings.tabs.media')"
      icon="file-outline"
    />

    <div v-if="!mediaTypes.length" class="media-types-settings__empty text-medium-emphasis text-body-2">
      {{ t('media.type.please_add_media_first') }}
    </div>

    <v-chip-group v-else column class="media-types-settings__chips">
      <v-chip
        v-for="m in sortedMediaTypesList"
        :key="m.id"
        :disabled="!isEditableMediaType(m)"
        class="media-types-settings__chip"
        @click="open(m)"
      >
        <v-icon start size="18">mdi-{{ m.icon }}</v-icon>
        <span>{{ getMediaTypeName(m, t) }}</span>
        <v-icon
          v-if="!m.hidden"
          end
          size="14"
          :title="t('media.type.show_in_navbar')"
        >
          mdi-eye-outline
        </v-icon>
      </v-chip>
    </v-chip-group>

    <DialogMediaTypeAdd
      v-if="dialogAdd"
      v-model="dialogAdd"
      @added="finishAdding"
      @close="dialogAdd = false"
    />

    <DialogMediaTypeEdit
      v-if="dialogEdit"
      :dialog="dialogEdit"
      :media="selected"
      @update="updateMediaTypes"
      @close="dialogEdit = false"
    />
  </div>
</template>

<script setup lang="ts">
import {ref, computed, onMounted, defineAsyncComponent} from 'vue'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {useEventBus} from '@/utils/eventBus'
import orderBy from 'lodash/orderBy'
import {getMediaTypeName} from '@/utils/mediaTypeI18n'
import {isEditableMediaType} from '@/utils/mediaType'
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'
import type {MediaType} from '@/types/media'

interface EditableMediaType extends MediaType {
  custom?: boolean
}

const DialogMediaTypeAdd = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogMediaTypeAdd.vue')
)
const DialogMediaTypeEdit = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogMediaTypeEdit.vue')
)

const appStore = useAppStore()
const eventBus = useEventBus()
const {t} = useI18n()

const selected = ref<EditableMediaType | undefined>(undefined)
const dialogAdd = ref(false)
const dialogEdit = ref(false)

const mediaTypes = computed(() => appStore.mediaTypes)
const sortedMediaTypesList = computed(() => orderBy(mediaTypes.value, ['order', 'name']))

onMounted(() => {
  eventBus.emit('getMediaTypes')
})

function finishAdding() {
  dialogAdd.value = false
  eventBus.emit('getMediaTypes')
}

function open(media: EditableMediaType) {
  if (!isEditableMediaType(media)) return
  selected.value = media
  dialogEdit.value = true
}

function updateMediaTypes() {
  eventBus.emit('getMediaTypes')
  dialogEdit.value = false
}
</script>

<style scoped>
.media-types-settings {
  margin-bottom: 24px;
}

.media-types-settings__empty {
  padding: 4px 0 4px 16px;
}

.media-types-settings__chips {
  margin: -4px;
  padding-left: 16px;
}

.media-types-settings__chip {
  justify-content: flex-start;
}
</style>
