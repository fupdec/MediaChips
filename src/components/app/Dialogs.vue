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
    <DialogDocumentation v-show="dialogsStore.documentation"/>
    <DialogFeedback v-if="dialogsStore.feedback"/>
    <DialogFindInPage v-if="dialogsStore.findInPage.show"/>
    <DialogVersionHistory v-if="dialogsStore.versions"/>
    <DialogChangelog v-if="dialogsStore.changelog.show"/>

    <DialogError v-if="dialogsStore.error.show"/>

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

    <DialogBulkEditingItems
      v-if="dialogsStore.bulkEditingItems"
      @close="dialogsStore.bulkEditingItems = false"
    />

    <DialogTagEditing
      v-if="dialogsStore.tagEditing.show"
      @close="dialogsStore.tagEditing.show = false"
    />

    <DialogGlobalDeleteConfirm
      v-if="dialogsStore.confirm.show"
      @close="dialogsStore.confirm.show = false"
    />

    <DialogPlaylistAdd
      v-if="dialogsStore.playlistAdd.show"
      :dialog="dialogsStore.playlistAdd.show"
      :mediaIds="dialogsStore.playlistAdd.mediaIds"
      @close="dialogsStore.closePlaylistAdd()"
      @add="dialogsStore.closePlaylistAdd()"
    />

    <DialogFolder v-if="watcherStore.dialogFolder"/>

    <DialogSelectFolder
      v-if="operationsStore.moving.dialog"
      @select="moveFiles"
      @close="operationsStore.moving.dialog = false"
    />

    <DialogOrganizeMediaByTag v-if="operationsStore.create_folder_move_media.dialog"/>

    <DialogMigration v-if="operationsStore.migrationLowDb.dialog"/>

    <DialogScraper
      v-if="dialogsStore.scraper.show"
      @close="dialogsStore.scraper.show = false"
    />

    <DialogScraperMultiple
      v-if="dialogsStore.scraperMultiple.show"
      @close="dialogsStore.scraperMultiple.show = false"
    />

    <DialogSceneScraper
      v-if="dialogsStore.sceneScraper.show"
      @close="dialogsStore.sceneScraper.show = false"
    />

    <DialogSceneScraperMultiple
      v-if="dialogsStore.sceneScraperMultiple.show"
      @close="dialogsStore.sceneScraperMultiple.show = false"
    />

    <v-dialog
      v-model="dialogsStore.about.show"
      width="500"
      :z-index="2400"
    >
      <v-card>
        <v-card-title primary-title>{{ t('aboutApp.dialog_title') }}</v-card-title>
        <v-card-text class="pa-2 pa-sm-4">
          <About/>
        </v-card-text>
        <v-card-actions>
          <v-spacer/>
          <v-btn color="primary" @click="dialogsStore.about.show = false">
            {{ t('common.close') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import {defineAsyncComponent} from 'vue'
import {useAppStore} from '@/stores/app'
import {useDialogsStore} from '@/stores/dialogs'
import {useTasksStore} from '@/stores/tasks'
import {useWatcherStore} from '@/stores/watcher'
import {useOperationsStore} from '@/stores/operations'
import {useItemsStore} from '@/stores/items'
import {useI18n} from 'vue-i18n'

// Async components
const DialogLogin = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogLogin.vue')
)
const DialogOnboarding = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogOnboarding.vue')
)
const DialogDocumentation = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogDocumentation.vue')
)
const DialogFeedback = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogFeedback.vue')
)
const DialogFindInPage = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogFindInPage.vue')
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
const DialogError = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogError.vue')
)
const DialogProcess = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogProcess.vue')
)
const DialogScraper = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogScraper.vue')
)
const DialogScraperMultiple = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogScraperMultiple.vue')
)
const DialogSceneScraper = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogSceneScraper.vue')
)
const DialogSceneScraperMultiple = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogSceneScraperMultiple.vue')
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
const DialogTagEditing = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogTagEditing.vue')
)
const DialogBulkEditingItems = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogBulkEditingItems.vue')
)
const DialogFolder = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogFolder.vue')
)
const DialogGlobalDeleteConfirm = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogGlobalDeleteConfirm.vue')
)
const DialogPlaylistAdd = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogPlaylistAdd.vue')
)
const DialogSelectFolder = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogSelectFolder.vue')
)
const About = defineAsyncComponent(() =>
  import('@/components/app/About.vue')
)

const appStore = useAppStore()
const dialogsStore = useDialogsStore()
const tasksStore = useTasksStore()
const watcherStore = useWatcherStore()
const operationsStore = useOperationsStore()
const itemsStore = useItemsStore()
const {t} = useI18n()

const closeApp = () => {
  if (window.electronAPI?.send) {
    window.electronAPI.send("closeApp")
  }
}

const moveFiles = async () => {
  await operationsStore.moveFiles()
  itemsStore.selection = []
  operationsStore.moving.dialog = false
}
</script>