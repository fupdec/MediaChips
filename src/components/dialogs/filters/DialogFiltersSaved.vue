<template>
  <div>
    <v-dialog
      v-model="dialogModel"
      :fullscreen="xs"
      max-width="640"
      scrollable
    >
      <v-card>
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
              <v-text-field
                v-model="createName"
                :placeholder="t('filters.filter_name')"
                :disabled="!canCreate"
                :hint="canCreate ? t('filters.save_current_view_hint') : t('filters.save_current_empty')"
                :persistent-hint="true"
                :error-messages="createError"
                density="comfortable"
                variant="solo-filled"
                flat
                rounded="xl"
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
          </v-form>

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
      <v-card>
        <DialogHeader
          :header="t('filters.editing_filter_name')"
          closable
          :buttons="editButtons"
          @close="dialogEditing = false"
        />

        <v-card-text class="text-center py-4 px-2 px-sm-4">
          <v-form
            ref="formRef"
            v-model="validName"
            @submit.prevent
          >
            <v-text-field
              v-model="filterName"
              :label="t('filters.filter_name')"
              :rules="[v => { const r = validateName(v); return r === true || t(r) }]"
              autofocus
              variant="filled"
            />
          </v-form>
        </v-card-text>
      </v-card>
    </v-dialog>

    <DialogConfirm
      v-if="dialogDel"
      variant="delete"
      :dialog="dialogDel"
      :text="t('filters.delete_saved_filter_confirm')"
      @close="dialogDel = false"
      @delete="deleteSavedFilter"
    />
  </div>
</template>

<script setup lang="ts">
import {ref, computed} from 'vue'
import type {VFormInstance} from '@/types/vue'
import {useI18n} from 'vue-i18n'
import {useDisplay} from 'vuetify'
import {typedApi} from '@/services/typedApi'
import {getSavedFilters} from '@/services/filterService'
import {validateName} from '@/services/formatUtils'

import DialogHeader from '@/components/elements/DialogHeader.vue'
import DialogConfirm from '@/components/dialogs/DialogConfirm.vue'
import SavedFiltersList from '@/components/elements/SavedFiltersList.vue'

import {useItemsStore} from '@/stores/items'
import type {SavedFilter} from '@/types/stores'

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
  save: [name: string]
}>()

const itemsStore = useItemsStore()
const {t} = useI18n()
const {xs} = useDisplay()

const dialogModel = computed({
  get: () => props.dialog,
  set: () => close(),
})

const dialogDel = ref(false)
const dialogEditing = ref(false)
const selected = ref<SavedFilter | null>(null)

const validName = ref(true)
const filterName = ref('')
const createName = ref('')
const createError = ref('')
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
  emit('save', name)
  createName.value = ''
  createError.value = ''
}

const openDialogDelete = (filter: SavedFilter) => {
  selected.value = filter
  dialogDel.value = true
}

const deleteSavedFilter = async () => {
  const savedFilter = selected.value
  if (!savedFilter?.id) return

  await typedApi.deleteSavedFilter(savedFilter.id)

  for (const row of savedFilter.filters || []) {
    if (row?.id) {
      await typedApi.deleteFilterRow(row.id)
    }
  }

  await getSavedFilters()
  dialogDel.value = false
}

const openDialogEditing = (filter: SavedFilter) => {
  selected.value = filter
  filterName.value = filter.name || ''
  dialogEditing.value = true
}

const updateFilterName = async () => {
  await formRef.value?.validate()
  if (!validName.value) return

  const savedFilter = selected.value
  if (!savedFilter?.id) return

  await typedApi.updateSavedFilter(savedFilter.id, {name: filterName.value})
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
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  column-gap: 10px;
  align-items: center;

  &__field {
    min-width: 0;
  }

  &__btn {
    flex-shrink: 0;
    height: 40px;
    padding-inline: 18px;
  }
}
</style>
