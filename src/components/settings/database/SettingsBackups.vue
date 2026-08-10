<template>
  <div>
    <v-btn
      id="database_backups"
      color="primary"
      rounded="pill"
      variant="flat"
      class="pr-4"
    >
      <v-icon icon="mdi-backup-restore" class="mr-2"/>
      {{ t('settings_labels.database.manage_backups') }}
    </v-btn>

    <v-dialog
      :fullscreen="xs"
      :model-value="dialog"
      activator="#database_backups"
      @after-enter="manageBackups"
      max-width="720"
      scrollable
      persistent
    >
      <v-card class="backups-dialog" rounded="xl">
        <DialogHeader
          :header="t('settings_labels.database.backups_management')"
          closable
          @close="dialog = false"
        />

        <v-card-text class="pt-2 pb-0 px-4 px-sm-6">
          <p class="text-body-2 text-medium-emphasis mb-4">
            {{ t('settings_labels.database.backups_hint') }}
          </p>

          <div class="backups-toolbar mb-4">
            <v-btn
              prepend-icon="mdi-plus"
              :text="t('settings_labels.database.create_backup')"
              color="success"
              variant="flat"
              rounded="pill"
              class="pr-4"
              @click="createBackup"
            />

            <div class="backups-toolbar__group">
              <v-btn
                icon="mdi-database-refresh"
                :aria-label="t('settings_labels.database.restore_backup')"
                :title="t('settings_labels.database.restore_backup')"
                color="warning"
                variant="tonal"
                rounded="pill"
                :disabled="!isSelectedSingle"
                @click="dialogRestoreConfirm = true"
              />
              <v-btn
                icon="mdi-trash-can-outline"
                :aria-label="t('settings_labels.database.delete_backup')"
                :title="t('settings_labels.database.delete_backup')"
                color="error"
                variant="tonal"
                rounded="pill"
                :disabled="notSelected"
                @click="dialogDelete = true"
              />
              <v-btn
                icon="mdi-export-variant"
                :aria-label="t('settings_labels.database.export_backup')"
                :title="t('settings_labels.database.export_backup')"
                color="info"
                variant="tonal"
                rounded="pill"
                :disabled="notSelected"
                @click="dialogExport = true"
              />
              <v-btn
                icon="mdi-import"
                :aria-label="t('settings_labels.database.import_backup')"
                :title="t('settings_labels.database.import_backup')"
                color="primary"
                variant="tonal"
                rounded="pill"
                @click="dialogImport = true"
              />
            </div>
          </div>

          <div
            v-if="!isLoaded"
            class="backups-loading d-flex justify-center py-10"
          >
            <v-progress-circular indeterminate color="primary" size="36"/>
          </div>

          <div
            v-else-if="!backups.length"
            class="backups-empty text-center py-10 px-4"
          >
            <v-avatar
              color="primary"
              variant="tonal"
              size="56"
              class="mb-3"
            >
              <v-icon icon="mdi-archive-outline" size="28"/>
            </v-avatar>
            <div class="text-body-1 font-weight-medium mb-1">
              {{ t('settings_labels.database.no_backups') }}
            </div>
            <div class="text-caption text-medium-emphasis">
              {{ t('settings_labels.database.backups_empty_hint') }}
            </div>
          </div>

          <v-list
            v-else
            class="px-0 settings-outlined-list backups-list mb-2"
            density="compact"
            rounded="xl"
            bg-color="transparent"
          >
            <v-list-item
              v-for="(backup, index) in backups"
              :key="backup.date"
              rounded="pill"
              variant="outlined"
              class="backups-row py-2"
              :class="{
                'backups-row--zebra': index % 2 === 1,
                'backups-row--selected': isBackupSelected(backup),
              }"
              @click="toggleBackup(backup)"
            >
              <template #prepend>
                <v-checkbox-btn
                  :model-value="isBackupSelected(backup)"
                  color="primary"
                  class="mr-1"
                  @click.stop="toggleBackup(backup)"
                />
                <v-avatar
                  color="primary"
                  variant="tonal"
                  size="32"
                  class="mr-1"
                >
                  <v-icon icon="mdi-zip-box-outline" size="18"/>
                </v-avatar>
              </template>

              <v-list-item-title class="text-body-2 font-weight-medium">
                {{ formatBackupDate(backup.date) }}
              </v-list-item-title>
              <v-list-item-subtitle class="text-caption">
                {{ formatBackupSize(backup.size) }}
              </v-list-item-subtitle>

              <template #append>
                <div class="backups-row__actions d-flex" @click.stop>
                  <v-btn
                    icon
                    variant="text"
                    size="small"
                    rounded="pill"
                    color="warning"
                    :aria-label="t('settings_labels.database.restore_backup')"
                    @click="selectOnly(backup); dialogRestoreConfirm = true"
                  >
                    <v-icon icon="mdi-database-refresh" size="18"/>
                  </v-btn>
                  <v-btn
                    icon
                    variant="text"
                    size="small"
                    rounded="pill"
                    color="error"
                    :aria-label="t('settings_labels.database.delete_backup')"
                    @click="selectOnly(backup); dialogDelete = true"
                  >
                    <v-icon icon="mdi-delete-outline" size="18"/>
                  </v-btn>
                </div>
              </template>
            </v-list-item>
          </v-list>
        </v-card-text>

        <v-card-actions
          v-if="selected.length"
          class="px-4 px-sm-6 pb-4 pt-2"
        >
          <div class="text-caption text-medium-emphasis">
            {{ t('settings_labels.database.backups_selected', {count: selected.length}) }}
          </div>
          <v-spacer/>
          <v-btn
            variant="text"
            rounded="pill"
            size="small"
            @click="selected = []"
          >
            {{ t('common.clear') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <DialogConfirm
      :dialog="dialogRestoreConfirm"
      :text="t('settings_labels.database.restore_confirm')"
      @close="dialogRestoreConfirm = false"
      @confirm="restoreBackup"
    />

    <DialogConfirm
      :dialog="dialogRestoreFinished"
      :closable="false"
      :text="restoreCompleteText"
      @close="dialogRestoreFinished = false"
      @confirm="closeRestoreFinished"
    />

    <DialogConfirm
      v-if="dialogDelete"
      variant="delete"
      :dialog="dialogDelete"
      :text="t('settings_labels.database.delete_confirm')"
      @close="dialogDelete = false"
      @delete="deleteBackups"
    />

    <v-dialog v-model="dialogImport" width="560">
      <v-card rounded="xl" class="backups-path-dialog">
        <DialogHeader
          @close="dialogImport = false"
          :header="t('settings_labels.database.select_backup')"
          closable
          :buttons="[
            {
              icon: 'database-import',
              text: t('settings_labels.database.import_backup'),
              color: 'success',
              outlined: false,
              disabled: !filePath,
              action: importBackup,
            },
          ]"
        />

        <v-card-text class="pt-4 px-4 px-sm-6">
          <v-alert
            v-if="filePath.trim() && isFileExists === false"
            type="error"
            density="compact"
            rounded="xl"
            variant="tonal"
            class="mb-4"
          >
            {{ t('settings_labels.database.file_missing') }}
          </v-alert>

          <div class="backups-path-actions mb-4">
            <v-btn
              v-if="isElectron"
              @click="chooseFile"
              color="primary"
              rounded="pill"
              variant="flat"
              class="pr-4"
            >
              <v-icon start>mdi-file-outline</v-icon>
              {{ t('settings_labels.database.select_backup') }}
            </v-btn>
            <v-btn
              @click="showImportBrowseDialog = true"
              color="primary"
              rounded="pill"
              :variant="isElectron ? 'tonal' : 'flat'"
              class="pr-4"
            >
              <v-icon start>mdi-folder-search-outline</v-icon>
              {{ t('media.adding.browse_folders') }}
            </v-btn>
          </div>

          <v-text-field
            :model-value="filePath"
            @update:model-value="onFilePathInput"
            @blur="validateFilePath"
            :label="t('settings_labels.database.path_to_backup')"
            variant="outlined"
            rounded="lg"
            density="comfortable"
            hide-details="auto"
            autofocus
          />
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog v-model="dialogExport" width="560">
      <v-card rounded="xl" class="backups-path-dialog">
        <DialogHeader
          @close="dialogExport = false"
          :header="t('settings_labels.database.select_folder')"
          closable
          :buttons="[
            {
              icon: 'database-export',
              text: t('settings_labels.database.export_backup'),
              color: 'success',
              outlined: false,
              disabled: !folderPath,
              action: exportBackup,
            },
          ]"
        />

        <v-card-text class="pt-4 px-4 px-sm-6">
          <v-alert
            v-if="folderPath.trim() && isFolderExists === false"
            type="error"
            density="compact"
            rounded="xl"
            variant="tonal"
            class="mb-4"
          >
            {{ t('settings_labels.database.folder_missing') }}
          </v-alert>

          <div class="backups-path-actions mb-4">
            <v-btn
              v-if="isElectron"
              @click="chooseDirNative"
              color="primary"
              rounded="pill"
              variant="flat"
              class="pr-4"
            >
              <v-icon start>mdi-folder-open</v-icon>
              {{ t('settings_labels.database.select_folder') }}
            </v-btn>
            <v-btn
              @click="showBrowseDialog = true"
              color="primary"
              rounded="pill"
              :variant="isElectron ? 'tonal' : 'flat'"
              class="pr-4"
            >
              <v-icon start>mdi-folder-search-outline</v-icon>
              {{ t('media.adding.browse_folders') }}
            </v-btn>
          </div>

          <v-text-field
            :model-value="folderPath"
            @update:model-value="onFolderPathInput"
            @blur="validateFolderPath"
            :label="t('settings_labels.database.path_to_folder')"
            variant="outlined"
            rounded="lg"
            density="comfortable"
            hide-details="auto"
            autofocus
          />
        </v-card-text>
      </v-card>
    </v-dialog>

    <DialogBrowseFolder
      v-model="showBrowseDialog"
      :initial-path="folderPath"
      @confirm="onBrowseConfirm"
    />

    <DialogBrowseFolder
      v-model="showImportBrowseDialog"
      :header="t('settings_labels.database.select_backup')"
      :file-extensions="['zip']"
      :confirm-text="t('common.select')"
      @confirm="onImportBrowseConfirm"
    />
  </div>
</template>

<script setup lang="ts">
import {ref, computed} from 'vue'
import {useDisplay} from 'vuetify'
import {useI18n} from 'vue-i18n'
import {typedApi} from '@/services/typedApi'
import {isElectron as hasElectronBridge, showElectronOpenDialog} from '@/services/electronBridge'
import {useAppStore} from '@/stores/app'
import {useDialogsStore} from '@/stores/dialogs'
import type {BackupEntry} from '@/types/settings'
import {getErrorResponseData} from '@/types/vue'

import DialogHeader from '@/components/elements/DialogHeader.vue'
import DialogConfirm from '@/components/dialogs/DialogConfirm.vue'
import DialogBrowseFolder from '@/components/dialogs/DialogBrowseFolder.vue'
import {normalizePastedFilePath} from '@/utils/filePathInput'
import {checkFileExists} from '@/services/fileService'
import {setNotification} from '@/services/notificationService'
import {reloadApplicationAfterDatabaseChange} from '@/services/configService'

const {xs} = useDisplay()
const {t} = useI18n()

const dialog = ref(false)
const dialogRestoreConfirm = ref(false)
const dialogRestoreFinished = ref(false)
const dialogDelete = ref(false)
const dialogImport = ref(false)
const dialogExport = ref(false)
const showBrowseDialog = ref(false)
const showImportBrowseDialog = ref(false)

const isLoaded = ref(false)
const backups = ref<BackupEntry[]>([])
const selected = ref<BackupEntry[]>([])

const filePath = ref('')
const folderPath = ref('')
const isFileExists = ref<boolean | null>(null)
const isFolderExists = ref<boolean | null>(null)

const appStore = useAppStore()
const dialogsStore = useDialogsStore()

const isElectron = computed(() => Boolean(appStore.isElectron) || hasElectronBridge())

const notSelected = computed(() => selected.value.length === 0)
const isSelectedSingle = computed(() => selected.value.length === 1)
const restoreCompleteText = computed(() => t('settings_labels.database.restore_complete'))

const onFilePathInput = (value: string) => {
  filePath.value = normalizePastedFilePath(value) as string
  isFileExists.value = null
}

const onFolderPathInput = (value: string) => {
  folderPath.value = normalizePastedFilePath(value) as string
  isFolderExists.value = null
}

const validateFilePath = async () => {
  const path = normalizePastedFilePath(filePath.value) as string
  filePath.value = path
  if (!path) {
    isFileExists.value = null
    return
  }
  isFileExists.value = await checkFileExists(path)
}

const validateFolderPath = async () => {
  const path = normalizePastedFilePath(folderPath.value) as string
  folderPath.value = path
  if (!path) {
    isFolderExists.value = null
    return
  }
  isFolderExists.value = await checkFileExists(path)
}

function manageBackups() {
  dialog.value = true
  setTimeout(getBackups, 300)
}

async function getBackups() {
  isLoaded.value = false
  try {
    const {data} = await typedApi.getBackups()
    backups.value = data || []
  } catch {
    backups.value = []
  }
  isLoaded.value = true
  selected.value = []
}

function isBackupSelected(backup: BackupEntry) {
  return selected.value.some((entry) => entry.date === backup.date)
}

function toggleBackup(backup: BackupEntry) {
  if (isBackupSelected(backup)) {
    selected.value = selected.value.filter((entry) => entry.date !== backup.date)
    return
  }
  selected.value = [...selected.value, backup]
}

function selectOnly(backup: BackupEntry) {
  selected.value = [backup]
}

function formatBackupDate(raw: string) {
  return String(raw || '').replace(/\.zip$/i, '').replace(/-/g, ':')
}

function formatBackupSize(size: BackupEntry['size']) {
  if (size == null || size === '') return '—'
  const num = typeof size === 'number' ? size : Number(size)
  if (!Number.isFinite(num)) return String(size)
  return t('settings_labels.database.backup_size_mb', {size: num.toFixed(2)})
}

async function createBackup() {
  dialogsStore.process.show = true
  await typedApi.createBackup()
  await getBackups()
  dialogsStore.process.show = false
}

async function deleteBackups() {
  dialogsStore.process.show = true
  for (const i of selected.value) {
    await typedApi.deleteBackup({
      name: i.date,
    })
  }
  dialogsStore.process.show = false
  selected.value = []
  await getBackups()
}

async function restoreBackup() {
  dialogsStore.process.show = true
  try {
    await typedApi.restoreBackup({
      name: selected.value[0].date,
    })
    await reloadApplicationAfterDatabaseChange()
    dialogRestoreFinished.value = true
  } catch (error) {
    console.error('Failed to restore backup:', error)
  } finally {
    dialogsStore.process.show = false
  }
}

function closeRestoreFinished() {
  dialogRestoreFinished.value = false
}

async function importBackup() {
  const path = normalizePastedFilePath(filePath.value) as string
  filePath.value = path
  if (!path) return

  isFileExists.value = await checkFileExists(path)
  if (isFileExists.value === false) return

  setNotification({
    type: 'info',
    title: t('settings_labels.database.import_backup'),
    text: t('settings_labels.database.import_backup_started'),
  })

  try {
    await typedApi.importBackup({path})
    await getBackups()
    dialogImport.value = false
    filePath.value = ''
    setNotification({
      type: 'success',
      title: t('settings_labels.database.import_backup'),
      text: t('settings_labels.database.import_backup_success'),
    })
  } catch (error) {
    console.error('Import backup failed:', error)
    const responseData = getErrorResponseData<{message?: string} | string>(error)
    const message = (typeof responseData === 'object' ? responseData?.message : responseData)
      || t('settings_labels.database.failed_import_backup')
    setNotification({
      type: 'error',
      title: t('settings_labels.database.import_backup'),
      text: message,
    })
  }
}

async function exportBackup() {
  const path = normalizePastedFilePath(folderPath.value) as string
  folderPath.value = path
  if (!path) return

  isFolderExists.value = await checkFileExists(path)
  if (isFolderExists.value === false) return

  dialogExport.value = false
  dialogsStore.process.show = true

  try {
    for (const i of selected.value) {
      await typedApi.exportBackup({
        archive: i.date,
        path,
      })
    }
  } catch (error) {
    console.error('Export backup failed:', error)
    setNotification({
      text: getErrorResponseData<{message?: string}>(error)?.message
        || t('settings_labels.database.failed_export_backup'),
      type: 'error',
    })
  }

  dialogsStore.process.show = false
  selected.value = []
  folderPath.value = ''
  await getBackups()
}

function onBrowseConfirm(paths: string[]) {
  const next = paths[0]
  if (!next) return
  folderPath.value = next
  isFolderExists.value = true
}

function onImportBrowseConfirm(paths: string[]) {
  const next = paths[0]
  if (!next) return
  filePath.value = next
  isFileExists.value = true
}

function notifyPickerUnavailable() {
  setNotification({
    type: 'warning',
    text: t('settings_labels.database.native_picker_unavailable'),
  })
}

async function chooseDirNative() {
  try {
    const res = await showElectronOpenDialog(['openDirectory'])
    if (!res) {
      notifyPickerUnavailable()
      return
    }
    if (res.error) {
      setNotification({
        type: 'error',
        text: res.message || t('settings_labels.database.native_picker_unavailable'),
      })
      return
    }
    if (res.filePaths?.length) {
      folderPath.value = res.filePaths[0]
      isFolderExists.value = true
    }
  } catch (error) {
    console.error('Native folder picker failed:', error)
    notifyPickerUnavailable()
  }
}

async function chooseFile() {
  try {
    const res = await showElectronOpenDialog({
      properties: ['openFile'],
      filters: [{name: 'ZIP', extensions: ['zip']}],
    })
    if (!res) {
      notifyPickerUnavailable()
      return
    }
    if (res.error) {
      setNotification({
        type: 'error',
        text: res.message || t('settings_labels.database.native_picker_unavailable'),
      })
      return
    }
    if (res.filePaths?.length) {
      filePath.value = res.filePaths[0]
      isFileExists.value = true
    }
  } catch (error) {
    console.error('Native file picker failed:', error)
    notifyPickerUnavailable()
  }
}
</script>

<style scoped>
.backups-dialog {
  overflow: hidden;
  background:
    radial-gradient(120% 80% at 0% 0%, rgba(var(--v-theme-primary), 0.08), transparent 55%),
    rgb(var(--v-theme-surface));
}

.backups-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.backups-toolbar__group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 6px;
  border-radius: 999px;
  background: rgba(var(--v-theme-on-surface), 0.04);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}

.backups-empty {
  border-radius: 20px;
  border: 1px dashed rgba(var(--v-theme-on-surface), 0.12);
  background: rgba(var(--v-theme-on-surface), 0.02);
}

.backups-list {
  gap: 6px;
}

.backups-row {
  margin-bottom: 6px !important;
  border-color: rgba(var(--v-theme-on-surface), 0.1) !important;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.backups-row--zebra {
  background: rgba(var(--v-theme-on-surface), 0.02);
}

.backups-row:hover {
  background: rgba(var(--v-theme-primary), 0.04);
}

.backups-row--selected {
  border-color: rgba(var(--v-theme-primary), 0.35) !important;
  background: rgba(var(--v-theme-primary), 0.06);
}

.backups-row__actions {
  opacity: 0.7;
}

.backups-row:hover .backups-row__actions {
  opacity: 1;
}

.backups-path-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.backups-path-dialog {
  background:
    radial-gradient(100% 70% at 100% 0%, rgba(var(--v-theme-primary), 0.07), transparent 50%),
    rgb(var(--v-theme-surface));
}
</style>
