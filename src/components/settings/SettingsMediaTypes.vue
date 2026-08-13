<template>
  <div class="media-types-settings mx-4">
    <SettingsCategoryDivider
      :title="t('settings.tabs.media')"
      icon="file-outline"
    />

    <div class="mb-4">
      <v-btn
        color="success"
        rounded="pill"
        variant="flat"
        class="pr-4"
        prepend-icon="mdi-plus"
        :text="t('common.add')"
        @click="dialogAdd = true"
      />
    </div>

    <div v-if="!mediaTypes.length" class="settings-empty text-center py-10 px-4">
      <div class="settings-empty__icon mb-3" aria-hidden="true">
        <v-icon icon="mdi-file-outline" size="28"/>
      </div>
      <div class="text-body-1 font-weight-medium mb-1">
        {{ t('media.type.empty') }}
      </div>
      <div class="text-caption text-medium-emphasis">
        {{ t('media.type.empty_hint') }}
      </div>
    </div>

    <v-chip-group v-else column class="media-types-settings__chips">
      <v-chip
        v-for="m in sortedMediaTypesList"
        :key="m.id"
        :disabled="!isEditableMediaType(m)"
        class="media-types-settings__chip"
        :class="{'media-types-settings__chip--hidden': m.hidden}"
        @click="open(m)"
      >
        <v-icon start size="18">mdi-{{ m.icon }}</v-icon>
        <span>{{ getMediaTypeName(m, t) }}</span>
      </v-chip>
    </v-chip-group>

    <DialogMediaTypeAdd
      v-if="dialogAdd"
      :dialog="dialogAdd"
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
import {reloadMediaTypesCatalog} from '@/composable/appCatalogs'
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
const {t} = useI18n()

const selected = ref<EditableMediaType | undefined>(undefined)
const dialogAdd = ref(false)
const dialogEdit = ref(false)

const mediaTypes = computed(() => appStore.mediaTypes)
const sortedMediaTypesList = computed(() => orderBy(mediaTypes.value, ['order', 'name']))

onMounted(() => {
  void reloadMediaTypesCatalog()
})

function finishAdding() {
  dialogAdd.value = false
  void reloadMediaTypesCatalog()
}

function open(media: EditableMediaType) {
  if (!isEditableMediaType(media)) return
  selected.value = media
  dialogEdit.value = true
}

function updateMediaTypes() {
  void reloadMediaTypesCatalog()
  dialogEdit.value = false
}
</script>

<style scoped>
.settings-empty {
  border-radius: 22px;
  border: 1px dashed rgba(var(--v-theme-on-surface), 0.14);
  background:
    radial-gradient(80% 120% at 50% 0%, rgba(var(--v-theme-primary), 0.08), transparent 65%),
    rgba(var(--v-theme-on-surface), 0.02);
}

.settings-empty__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 18px;
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.12);
}

.media-types-settings__chips {
  margin: -4px;
}

.media-types-settings__chip {
  justify-content: flex-start;
}

.media-types-settings__chip--hidden {
  opacity: 0.55;
}
</style>
