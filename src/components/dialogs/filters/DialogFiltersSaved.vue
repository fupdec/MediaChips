<template>
  <div>
    <v-dialog
      v-model="dialogModel"
      :fullscreen="xs"
      max-width="640"
      scrollable
    >
      <v-card rounded="xl">
        <DialogHeader
          :header="t('filters.saved_filters')"
          closable
          @close="close"
        />

        <v-card-text class="pa-4 pb-0">
          <v-form
            class="mb-4"
            @submit.prevent="submitCreate"
          >
            <div class="saved-filter-create">
              <div class="saved-filter-create__row">
                <v-btn
                  v-if="canCreate"
                  icon
                  size="small"
                  variant="tonal"
                  color="primary"
                  rounded="xl"
                  class="saved-filter-create__icon-btn"
                  :aria-label="t('meta.fields.select_icon')"
                  :title="t('meta.fields.select_icon')"
                  @click="showCreateIconPicker = true"
                >
                  <v-icon size="20">mdi-{{ createIcon || DEFAULT_ICON }}</v-icon>
                </v-btn>
                <v-text-field
                  v-model="createName"
                  :placeholder="t('filters.filter_name')"
                  :disabled="!canCreate"
                  :error-messages="createError"
                  density="compact"
                  variant="outlined"
                  rounded="lg"
                  hide-details="auto"
                  class="saved-filter-create__field"
                  @update:model-value="createError = ''"
                  @keydown.enter.prevent="submitCreate"
                />
                <v-btn
                  color="success"
                  variant="flat"
                  rounded="pill"
                  class="saved-filter-create__btn"
                  :disabled="!canCreate"
                  @click="submitCreate"
                >
                  <v-icon start>mdi-plus</v-icon>
                  {{ t('common.create') }}
                </v-btn>
              </div>
              <div
                v-if="!createError"
                class="saved-filter-create__hint text-caption text-medium-emphasis"
              >
                {{ canCreate ? t('filters.save_current_view_hint') : t('filters.save_current_empty') }}
              </div>
            </div>
          </v-form>

          <DialogIcons
            v-if="canCreate"
            v-model="showCreateIconPicker"
            :icon="createIcon || DEFAULT_ICON"
            hide-activator
            @apply="createIcon = $event"
          />

          <v-alert
            v-if="savedFilters.length"
            type="info"
            variant="tonal"
            density="compact"
            rounded="xl"
            class="mb-4 text-caption"
          >
            {{ t('filters.saved_filters_manage_hint') }}
          </v-alert>

          <SavedFiltersList
            :filters="savedFilters"
            :empty-text="t('filters.no_saved_filters_cta')"
            selectable
            editable
            deletable
            @apply="apply"
            @edit="openDialogEditing"
            @delete="openDialogDelete"
          />
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog v-model="dialogEditing" max-width="600" scrollable>
      <v-card rounded="xl">
        <DialogHeader
          :header="t('filters.editing_filter_name')"
          closable
          :buttons="editButtons"
          @close="dialogEditing = false"
        />

        <v-card-text class="text-left py-4 px-2 px-sm-4">
          <div class="saved-filter-edit">
            <v-btn
              icon
              size="small"
              variant="tonal"
              color="primary"
              rounded="xl"
              class="saved-filter-edit__icon-btn"
              :aria-label="t('meta.fields.select_icon')"
              :title="t('meta.fields.select_icon')"
              @click="showEditIconPicker = true"
            >
              <v-icon size="20">mdi-{{ filterIcon || DEFAULT_ICON }}</v-icon>
            </v-btn>

            <v-form
              ref="formRef"
              v-model="validName"
              class="saved-filter-edit__field"
              @submit.prevent
            >
              <v-text-field
                v-model="filterName"
                :label="t('filters.filter_name')"
                :rules="[v => { const r = validateName(v); return r === true || t(r) }]"
                autofocus
                variant="outlined"
                density="compact"
                rounded="lg"
              />
            </v-form>
          </div>

          <DialogIcons
            v-model="showEditIconPicker"
            :icon="filterIcon || DEFAULT_ICON"
            :attach="false"
            hide-activator
            @apply="changeIcon"
          />
        </v-card-text>
      </v-card>
    </v-dialog>

    <DialogConfirm
      v-if="dialogDel"
      variant="delete"
      :dialog="dialogDel"
      :text="t('filters.delete_saved_filter_confirm')"
      :check-box-text="t('actions.delete_permanently')"
      :check-box="deletePermanently"
      @update:check-box="deletePermanently = $event"
      @close="dialogDel = false; deletePermanently = false"
      @delete="deleteSavedFilter"
    />
  </div>
</template>

<script setup lang="ts">
import {ref, computed, defineAsyncComponent} from 'vue'
import type {VFormInstance} from '@/types/vue'
import {useI18n} from 'vue-i18n'
import {useDisplay} from 'vuetify'
import {typedApi} from '@/services/typedApi'
import {getSavedFilters} from '@/services/filterService'
import {validateName} from '@/services/formatUtils'

import DialogHeader from '@/components/elements/DialogHeader.vue'
import DialogConfirm from '@/components/dialogs/DialogConfirm.vue'
import SavedFiltersList from '@/components/elements/SavedFiltersList.vue'

const DialogIcons = defineAsyncComponent(() => import('@/components/dialogs/DialogIcons.vue'))

import {useItemsStore} from '@/stores/items'
import type {SavedFilter} from '@/types/stores'

const DEFAULT_ICON = 'bookmark'

const props = defineProps({
  dialog: Boolean,
  canCreate: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits<{
  close: []
  apply: [savedFilter: SavedFilter]
  save: [name: string, icon?: string]
}>()

const itemsStore = useItemsStore()
const {t} = useI18n()
const {xs} = useDisplay()

const dialogModel = computed({
  get: () => props.dialog,
  set: () => close(),
})

const dialogDel = ref(false)
const deletePermanently = ref(false)
const dialogEditing = ref(false)
const selected = ref<SavedFilter | null>(null)

const validName = ref(true)
const filterName = ref('')
const filterIcon = ref('')
const createName = ref('')
const createIcon = ref('')
const createError = ref('')
const showCreateIconPicker = ref(false)
const showEditIconPicker = ref(false)
const formRef = ref<VFormInstance>(null)

const savedFilters = computed(() => itemsStore.filters_saved)

const close = () => emit('close')

const submitCreate = () => {
  if (!props.canCreate) return
  const name = createName.value.trim()
  if (!name) {
    createError.value = t('validation.name_required')
    return
  }
  const nameCheck = validateName(name)
  if (nameCheck !== true) {
    createError.value = t(nameCheck)
    return
  }
  emit('save', name, createIcon.value)
  createName.value = ''
  createIcon.value = ''
  createError.value = ''
}

const openDialogDelete = (filter: SavedFilter) => {
  selected.value = filter
  deletePermanently.value = false
  dialogDel.value = true
}

const deleteSavedFilter = async () => {
  const savedFilter = selected.value
  if (!savedFilter?.id) return

  await typedApi.deleteSavedFilter(savedFilter.id, {permanent: deletePermanently.value})

  await getSavedFilters()
  dialogDel.value = false
  deletePermanently.value = false
}

const openDialogEditing = (filter: SavedFilter) => {
  selected.value = filter
  filterName.value = filter.name || ''
  filterIcon.value = String(filter.icon || '')
  dialogEditing.value = true
}
const changeIcon = (newIcon: string) => {
  filterIcon.value = newIcon
}

const updateFilterName = async () => {
  await formRef.value?.validate()
  if (!validName.value) return

  const savedFilter = selected.value
  if (!savedFilter?.id) return

  await typedApi.updateSavedFilter(savedFilter.id, {name: filterName.value, icon: filterIcon.value})
    .then(() => {
      dialogEditing.value = false
      getSavedFilters()
    })
    .catch((e) => {
      dialogEditing.value = false
      console.log(e)
    })
}

const apply = (savedFilter: SavedFilter) => {
  emit('apply', savedFilter)
}

const editButtons = computed(() => [
  {
    icon: 'content-save',
    text: t('common.save'),
    color: 'success',
    action: updateFilterName,
  },
])
</script>

<style lang="scss" scoped>
.saved-filter-create {
  display: flex;
  flex-direction: column;
  gap: 6px;

  &__row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    column-gap: 10px;
    align-items: start;
  }

  &__field {
    min-width: 0;

    :deep(.v-input__control),
    :deep(.v-field) {
      min-height: 40px;
      max-height: 40px;
    }

    :deep(.v-field__input) {
      min-height: 40px !important;
      max-height: 40px;
      padding-top: 0 !important;
      padding-bottom: 0 !important;
    }
  }

  &__icon-btn {
    flex-shrink: 0;
    height: 40px !important;
    width: 40px !important;
    min-width: 40px;
    align-self: start;
  }

  &__btn {
    flex-shrink: 0;
    height: 40px !important;
    min-height: 40px;
    padding-inline: 18px;
  }

  &__hint {
    line-height: 1.35;
    padding-inline: 4px;
  }
}

.saved-filter-edit {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  column-gap: 10px;
  align-items: start;

  &__icon-btn {
    flex-shrink: 0;
    height: 40px !important;
    width: 40px !important;
    min-width: 40px;
    align-self: start;
  }

  &__field {
    min-width: 0;

    :deep(.v-input__control),
    :deep(.v-field) {
      min-height: 40px;
      max-height: 40px;
    }

    :deep(.v-field__input) {
      min-height: 40px !important;
      max-height: 40px;
      padding-top: 0 !important;
      padding-bottom: 0 !important;
    }
  }
}
</style>
