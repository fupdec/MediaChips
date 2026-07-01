<template>
  <v-dialog v-model="dialog" persistent width="500">
    <v-card>
      <v-card-title primary-title>{{ t('migration.title') }}</v-card-title>
      <v-card-text class="pa-2 pa-sm-4">
        <div v-if="step == 1" class="mb-4">
          <v-alert type="info" class="body-2" variant="text" density="compact">
            {{ t('migration.old_data_found') }}
            <br>
            {{ t('migration.data_destroyed_warning') }}
          </v-alert>

          <v-checkbox v-model="is_copy_backups" :label="t('migration.copy_backups')"></v-checkbox>

          <v-btn @click="createBackupLowDb" color="success" class="mb-6" rounded variant="flat" block>
            <v-icon start>mdi-transfer</v-icon>
            {{ t('migration.start') }}
          </v-btn>

          <v-btn @click="showDialogDeleteConfirmation" color="error" rounded variant="flat" block>
            <v-icon start>mdi-delete</v-icon>
            {{ t('migration.remove_old_data_close') }}
          </v-btn>
        </div>

        <div v-if="step == 2 || step == 3">
          <v-alert type="warning" density="compact" variant="text" class="body-2">
            {{ t('migration.may_take_minutes') }}
            <br>
            {{ t('migration.do_not_close') }}
          </v-alert>
          <div>{{ t('migration.transferring_files') }}</div>
        </div>

        <div v-if="step == 4">
          <v-alert type="success" density="compact" variant="text" class="body-2">
            {{ t('migration.completed') }}
          </v-alert>
        </div>

        <div v-if="importStatus">{{ importStatus }}</div>

        <v-progress-linear
          v-if="step == 2 || step == 3"
          color="deep-purple accent-4"
          class="mt-2"
          indeterminate
          rounded
          height="6"
        ></v-progress-linear>
      </v-card-text>

      <v-card-actions v-if="step != 1" class="py-6">
        <v-spacer></v-spacer>
        <v-btn @click="finish" :disabled="step != 4" rounded class="pr-4">
          <v-icon start>mdi-close</v-icon>
          {{ t('common.close') }}
        </v-btn>
        <v-spacer></v-spacer>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {typedApi} from "@/services/typedApi"
import {reloadApplicationAfterDatabaseChange} from '@/services/configService'
import {useDialogsStore} from '@/stores/dialogs'
import {useOperationsStore} from '@/stores/operations'

const {t} = useI18n()
const dialogsStore = useDialogsStore()
const operationsStore = useOperationsStore()

const dialog = ref(true)
const step = ref(1)
const is_copy_backups = ref(false)
const importStatus = ref('')


async function showDialogDeleteConfirmation() {
  dialogsStore.confirm.text = t('migration.data_lost_confirm')
  dialogsStore.confirm.action = async () => {
    await cleanLowDb()
  }
  dialogsStore.confirm.show = true
}

async function cleanLowDb() {
  operationsStore.migrationLowDb.dialog = false
  await typedApi.cleanLowDb()
}

async function createBackupLowDb() {
  step.value = 2
  try {
    const res = await typedApi.createBackupLowDb({
      is_copy_backups: is_copy_backups.value,
    })
    const backupName = typeof res.data === 'string' ? res.data : res.data?.data
    if (backupName) {
      await restoreBackup(backupName)
    }
  } catch (e) {
    importStatus.value = String(e)
  }
}

async function restoreBackup(backupName: string) {
  step.value = 3

  await typedApi.restoreBackup({
    name: backupName,
  })

  step.value = 4
}

async function finish() {
  operationsStore.migrationLowDb.dialog = false
  await reloadApplicationAfterDatabaseChange()
}
</script>
