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

        <v-card-text class="backups-dialog__body pt-2 pb-5 px-4 px-sm-6">
          <p class="backups-dialog__hint text-caption text-medium-emphasis mb-4">
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

            <div class="backups-toolbar__meta" v-if="isLoaded && backups.length">
              <span class="backups-toolbar__count">
                {{ backups.length }}
              </span>
              <span class="text-caption text-medium-emphasis">
                {{ formatBackupSize(totalBackupSize) }}
              </span>
              <span
                v-if="selected.length"
                class="backups-toolbar__selected text-caption"
              >
                {{ t('settings_labels.database.backups_selected', {count: selected.length}) }}
              </span>
            </div>

            <div class="backups-toolbar__group">
              <v-btn
                v-tooltip:top="t('settings_labels.database.delete_backup')"
                icon="mdi-trash-can-outline"
                :aria-label="t('settings_labels.database.delete_backup')"
                color="error"
                variant="tonal"
                rounded="pill"
                size="small"
                :disabled="notSelected"
                @click="dialogDelete = true"
              />
              <v-btn
                v-tooltip:top="t('settings_labels.database.export_backup')"
                icon="mdi-export-variant"
                :aria-label="t('settings_labels.database.export_backup')"
                color="info"
                variant="tonal"
                rounded="pill"
                size="small"
                :disabled="notSelected"
                @click="dialogExport = true"
              />
              <v-btn
                v-tooltip:top="t('settings_labels.database.import_backup')"
                icon="mdi-import"
                :aria-label="t('settings_labels.database.import_backup')"
                color="primary"
                variant="tonal"
                rounded="pill"
                size="small"
                @click="dialogImport = true"
              />
            </div>
          </div>

          <div
            v-if="isLoaded && backups.length"
            class="backups-sort mb-3"
          >
            <span class="backups-sort__label text-caption text-medium-emphasis">
              {{ t('filters.sort_by') }}
            </span>
            <v-btn-toggle
              v-model="sortField"
              mandatory
              divided
              density="compact"
              color="primary"
              rounded="pill"
              class="backups-sort__toggle"
            >
              <v-btn value="date" size="small" class="px-3">
                <v-icon icon="mdi-calendar-outline" start size="16"/>
                {{ t('settings_labels.database.backups_sort_date') }}
              </v-btn>
              <v-btn value="size" size="small" class="px-3">
                <v-icon icon="mdi-harddisk" start size="16"/>
                {{ t('settings_labels.database.backups_sort_size') }}
              </v-btn>
            </v-btn-toggle>
            <v-btn
              v-tooltip:top="t('filters.change_direction')"
              :icon="sortDir === 'desc' ? 'mdi-sort-descending' : 'mdi-sort-ascending'"
              :aria-label="t('filters.change_direction')"
              color="primary"
              variant="tonal"
              rounded="pill"
              size="small"
              @click="toggleSortDir"
            />
          </div>

          <div
            v-if="!isLoaded"
            class="backups-loading d-flex justify-center py-12"
          >
            <v-progress-circular indeterminate color="primary" size="36"/>
          </div>

          <div
            v-else-if="!backups.length"
            class="backups-empty text-center py-12 px-4"
          >
            <div class="backups-empty__icon mb-3" aria-hidden="true">
              <v-icon icon="mdi-backup-restore" size="28"/>
            </div>
            <div class="text-body-1 font-weight-medium mb-1">
              {{ t('settings_labels.database.no_backups') }}
            </div>
            <div class="text-caption text-medium-emphasis">
              {{ t('settings_labels.database.backups_empty_hint') }}
            </div>
          </div>

          <div v-else class="backups-list">
            <div
              v-for="backup in sortedBackups"
              :key="backup.date"
              class="backups-card"
              :class="{
                'backups-card--selected': isBackupSelected(backup),
                'backups-card--latest': isLatestBackup(backup),
              }"
              role="button"
              tabindex="0"
              @click="toggleBackup(backup)"
              @keydown.enter.prevent="toggleBackup(backup)"
              @keydown.space.prevent="toggleBackup(backup)"
            >
              <div
                class="backups-card__check"
                :class="{ 'backups-card__check--on': isBackupSelected(backup) }"
                aria-hidden="true"
              >
                <v-icon
                  v-if="isBackupSelected(backup)"
                  icon="mdi-check"
                  size="16"
                />
              </div>

              <div class="backups-card__icon" aria-hidden="true">
                <v-icon icon="mdi-archive-outline" size="20"/>
              </div>

              <div class="backups-card__meta">
                <div class="backups-card__title-row">
                  <span class="backups-card__title">
                    {{ formatBackupDate(backup.date) }}
                  </span>
                  <v-chip
                    v-if="isLatestBackup(backup)"
                    size="x-small"
                    color="success"
                    variant="tonal"
                    class="backups-card__badge"
                  >
                    {{ t('settings_labels.database.backup_latest') }}
                  </v-chip>
                </div>
                <div class="backups-card__size-row">
                  <span class="backups-card__size text-caption text-medium-emphasis">
                    {{ formatBackupSize(backup.size) }}
                  </span>
                  <span
                    v-if="shareOf(backup) != null"
                    class="backups-card__share text-caption text-medium-emphasis"
                  >
                    {{ Math.round(shareOf(backup)!) }}%
                  </span>
                </div>
                <div
                  v-if="shareOf(backup) != null"
                  class="backups-card__bar"
                  aria-hidden="true"
                >
                  <div
                    class="backups-card__bar-fill"
                    :style="{ width: `${shareOf(backup)}%` }"
                  />
                </div>
              </div>

              <v-btn
                prepend-icon="mdi-database-refresh"
                :text="t('settings_labels.database.restore_backup')"
                color="warning"
                variant="tonal"
                rounded="pill"
                size="small"
                class="pr-3 backups-card__restore"
                @click.stop="selectOnly(backup); dialogRestoreConfirm = true"
              />
            </div>
          </div>
        </v-card-text>
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
import {getApiErrorMessage, getErrorResponseData} from '@/types/vue'

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
const sortField = ref<'date' | 'size'>('date')
const sortDir = ref<'asc' | 'desc'>('desc')

const filePath = ref('')
const folderPath = ref('')
const isFileExists = ref<boolean | null>(null)
const isFolderExists = ref<boolean | null>(null)

const appStore = useAppStore()
const dialogsStore = useDialogsStore()

const isElectron = computed(() => Boolean(appStore.isElectron) || hasElectronBridge())

const notSelected = computed(() => selected.value.length === 0)
const restoreCompleteText = computed(() => t('settings_labels.database.restore_complete'))

function backupSizeNumber(size: BackupEntry['size']): number {
  if (size == null || size === '') return 0
  const num = typeof size === 'number' ? size : Number(size)
  return Number.isFinite(num) ? num : 0
}

const totalBackupSize = computed(() =>
  backups.value.reduce((sum, backup) => sum + backupSizeNumber(backup.size), 0),
)

const latestBackupDate = computed(() => {
  let latest: string | null = null
  for (const backup of backups.value) {
    if (!latest || backup.date.localeCompare(latest) > 0) {
      latest = backup.date
    }
  }
  return latest
})

const sortedBackups = computed(() => {
  const list = [...backups.value]
  const direction = sortDir.value === 'asc' ? 1 : -1
  list.sort((a, b) => {
    if (sortField.value === 'size') {
      const sizeDiff = backupSizeNumber(a.size) - backupSizeNumber(b.size)
      if (sizeDiff !== 0) return sizeDiff * direction
      return a.date.localeCompare(b.date) * direction
    }
    const dateDiff = a.date.localeCompare(b.date)
    if (dateDiff !== 0) return dateDiff * direction
    return (backupSizeNumber(a.size) - backupSizeNumber(b.size)) * direction
  })
  return list
})

function isLatestBackup(backup: BackupEntry) {
  return Boolean(latestBackupDate.value) && backup.date === latestBackupDate.value
}

function toggleSortDir() {
  sortDir.value = sortDir.value === 'desc' ? 'asc' : 'desc'
}

function shareOf(backup: BackupEntry): number | null {
  const total = totalBackupSize.value
  const size = backupSizeNumber(backup.size)
  if (total <= 0 || size <= 0) return null
  return Math.max(0, Math.min(100, (size / total) * 100))
}

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
    setNotification({
      type: 'error',
      title: t('settings_labels.database.restore_backup'),
      text: getApiErrorMessage(error, t('settings_labels.database.restore_backup')),
    })
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
    radial-gradient(120% 90% at 0% 0%, rgba(var(--v-theme-primary), 0.1), transparent 52%),
    radial-gradient(90% 70% at 100% 0%, rgba(var(--v-theme-success), 0.06), transparent 48%),
    rgb(var(--v-theme-surface));
}

.backups-dialog__hint {
  line-height: 1.45;
  max-width: 42rem;
}

.backups-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 12px;
}

.backups-toolbar__meta {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-right: auto;
  min-width: 0;
}

.backups-toolbar__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 0.8125rem;
  font-weight: 700;
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.12);
}

.backups-toolbar__selected {
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
}

.backups-toolbar__group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 5px;
  border-radius: 999px;
  background: rgba(var(--v-theme-on-surface), 0.04);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.06);
  margin-left: auto;
}

.backups-sort {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
}

.backups-sort__label {
  flex: 0 0 auto;
}

.backups-sort__toggle {
  flex: 0 1 auto;
}

.backups-empty {
  border-radius: 22px;
  border: 1px dashed rgba(var(--v-theme-on-surface), 0.14);
  background:
    radial-gradient(80% 120% at 50% 0%, rgba(var(--v-theme-primary), 0.08), transparent 65%),
    rgba(var(--v-theme-on-surface), 0.02);
}

.backups-empty__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 18px;
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.12);
}

.backups-list {
  display: grid;
  gap: 10px;
}

.backups-card {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 12px 12px 10px;
  text-align: left;
  cursor: pointer;
  border-radius: 18px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background: rgba(var(--v-theme-surface), 0.72);
  box-shadow: 0 1px 0 rgba(var(--v-theme-on-surface), 0.03);
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

.backups-card:hover {
  border-color: rgba(var(--v-theme-primary), 0.22);
  background: rgba(var(--v-theme-primary), 0.04);
  box-shadow: 0 8px 24px rgba(var(--v-theme-on-surface), 0.06);
  transform: translateY(-1px);
}

.backups-card--selected {
  border-color: rgba(var(--v-theme-primary), 0.42);
  background: rgba(var(--v-theme-primary), 0.08);
  box-shadow: 0 0 0 1px rgba(var(--v-theme-primary), 0.18);
}

.backups-card--latest:not(.backups-card--selected) {
  border-color: rgba(var(--v-theme-success), 0.22);
}

.backups-card__check {
  flex: 0 0 22px;
  width: 22px;
  height: 22px;
  border-radius: 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid rgba(var(--v-theme-on-surface), 0.22);
  background: rgba(var(--v-theme-surface), 0.9);
  color: #fff;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.backups-card__check--on {
  border-color: rgb(var(--v-theme-primary));
  background: rgb(var(--v-theme-primary));
}

.backups-card__icon {
  flex: 0 0 40px;
  width: 40px;
  height: 40px;
  border-radius: 13px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.1);
}

.backups-card--latest .backups-card__icon {
  color: rgb(var(--v-theme-success));
  background: rgba(var(--v-theme-success), 0.12);
}

.backups-card__meta {
  flex: 1 1 auto;
  min-width: 0;
}

.backups-card__title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.backups-card__title {
  font-size: 0.9375rem;
  font-weight: 650;
  line-height: 1.3;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.backups-card__badge {
  flex: 0 0 auto;
}

.backups-card__size-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-top: 2px;
}

.backups-card__size,
.backups-card__share {
  font-variant-numeric: tabular-nums;
}

.backups-card__bar {
  margin-top: 8px;
  height: 5px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(var(--v-theme-on-surface), 0.08);
}

.backups-card__bar-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(
    90deg,
    rgba(var(--v-theme-primary), 0.55),
    rgba(var(--v-theme-primary), 0.9)
  );
  transition: width 0.35s ease;
}

.backups-card--latest .backups-card__bar-fill {
  background: linear-gradient(
    90deg,
    rgba(var(--v-theme-success), 0.55),
    rgba(var(--v-theme-success), 0.9)
  );
}

.backups-card__restore {
  flex: 0 0 auto;
}

@media (max-width: 600px) {
  .backups-card {
    flex-wrap: wrap;
  }

  .backups-card__restore {
    width: 100%;
    margin-left: 34px;
  }

  .backups-toolbar__group {
    margin-left: 0;
  }
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
