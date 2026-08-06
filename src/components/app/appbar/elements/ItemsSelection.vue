<template>
  <div class="d-flex align-center" style="height: 40px;">
    <AppBarButton
      icon="select-off"
      :text="t('appbar.buttons.unselect')"
      :action="toggleSelect"
    />

    <AppBarButton
      icon="select-group"
      :text="t('appbar.buttons.selectVisible')"
      :action="selectVisible"
    />

    <AppBarButton
      icon="select-all"
      :text="t('appbar.buttons.selectAll')"
      :action="selectAll"
    />

    <AppBarButton
      icon="pencil-plus"
      :text="t('common.edit')"
      :disabled="itemsStore.selection.length === 0"
      :action="openBulkEdit"
    />

    <AppBarButton
      v-if="itemsStore.type === 'media'"
      icon="set-merge"
      :text="t('context_menu.merge_media')"
      :disabled="itemsStore.selection.length < 2"
      :action="openMediaMerge"
    />

    <AppBarButton
      icon="delete"
      :text="t('common.delete')"
      :disabled="itemsStore.selection.length === 0"
      :action="openDelete"
    />

    <span class="text-caption ml-6" v-html="selectedText"></span>
  </div>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {useItemsStore} from '@/stores/items'
import {useAppStore} from '@/stores/app'
import {useDialogsStore} from '@/stores/dialogs'
import useItemContextMenu from '@/composable/ItemContextMenu'
import AppBarButton from '@/components/app/appbar/AppBarButton.vue'
import {getReadableFileSize} from '@/services/formatUtils'
import type {MediaItem, Tag} from '@/types/stores'

const itemsStore = useItemsStore()
const appStore = useAppStore()
const dialogsStore = useDialogsStore()
const {t} = useI18n()

const selectionMeta = computed(() => {
  const metaId = itemsStore.environment.meta_id
  if (!metaId) return null
  return appStore.meta.find((item) => item.id === metaId) ?? null
})

function resolveRepresentativeItem(): MediaItem | Tag {
  const id = itemsStore.selection[0]
  if (id != null) {
    const fromPage = itemsStore.entities.find((entry) => Number(entry.id) === Number(id))
    if (fromPage) return fromPage
  }
  return (itemsStore.entities[0] ?? {id: 0, name: ''}) as MediaItem | Tag
}

const filesizes = computed(() => {
  if (itemsStore.type !== 'media') return ''

  if (itemsStore.isAllFilteredSelected) {
    return getReadableFileSize(itemsStore.totalFilesize)
  }

  const selectedFiles = itemsStore.entities.filter((i) =>
    itemsStore.selection.includes(i.id),
  )

  const sum = selectedFiles.reduce((a, b) => a + Number(b.filesize || 0), 0)

  return getReadableFileSize(sum)
})

const selectedText = computed(() => {
  const selection = itemsStore.selection.length

  if (!selection) {
    return t('appbar.buttons.Please_select_items')
  }

  let text = `${selection} ${t('appbar.buttons.selected')}`

  if (itemsStore.type === 'media') {
    text += `, ${filesizes.value}`
  }

  return text
})

function toggleSelect() {
  itemsStore.isSelect = !itemsStore.isSelect
  itemsStore.selection = []
  itemsStore.selected_last = null
  itemsStore.selectionAnchor = null
}

function openBulkEdit() {
  if (itemsStore.selection.length === 0) return
  dialogsStore.bulkEditingItems = true
  itemsStore.isSelect = false
}

function openMediaMerge() {
  if (itemsStore.type !== 'media' || itemsStore.selection.length < 2) return
  const selectedMedia = itemsStore.selection
    .map((id) => itemsStore.entities.find((entry) => Number(entry.id) === Number(id)))
    .filter((item): item is MediaItem => Boolean(item))
  if (selectedMedia.length < 2) return
  dialogsStore.openMediaMerge(selectedMedia)
  itemsStore.isSelect = false
}

function openDelete() {
  if (itemsStore.selection.length === 0) return
  const {deleteItem} = useItemContextMenu(
    resolveRepresentativeItem(),
    itemsStore.type,
    selectionMeta.value,
    true,
    null,
  )
  deleteItem()
}

function selectVisible() {
  itemsStore.selection = itemsStore.itemsOnPage.map((i) => i.id)
  if (itemsStore.selection.length) {
    itemsStore.selected_last = itemsStore.selection[itemsStore.selection.length - 1] ?? null
  }
  itemsStore.selectionAnchor = null
}

async function selectAll() {
  await itemsStore.selectAllFiltered()
}
</script>
