<template>
  <div>
    <v-dialog
      v-model="dialogModel"
      :fullscreen="xs"
      max-width="600"
      scrollable
    >
      <v-card>
        <DialogHeader
          :header="t('filters.saved_filters')"
          closable
          @close="close"
        />

        <v-card-text class="pa-4 pb-0">
          <v-alert
            type="info"
            variant="tonal"
            density="compact"
            rounded="xl"
            class="mb-4 text-caption"
          >
            {{ t('filters.saved_filters_load_hint') }}
          </v-alert>

          <SavedFiltersList
            :filters="savedFilters"
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
              :rules="[v => validateName(v) || t('validation.name_required')]"
              autofocus
              variant="filled"
            />
          </v-form>
        </v-card-text>
      </v-card>
    </v-dialog>

    <DialogDeleteConfirm
      v-if="dialogDel"
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
import DialogDeleteConfirm from '@/components/dialogs/DialogDeleteConfirm.vue'
import SavedFiltersList from '@/components/elements/SavedFiltersList.vue'

import {useItemsStore} from '@/stores/items'
import type {FilterObject} from '@/types/common'
import type {SavedFilter} from '@/types/stores'

const props = defineProps({
  dialog: Boolean,
})

const emit = defineEmits(['close', 'apply'])

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
const formRef = ref<VFormInstance>(null)

const savedFilters = computed(() => itemsStore.filters_saved)

const close = () => emit('close')

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
  const filters = (savedFilter.filters || []).map((f: FilterObject) => ({
    ...f,
    id: null,
  }))
  emit('apply', filters)
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
