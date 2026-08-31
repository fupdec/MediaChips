<template>
  <v-dialog
    v-model="dialog"
    persistent
    width="520"
  >
    <v-card
      class="migration-dialog"
      rounded="xl"
    >
      <DialogHeader
        :header="t('migration.title')"
        icon="database-arrow-right"
      />

      <v-card-text class="pa-4 pa-sm-6">
        <div
          v-if="step == 1"
          class="mb-2"
        >
          <v-alert
            type="info"
            class="text-body-2 mb-4"
            variant="tonal"
            density="compact"
            rounded="xl"
          >
            {{ t('migration.old_data_found') }}
            <br>
            {{ t('migration.data_destroyed_warning') }}
          </v-alert>

          <v-checkbox
            v-model="is_copy_backups"
            :label="t('migration.copy_backups')"
            density="comfortable"
            hide-details
            class="mb-4"
          />

          <v-btn
            color="success"
            class="mb-3"
            rounded="pill"
            variant="flat"
            block
            @click="createBackupLowDb"
          >
            <v-icon start>mdi-transfer</v-icon>
            {{ t('migration.start') }}
          </v-btn>

          <v-btn
            color="error"
            rounded="pill"
            variant="tonal"
            block
            @click="showDialogDeleteConfirmation"
          >
            <v-icon start>mdi-delete</v-icon>
            {{ t('migration.remove_old_data_close') }}
          </v-btn>
        </div>

        <div v-if="step == 2 || step == 3">
          <v-alert
            type="warning"
            density="compact"
            variant="tonal"
            rounded="xl"
            class="text-body-2 mb-3"
          >
            {{ t('migration.may_take_minutes') }}
            <br>
            {{ t('migration.do_not_close') }}
          </v-alert>
          <div class="text-body-2 text-medium-emphasis">
            {{ t('migration.transferring_files') }}
          </div>
        </div>

        <div v-if="step == 4">
          <v-alert
            type="success"
            density="compact"
            variant="tonal"
            rounded="xl"
            class="text-body-2"
          >
            {{ t('migration.completed') }}
          </v-alert>
        </div>

        <v-alert
          v-if="importStatus"
          type="error"
          density="compact"
          variant="tonal"
          rounded="xl"
          class="text-body-2 mt-4"
        >
          {{ importStatus }}
        </v-alert>

        <v-progress-linear
          v-if="step == 2 || step == 3"
          color="primary"
          class="mt-4"
          indeterminate
          rounded
          height="6"
        />
      </v-card-text>

      <v-card-actions
        v-if="step != 1"
        class="px-5 pb-5 pt-1 justify-center"
      >
        <v-btn
          :disabled="step != 4"
          rounded="pill"
          variant="flat"
          color="primary"
          class="px-5"
          @click="finish"
        >
          <v-icon start>mdi-close</v-icon>
          {{ t('common.close') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {typedApi} from '@/services/typedApi'
import {reloadApplicationAfterDatabaseChange} from '@/services/configService'
import {useDialogsStore} from '@/stores/dialogs'
import {useOperationsStore} from '@/stores/operations'
import {getApiErrorMessage} from '@/types/vue'
import DialogHeader from '@/components/elements/DialogHeader.vue'

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
    step.value = 1
    importStatus.value = getApiErrorMessage(e, t('migration.error_unknown'))
  }
}

async function restoreBackup(backupName: string) {
  step.value = 3

  try {
    await typedApi.restoreBackup({
      name: backupName,
    })
    step.value = 4
    importStatus.value = ''
  } catch (e) {
    step.value = 1
    importStatus.value = getApiErrorMessage(e, t('migration.error_unknown'))
  }
}

async function finish() {
  operationsStore.migrationLowDb.dialog = false
  await reloadApplicationAfterDatabaseChange()
}
</script>
