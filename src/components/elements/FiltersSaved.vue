<template>
  <div v-if="savedFilters.length" :key="route.fullPath + 'sf'" class="sf-chips d-flex flex-wrap">
    <v-chip
      v-for="sf in savedFilters"
      :key="sf.id"
      @click="activate(sf)"
      @contextmenu.prevent.stop="showContextMenu($event, sf)"
      class="ma-1"
      variant="tonal"
      color="primary"
    >
      <v-icon start>mdi-{{ sf.icon || 'bookmark' }}</v-icon>
      {{ sf.name }}
    </v-chip>

    <v-dialog v-model="renameDialog" max-width="600" scrollable>
      <v-card rounded="xl">
        <DialogHeader
          :header="t('filters.editing_filter_name')"
          closable
          :buttons="renameButtons"
          @close="renameDialog = false"
        />

        <v-card-text class="pa-4">
          <div class="sf-rename">
            <v-btn
              icon
              size="small"
              variant="tonal"
              color="primary"
              rounded="xl"
              class="sf-rename__icon-btn"
              :aria-label="t('meta.fields.select_icon')"
              :title="t('meta.fields.select_icon')"
              @click="showRenameIconPicker = true"
            >
              <v-icon size="20">mdi-{{ renameIcon || DEFAULT_ICON }}</v-icon>
            </v-btn>

            <v-text-field
              v-model="renameName"
              :label="t('filters.filter_name')"
              :error-messages="renameError"
              variant="outlined"
              density="compact"
              rounded="lg"
              autofocus
              hide-details="auto"
              class="sf-rename__field"
              @update:model-value="renameError = ''"
              @keydown.enter.prevent="saveRename"
            />
          </div>

          <DialogIcons
            v-model="showRenameIconPicker"
            :icon="renameIcon || DEFAULT_ICON"
            hide-activator
            @apply="renameIcon = $event"
          />
        </v-card-text>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, defineAsyncComponent} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRoute} from 'vue-router'
import {useItemsStore} from '@/stores/items'
import {useContextMenu} from '@/stores/contextMenu'
import {useDialogsStore} from '@/stores/dialogs'
import {useItemsFiltersController} from '@/composable/itemsFiltersController'
import {useItemsPageCommands} from '@/composable/itemsPageCommands'
import {typedApi} from '@/services/typedApi'
import {getSavedFilters} from '@/services/filterService'
import {validateName} from '@/services/formatUtils'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import {
  hasSavedViewLayout,
  pickSavedViewLayout,
} from '@/utils/savedViewLayout'
import type { SavedFilter, ContextMenuEntry } from '@/types/stores'

const DialogIcons = defineAsyncComponent(() => import('@/components/dialogs/DialogIcons.vue'))

const DEFAULT_ICON = 'bookmark'

const route = useRoute()
const {t} = useI18n()
const itemsStore = useItemsStore()
const contextMenuStore = useContextMenu()
const dialogsStore = useDialogsStore()
const filtersController = useItemsFiltersController()
const pageCommands = useItemsPageCommands()

const savedFilters = computed(() => itemsStore.filters_saved || [])

const renameDialog = ref(false)
const renameName = ref('')
const renameIcon = ref('')
const renameError = ref('')
const renameTarget = ref<SavedFilter | null>(null)
const showRenameIconPicker = ref(false)

const renameButtons = computed(() => [{
  icon: 'content-save',
  text: t('common.save'),
  color: 'success',
  action: saveRename,
}])

const activate = async (savedFilter: SavedFilter) => {
  const layout = pickSavedViewLayout(savedFilter as Record<string, unknown>)
  if (hasSavedViewLayout(layout)) {
    await pageCommands.applySavedViewLayout(layout)
  }

  let filters = savedFilter.filters
  if (filters && Array.isArray(filters)) {
    filters = filters.map((filter) => ({...filter, id: null}))
  }

  await Promise.resolve(filtersController.applySaved(filters || []))
}

const openRename = (savedFilter: SavedFilter) => {
  renameTarget.value = savedFilter
  renameName.value = savedFilter.name || ''
  renameIcon.value = String(savedFilter.icon || '')
  renameError.value = ''
  renameDialog.value = true
}

const saveRename = async () => {
  const savedFilter = renameTarget.value
  if (!savedFilter?.id) return

  const nameCheck = validateName(renameName.value)
  if (nameCheck !== true) {
    renameError.value = t(nameCheck)
    return
  }

  await typedApi.updateSavedFilter(Number(savedFilter.id), {
    name: renameName.value.trim(),
    icon: renameIcon.value,
  })

  renameDialog.value = false
  renameTarget.value = null
  await getSavedFilters()
}

const deleteSavedFilter = async (savedFilter: SavedFilter) => {
  if (!savedFilter?.id) return
  await typedApi.deleteSavedFilter(Number(savedFilter.id))
  await getSavedFilters()
}

const confirmDelete = (savedFilter: SavedFilter) => {
  dialogsStore.confirm.variant = 'delete'
  dialogsStore.confirm.text = t('filters.delete_saved_filter_confirm')
  dialogsStore.confirm.checkBox = false
  dialogsStore.confirm.checkBoxText = ''
  dialogsStore.confirm.checkBox2 = false
  dialogsStore.confirm.checkBox2Text = ''
  dialogsStore.confirm.checkBox2RequiresPrimary = false
  dialogsStore.confirm.action = () => {
    void deleteSavedFilter(savedFilter)
  }
  dialogsStore.confirm.show = true
}

const showContextMenu = (event: MouseEvent, savedFilter: SavedFilter) => {
  event.preventDefault()

  const content: ContextMenuEntry[] = [
    {
      name: t('common.apply'),
      type: 'item',
      icon: 'check',
      action: () => {
        void activate(savedFilter)
      },
    },
    {
      name: t('common.edit'),
      type: 'item',
      icon: 'pencil',
      action: () => openRename(savedFilter),
    },
    {type: 'divider'},
    {
      name: t('common.delete'),
      type: 'item',
      icon: 'delete',
      color: 'red',
      action: () => confirmDelete(savedFilter),
    },
  ]

  contextMenuStore.showContextMenu({
    content,
    x: event.clientX,
    y: event.clientY,
  })
}

onBeforeUnmount(() => {
  itemsStore.clearSavedFilters()
})
</script>

<style lang="scss" scoped>
.sf-chips {
  margin-bottom: 16px;

  .v-chip {
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      transform: translateY(-1px);
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
  }
}

.sf-rename {
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
