<template>
  <div>
    <v-dialog
      v-model="appStore.isServerError"
      persistent
      opacity="1"
      width="700"
    >
      <v-alert type="error" variant="flat" class="mb-0" rounded="lg">
        SYSTEM ERROR:
        Failed to start the server.
        The config file may be incorrect.
        <br>
        After updating the config file, please restart the application.
      </v-alert>
    </v-dialog>

    <DialogLogin
      :model-value="appStore.isLocked"
      @close="closeApp"
      @success="appStore.isLocked = false"
    />

    <DialogOnboarding v-if="dialogsStore.onboarding.show"/>
    <DialogAdultOnboarding v-if="adultUiAvailable && dialogsStore.adultOnboarding.show"/>
    <DialogDocumentation v-show="dialogsStore.documentation"/>
    <DialogLocalAiAssistant v-if="LOCAL_AI_UI_ENABLED && dialogsStore.localAi.show"/>
    <DialogFeedback v-if="dialogsStore.feedback"/>
    <DialogVersionHistory v-if="dialogsStore.versions"/>
    <DialogChangelog v-if="dialogsStore.changelog.show"/>

    <DialogKeyboardShortcuts
      v-model="showKeyboardShortcuts"
      @open-player-docs="openPlayerHotkeyDocs"
    />

    <DialogMediaAdding
      v-model="addMediaDialogOpen"
      hide-activator
      :initial-paths="addMediaInitialPaths"
      :initial-browse-path="addMediaInitialBrowsePath"
    />

    <DialogError v-if="dialogsStore.error.show"/>

    <DialogPaywall v-if="dialogsStore.paywall.show"/>

    <DialogProcess
      v-if="dialogsStore.process.show"
      :dialog="dialogsStore.process.show"
      :text="dialogsStore.process.text ?? undefined"
    />

    <DialogMediaAddingProcess
      v-if="tasksStore.mediaAdding.dialogProcess"
    />

    <TagsAdd v-if="!itemsStore.type" :button="false" />

    <DialogMediaEditing
      v-if="dialogsStore.mediaEditing.show"
      @close="dialogsStore.mediaEditing.show = false"
    />

    <DialogFaceResults
      v-if="dialogsStore.faceResults.show"
      @close="dialogsStore.closeFaceResults()"
    />

    <DialogEnrollmentQuality
      v-if="dialogsStore.enrollmentQuality.show"
      @close="dialogsStore.closeEnrollmentQuality()"
    />

    <DialogBulkEditingItems
      v-if="dialogsStore.bulkEditingItems"
      @close="dialogsStore.bulkEditingItems = false"
    />

    <DialogTagEditing
      v-if="dialogsStore.tagEditing.show"
      @close="dialogsStore.tagEditing.show = false"
    />

    <DialogTagMerge
      v-if="dialogsStore.tagMerge.show"
    />

    <DialogMediaMerge
      v-if="dialogsStore.mediaMerge.show"
    />

    <DialogDuplicateReview
      v-if="dialogsStore.duplicateReview.show"
    />

    <DialogSimilarMediaWall
      v-if="dialogsStore.similarWall.show"
    />

    <DialogMediaTrash
      v-if="dialogsStore.mediaTrash.show"
    />

    <DialogVideoConversion
      v-if="dialogsStore.videoConversion.show"
    />

    <DialogTextPreview
      v-if="dialogsStore.textPreview.show"
    />

    <DialogTagCategoryMerge
      v-if="dialogsStore.tagCategoryMerge.show"
    />

    <DialogConfirm
      v-if="dialogsStore.confirm.show"
      :variant="dialogsStore.confirm.variant || 'delete'"
      :dialog="dialogsStore.confirm.show"
      :text="dialogsStore.confirm.text || ''"
      :check-box-text="dialogsStore.confirm.checkBoxText"
      :check-box="dialogsStore.confirm.checkBox"
      :check-box2-text="dialogsStore.confirm.checkBox2Text"
      :check-box2="dialogsStore.confirm.checkBox2"
      :check-box2-requires-primary="dialogsStore.confirm.checkBox2RequiresPrimary"
      @update:check-box="dialogsStore.confirm.checkBox = $event"
      @update:check-box2="dialogsStore.confirm.checkBox2 = $event"
      @close="closeConfirmDialog"
      @confirm="runConfirmDialog"
    />

    <DialogTagTrashConflict v-if="dialogsStore.tagTrashConflict.show" />

    <DialogPlaylistAdd
      v-if="dialogsStore.playlistAdd.show"
      :dialog="dialogsStore.playlistAdd.show"
      :mediaIds="dialogsStore.playlistAdd.mediaIds"
      @close="dialogsStore.closePlaylistAdd()"
      @add="onPlaylistAdded"
    />

    <DialogFolder v-if="watcherStore.dialogFolder"/>
    <DialogMediaInbox v-if="mediaInboxStore.dialog"/>
    <DialogWatchFolderRisk v-if="watchFolderRiskOpen"/>

    <DialogBrowseFolder
      v-if="operationsStore.moving.dialog"
      v-model="operationsStore.moving.dialog"
      path-input
      validate-exists
      show-native-picker
      :initial-path="operationsStore.moving.folderPath"
      @confirm="onMoveFolderConfirm"
    />

    <DialogBrowseFolder
      v-if="chooseLibraryFolderDialogOpen"
      v-model="chooseLibraryFolderDialogOpen"
      :header="t('empty_states.choose_library_folder')"
      :confirm-text="t('empty_states.choose_library_folder')"
      @confirm="onChooseLibraryFolderConfirm"
    />

    <DialogOrganizeMediaByTag v-if="operationsStore.create_folder_move_media.dialog"/>

    <DialogMigration v-if="operationsStore.migrationLowDb.dialog"/>

    <DialogScraper
      v-if="adultUiAvailable && dialogsStore.scraper.show"
      @close="dialogsStore.scraper.show = false"
    />

    <DialogCamGirlFinder
      v-if="adultUiAvailable && dialogsStore.camgirlFinder.show"
      @close="dialogsStore.closeCamGirlFinder()"
    />

    <DialogScraperMultiple
      v-if="adultUiAvailable && dialogsStore.scraperMultiple.show"
      @close="dialogsStore.scraperMultiple.show = false"
    />

    <DialogSceneScraper
      v-if="adultUiAvailable && dialogsStore.sceneScraper.show"
      @close="dialogsStore.sceneScraper.show = false"
    />

    <DialogSceneScraperMultiple
      v-if="adultUiAvailable && dialogsStore.sceneScraperMultiple.show"
      @close="dialogsStore.sceneScraperMultiple.show = false"
    />

    <DialogTmdbScraper
      v-if="tmdbUiAvailable && dialogsStore.tmdbScraper.show"
      @close="dialogsStore.tmdbScraper.show = false"
    />
    <DialogTmdbPersonScraper
      v-if="tmdbUiAvailable && dialogsStore.tmdbPersonScraper.show"
      @close="dialogsStore.tmdbPersonScraper.show = false"
    />

    <v-dialog
      v-model="dialogsStore.about.show"
      width="500"
      :z-index="2400"
    >
      <v-card rounded="xl">
        <DialogHeader
          :header="t('aboutApp.dialog_title')"
          icon="information-outline"
          closable
          @close="dialogsStore.about.show = false"
        />
        <v-card-text class="pa-2 pa-sm-4">
          <About/>
        </v-card-text>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import {defineAsyncComponent, computed, ref, onMounted, onBeforeUnmount, watch} from 'vue'
import {useAppStore} from '@/stores/app'
import {useDialogsStore} from '@/stores/dialogs'
import {useTasksStore} from '@/stores/tasks'
import {useWatcherStore} from '@/stores/watcher'
import {useMediaInboxStore} from '@/stores/mediaInbox'
import {useOperationsStore} from '@/stores/operations'
import {useItemsStore} from '@/stores/items'
import {usePluginsStore} from '@/stores/plugins'
import {useI18n} from 'vue-i18n'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import {useAppHotkeys} from '@/composable/useAppHotkeys'
import {useBrowserLayoutHotkeys} from '@/composable/useBrowserLayoutHotkeys'
import {useItemsSelectionHotkeys} from '@/composable/useItemsSelectionHotkeys'
import useItemContextMenu from '@/composable/ItemContextMenu'
import {registerAppShellHandler} from '@/composable/appShell'
import {useChooseLibraryFolderDialog} from '@/composable/useChooseLibraryFolder'
import {useWatchFolderRiskGateState} from '@/composable/useWatchFolderRiskGate'
import {eventBus} from '@/utils/eventBus'
import {LOCAL_AI_UI_ENABLED} from '@shared/features'
import type {MediaItem, Tag} from '@/types/stores'

// Async components
const DialogLogin = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogLogin.vue')
)
const DialogOnboarding = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogOnboarding.vue')
)
const DialogAdultOnboarding = defineAsyncComponent(() =>
  import('@mediachips/plugin-adult/components/DialogAdultOnboarding.vue')
)
const DialogDocumentation = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogDocumentation.vue')
)
const DialogLocalAiAssistant = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogLocalAiAssistant.vue')
)
const DialogFeedback = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogFeedback.vue')
)
const DialogVersionHistory = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogVersionHistory.vue')
)
const DialogChangelog = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogChangelog.vue')
)
const DialogMigration = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogMigration.vue')
)
const DialogKeyboardShortcuts = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogKeyboardShortcuts.vue')
)
const DialogMediaAdding = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogMediaAdding.vue')
)
const DialogError = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogError.vue')
)
const DialogPaywall = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogPaywall.vue')
)
const DialogProcess = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogProcess.vue')
)
const DialogScraper = defineAsyncComponent(() =>
  import('@mediachips/plugin-adult/components/DialogScraper.vue')
)
const DialogCamGirlFinder = defineAsyncComponent(() =>
  import('@mediachips/plugin-adult/components/DialogCamGirlFinder.vue')
)
const DialogScraperMultiple = defineAsyncComponent(() =>
  import('@mediachips/plugin-adult/components/DialogScraperMultiple.vue')
)
const DialogSceneScraper = defineAsyncComponent(() =>
  import('@mediachips/plugin-adult/components/DialogSceneScraper.vue')
)
const DialogSceneScraperMultiple = defineAsyncComponent(() =>
  import('@mediachips/plugin-adult/components/DialogSceneScraperMultiple.vue')
)
const DialogTmdbScraper = defineAsyncComponent(() =>
  import('@mediachips/plugin-tmdb/components/DialogTmdbScraper.vue')
)
const DialogTmdbPersonScraper = defineAsyncComponent(() =>
  import('@mediachips/plugin-tmdb/components/DialogTmdbPersonScraper.vue')
)
const DialogMediaAddingProcess = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogMediaAddingProcess.vue')
)
const TagsAdd = defineAsyncComponent(() =>
  import('@/components/app/appbar/elements/TagsAdd.vue')
)
const DialogOrganizeMediaByTag = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogOrganizeMediaByTag.vue')
)
const DialogMediaEditing = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogMediaEditing.vue')
)
const DialogFaceResults = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogFaceResults.vue')
)
const DialogEnrollmentQuality = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogEnrollmentQuality.vue')
)
const DialogTagEditing = defineAsyncComponent({
  loader: () => import('@/components/dialogs/DialogTagEditing.vue'),
  onError(error, _retry, fail) {
    console.error('Failed to load DialogTagEditing', error)
    fail()
  },
})
const DialogTagMerge = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogTagMerge.vue')
)
const DialogMediaMerge = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogMediaMerge.vue')
)
const DialogDuplicateReview = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogDuplicateReview.vue')
)
const DialogSimilarMediaWall = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogSimilarMediaWall.vue')
)
const DialogMediaTrash = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogMediaTrash.vue')
)
const DialogVideoConversion = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogVideoConversion.vue')
)
const DialogTextPreview = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogTextPreview.vue')
)
const DialogTagCategoryMerge = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogTagCategoryMerge.vue')
)
const DialogBulkEditingItems = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogBulkEditingItems.vue')
)
const DialogFolder = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogFolder.vue')
)
const DialogWatchFolderRisk = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogWatchFolderRisk.vue')
)
const DialogMediaInbox = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogMediaInbox.vue')
)
const DialogConfirm = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogConfirm.vue')
)
const DialogTagTrashConflict = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogTagTrashConflict.vue')
)
const DialogBrowseFolder = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogBrowseFolder.vue')
)
const DialogPlaylistAdd = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogPlaylistAdd.vue')
)
const About = defineAsyncComponent(() =>
  import('@/components/app/About.vue')
)

const appStore = useAppStore()
const dialogsStore = useDialogsStore()
const tasksStore = useTasksStore()
const watcherStore = useWatcherStore()
const mediaInboxStore = useMediaInboxStore()
const operationsStore = useOperationsStore()
const itemsStore = useItemsStore()
const pluginsStore = usePluginsStore()
const {t} = useI18n()
const { showShortcuts: showKeyboardShortcuts, openPlayerDocs: openPlayerHotkeyDocs } = useAppHotkeys()
useBrowserLayoutHotkeys()

function exitSelectMode() {
  itemsStore.isSelect = false
  itemsStore.selection = []
  itemsStore.selected_last = null
  itemsStore.selectionAnchor = null
}

function onPlaylistAdded() {
  dialogsStore.closePlaylistAdd()
  eventBus.$emit('playlists:reload')
}

function openBulkEditFromHotkey() {
  if (itemsStore.selection.length === 0) return
  dialogsStore.bulkEditingItems = true
  itemsStore.isSelect = false
}

function openDeleteFromHotkey() {
  if (itemsStore.selection.length === 0) return
  const id = itemsStore.selection[0]
  const item = (itemsStore.entities.find((entry) => Number(entry.id) === Number(id))
    ?? itemsStore.entities[0]
    ?? {id: 0, name: ''}) as MediaItem | Tag
  const metaId = itemsStore.environment.meta_id
  const meta = metaId
    ? appStore.meta.find((entry) => entry.id === metaId) ?? null
    : null
  const {deleteItem} = useItemContextMenu(item, itemsStore.type, meta, true, null)
  deleteItem()
}

function selectVisibleFromHotkey() {
  itemsStore.selection = itemsStore.itemsOnPage.map((item) => item.id)
  if (itemsStore.selection.length) {
    itemsStore.selected_last = itemsStore.selection[itemsStore.selection.length - 1] ?? null
  }
  itemsStore.selectionAnchor = null
}

useItemsSelectionHotkeys({
  onExitSelect: exitSelectMode,
  onBulkEdit: openBulkEditFromHotkey,
  onDelete: openDeleteFromHotkey,
  onSelectVisible: selectVisibleFromHotkey,
})

const addMediaDialogOpen = ref(false)
const addMediaInitialPaths = ref('')
const addMediaInitialBrowsePath = ref('')

function openAddMediaDialog(options?: {paths?: string; browsePath?: string}) {
  void (async () => {
    const {useFreeLibraryGate} = await import('@/composable/useFreeLibraryGate')
    const gate = useFreeLibraryGate()
    if (!(await gate.ensureCanImportMedia())) return

    addMediaInitialPaths.value = options?.paths || ''
    addMediaInitialBrowsePath.value = options?.browsePath || ''
    addMediaDialogOpen.value = true
  })()
}

watch(addMediaDialogOpen, (open) => {
  if (open) return
  addMediaInitialPaths.value = ''
  addMediaInitialBrowsePath.value = ''
})

let unregisterShowAddMediaDialog: (() => void) | null = null

onMounted(() => {
  unregisterShowAddMediaDialog = registerAppShellHandler('showAddMediaDialog', openAddMediaDialog)
})

onBeforeUnmount(() => {
  unregisterShowAddMediaDialog?.()
  unregisterShowAddMediaDialog = null
})

const adultUiAvailable = computed(() =>
  pluginsStore.isAdultEnabled,
)

const tmdbUiAvailable = computed(() =>
  pluginsStore.enabledPluginIds.includes('mediachips.tmdb'),
)

const {open: chooseLibraryFolderDialogOpen, onConfirm: onChooseLibraryFolderConfirm} = useChooseLibraryFolderDialog()
const watchFolderRiskOpen = computed(() => useWatchFolderRiskGateState().open)

const closeApp = () => {
  if (window.electronAPI?.send) {
    // Lock-screen dismiss is an explicit exit, not minimize-to-tray.
    window.electronAPI.send("closeApp", {force: true})
  }
}

function closeConfirmDialog() {
  dialogsStore.confirm.show = false
  dialogsStore.confirm.checkBoxText = ''
  dialogsStore.confirm.checkBox = false
  dialogsStore.confirm.checkBox2Text = ''
  dialogsStore.confirm.checkBox2 = false
  dialogsStore.confirm.checkBox2RequiresPrimary = false
  dialogsStore.confirm.variant = 'delete'
}

function runConfirmDialog() {
  if (typeof dialogsStore.confirm.action === 'function') {
    dialogsStore.confirm.action()
  }
  closeConfirmDialog()
}

async function onMoveFolderConfirm(paths: string[]) {
  const path = paths[0]?.trim()
  if (!path) return
  operationsStore.moving.folderPath = path
  await operationsStore.moveFiles()
  itemsStore.selection = []
  operationsStore.moving.dialog = false
}
</script>