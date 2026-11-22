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

    <v-menu
      v-model="moreMenuOpen"
      location="bottom"
      :transition="false"
      :close-on-content-click="false"
      content-class="app-bar-more-menu"
    >
      <template #activator="{props: menuProps}">
        <v-btn
          v-bind="menuProps"
          icon
          variant="text"
          class="ml-1"
          :aria-label="t('appbar.buttons.more')"
        >
          <v-icon>mdi-dots-vertical</v-icon>
        </v-btn>
      </template>

      <v-list density="compact" class="context-menu" :lines="false" nav rounded="lg">
        <v-list-item
          v-if="supportsBulkEdit"
          link
          prepend-icon="mdi-pencil-plus"
          :title="t('common.edit')"
          :disabled="itemsStore.selection.length === 0"
          @click="runFromMoreMenu(openBulkEdit)"
        />
        <v-list-item
          v-if="itemsStore.type === 'media'"
          link
          prepend-icon="mdi-set-merge"
          :title="t('context_menu.merge_media')"
          :disabled="itemsStore.selection.length < 2"
          @click="runFromMoreMenu(openMediaMerge)"
        />
        <v-list-item
          v-if="supportsBulkEdit && sessionFocusStore.isActive"
          link
          prepend-icon="mdi-bullseye-arrow"
          :title="sessionFocusStore.tags.length === 1
            ? t('session_focus.apply_short', {name: sessionFocusStore.tag?.name || ''})
            : t('session_focus.apply_all_short')"
          :disabled="itemsStore.selection.length === 0"
          @click="runFromMoreMenu(applyFocusToSelection)"
        />
        <v-list-item
          link
          prepend-icon="mdi-delete"
          :title="t('common.delete')"
          :disabled="itemsStore.selection.length === 0"
          @click="runFromMoreMenu(openDelete)"
        />
        <v-list-item
          v-if="itemsStore.type === 'media'"
          link
          prepend-icon="mdi-file-swap-outline"
          :title="t('metadata_transfer.title')"
          @click="runFromMoreMenu(() => { metadataTransferOpen = true })"
        />
        <v-list-item
          v-if="itemsStore.type === 'media'"
          link
          prepend-icon="mdi-file-cog-outline"
          :title="t('originals.title')"
          :disabled="itemsStore.selection.length === 0"
          @click="runFromMoreMenu(() => { originalsOpen = true })"
        />
      </v-list>
    </v-menu>

    <DialogMetadataTransfer v-if="itemsStore.type === 'media'" v-model="metadataTransferOpen" :media-ids="itemsStore.selection" />
    <DialogOriginalOperations v-if="itemsStore.type === 'media'" v-model="originalsOpen" :media-ids="itemsStore.selection" />

    <span class="text-caption ml-6" v-html="selectedText"></span>
  </div>
</template>

<script setup lang="ts">
import {computed, defineAsyncComponent, ref} from 'vue'
import {useFsBrowseSelection} from '@/stores/fsBrowseSelection'
import {useRoute} from 'vue-router'
import {selectAllMixedGridEntries} from '@/composable/mixedGridSelection'
import {useSelectionFilesize} from '@/composable/useSelectionFilesize'
import {resolveSelectedMediaItems} from '@/utils/resolveSelection'
import {useI18n} from 'vue-i18n'
import {useItemsStore} from '@/stores/items'
import {useAppStore} from '@/stores/app'
import {useDialogsStore} from '@/stores/dialogs'
import {useSessionFocusStore} from '@/stores/sessionFocus'
import {useSessionFocusActions} from '@/composable/useSessionFocusActions'
import useItemContextMenu from '@/composable/ItemContextMenu'
import AppBarButton from '@/components/app/appbar/AppBarButton.vue'
import {getReadableFileSize} from '@/services/formatUtils'
import {typedApi} from '@/services/typedApi'
import {setNotification} from '@/services/notificationService'
import {useEventBus} from '@/utils/eventBus'
import type {MediaItem, Tag} from '@/types/stores'

const DialogMetadataTransfer = defineAsyncComponent(() => import('@/components/dialogs/DialogMetadataTransfer.vue'))
const DialogOriginalOperations = defineAsyncComponent(() => import('@/components/dialogs/DialogOriginalOperations.vue'))
const moreMenuOpen = ref(false)
const metadataTransferOpen = ref(false)
const originalsOpen = ref(false)
const fsSelection = useFsBrowseSelection()
const route = useRoute()
const itemsStore = useItemsStore()
const appStore = useAppStore()
const dialogsStore = useDialogsStore()
const sessionFocusStore = useSessionFocusStore()
const {applyFocusTagToMediaIds, applyTrayToItems} = useSessionFocusActions()
const eventBus = useEventBus()
const {t} = useI18n()

const supportsBulkEdit = computed(() =>
  itemsStore.type === 'media' || itemsStore.type === 'tag',
)

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

const {filesize, loading: sizeLoading} = useSelectionFilesize()
const filesizes = computed(() => filesize.value == null
  ? (sizeLoading.value ? '…' : '—')
  : getReadableFileSize(filesize.value))

const selectedText = computed(() => {
  const selection = itemsStore.selection.length + (route.path === '/folders' ? fsSelection.selectedCount : 0)

  if (!selection) {
    return t('appbar.buttons.Please_select_items')
  }

  let text = `${selection} ${t('appbar.buttons.selected')}`

  if (itemsStore.type === 'media' && !(route.path === '/folders' && fsSelection.selectedCount)) {
    text += `, ${filesizes.value}`
  }

  return text
})

function toggleSelect() {
  itemsStore.toggleSelectMode()
}

function openBulkEdit() {
  if (itemsStore.selection.length === 0) return
  dialogsStore.bulkEditingItems = true
  itemsStore.isSelect = false
}

function applyFocusToSelection() {
  if (!sessionFocusStore.isActive || itemsStore.selection.length === 0) return
  if (itemsStore.type === 'tag') {
    void applyTrayToItems([...itemsStore.selection], 'tag')
    return
  }
  void applyFocusTagToMediaIds([...itemsStore.selection])
}

function runFromMoreMenu(action: () => void | Promise<void>) {
  moreMenuOpen.value = false
  action()
}

async function openMediaMerge() {
  if (itemsStore.type !== 'media' || itemsStore.selection.length < 2) return
  const ids = [...itemsStore.selection]
  try {
    const selectedMedia = await resolveSelectedMediaItems(ids)
    if (selectedMedia.length !== new Set(ids).size) throw new Error('Some selected media are unavailable')
    dialogsStore.openMediaMerge(selectedMedia)
    itemsStore.isSelect = false
  } catch (error) {
    console.error('Failed loading media for merge', error)
    setNotification({type: 'error', title: t('media.dialogs.merge_media_failed')})
  }
}

function openDelete() {
  if (itemsStore.selection.length === 0) return

  if (itemsStore.type === 'mark') {
    openMarkDelete()
    return
  }
  if (itemsStore.type === 'playlist') {
    openPlaylistDelete()
    return
  }

  const {deleteItem} = useItemContextMenu(
    resolveRepresentativeItem(),
    itemsStore.type,
    selectionMeta.value,
    true,
    null,
  )
  deleteItem()
}

function openMarkDelete() {
  const ids = [...itemsStore.selection]
  const count = ids.length
  dialogsStore.confirm.checkBox = false
  dialogsStore.confirm.checkBox2 = false
  dialogsStore.confirm.checkBox2RequiresPrimary = false
  dialogsStore.confirm.checkBoxText = t('actions.delete_permanently')
  dialogsStore.confirm.checkBox2Text = ''
  dialogsStore.confirm.text = t('markers.delete_selected_confirm', {count})
  dialogsStore.confirm.action = async () => {
    const permanent = Boolean(dialogsStore.confirm.checkBox)
    let deleted = 0
    for (const id of ids) {
      try {
        await typedApi.deleteMark(id, {permanent})
        deleted += 1
      } catch (error) {
        console.warn('Failed deleting mark', id, error)
      }
    }
    itemsStore.clearSelection()
    eventBus.emit('markers:reload')
    if (deleted > 0) {
      setNotification({
        type: 'success',
        title: permanent
          ? t('markers.delete_selected_done', {count: deleted})
          : t('notifications_text.items_moved_to_trash'),
      })
    }
    if (deleted < ids.length) {
      setNotification({
        type: 'warning',
        title: t('markers.delete_selected_failed'),
        text: `${deleted}/${ids.length}`,
      })
    }
  }
  dialogsStore.confirm.show = true
}

function openPlaylistDelete() {
  const ids = [...itemsStore.selection]
  const count = ids.length
  dialogsStore.confirm.checkBox = false
  dialogsStore.confirm.checkBox2 = false
  dialogsStore.confirm.checkBox2RequiresPrimary = false
  dialogsStore.confirm.checkBoxText = t('actions.delete_permanently')
  dialogsStore.confirm.checkBox2Text = ''
  dialogsStore.confirm.text = t('playlists.delete_selected_confirm', {count})
  dialogsStore.confirm.action = async () => {
    const permanent = Boolean(dialogsStore.confirm.checkBox)
    let deleted = 0
    for (const id of ids) {
      try {
        if (id < 0) {
          const savedFilterId = Math.abs(id)
          await typedApi.deleteSavedFilter(savedFilterId, {permanent})
        } else {
          await typedApi.deletePlaylist(id, {permanent})
        }
        deleted += 1
      } catch (error) {
        console.warn('Failed deleting playlist', id, error)
      }
    }
    itemsStore.clearSelection()
    eventBus.emit('playlists:reload')
    if (deleted > 0) {
      setNotification({
        type: 'success',
        title: permanent
          ? t('playlists.delete_selected_done', {count: deleted})
          : t('notifications_text.items_moved_to_trash'),
      })
    }
    if (deleted < ids.length) {
      setNotification({
        type: 'warning',
        title: t('playlists.delete_selected_failed'),
        text: `${deleted}/${ids.length}`,
      })
    }
  }
  dialogsStore.confirm.show = true
}

function selectVisible() {
  if (route.path === '/folders') selectAllMixedGridEntries()
  else itemsStore.selectAllOnPage()
}

async function selectAll() {
  if (route.path === '/folders') selectAllMixedGridEntries()
  else await itemsStore.selectAllFiltered()
}
</script>
