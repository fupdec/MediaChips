<template>
  <div class="mx-4">
    <settings-category-divider
      :title="t('settings.tabs.database')"
      icon="database-outline"
    />

    <!-- Actions -->
    <v-card-actions>
      <v-btn
        id="database_add"
        color="success"
        rounded
        variant="flat"
        class="pr-4 mb-2"
        @click="openAdd"
      >
        <v-icon icon="mdi-plus" class="mr-2"/>
        {{ t('settings_labels.database.add_new_database') }}
      </v-btn>

      <v-spacer/>

      <SettingsBackups/>
    </v-card-actions>

    <!-- List -->
    <v-list density="compact" rounded class="px-0 settings-outlined-list" bg-color="transparent">
      <v-list-item
        v-for="db in databases"
        :key="db.id"
        :class="{ active: db.active }"
        :color="db.active ? 'success' : undefined"
        @click="openActivate(db)"
        rounded="pill"
        variant="outlined"
        class="py-4"
      >
        <template v-if="db.active" #prepend>
          <v-avatar color="success">
            <v-icon icon="mdi-check"/>
          </v-avatar>
        </template>

        <v-list-item-title class="d-flex align-center">
          <span>{{ db.name }}</span>
          <v-chip v-if="db.active" color="success" size="x-small" label class="ml-2">
            {{ t('common.active') }}
          </v-chip>
        </v-list-item-title>
        <v-list-item-subtitle>
          {{ t('settings_labels.database.created') }} {{ getDateFromMs(db.createdAt) }}
          <span class="ml-4">ID: {{ db.id }}</span>
          <span class="ml-4 text-medium-emphasis">{{ formatDbSize(db.id) }}</span>
        </v-list-item-subtitle>

        <template #append>
          <v-btn-group rounded="xl">
            <v-btn @click.stop="openEdit(db)" icon>
              <v-icon icon="mdi-pencil"/>
            </v-btn>

            <v-btn
              v-if="!db.active"
              icon
              @click.stop="confirmRemoving(db)"
            >
              <v-icon icon="mdi-close" color="error"/>
            </v-btn>
          </v-btn-group>
        </template>
      </v-list-item>
    </v-list>

    <!-- Add / Edit dialog -->
    <v-dialog v-model="dialogDb" max-width="600">
      <v-card>
        <DialogHeader
          :header="headerText"
          :buttons="buttons"
          closable
          @close="dialogDb = false"
        />

        <v-card-text>
          <v-form ref="formRef" v-model="valid">
            <v-text-field
              v-model="dbName"
              :label="t('common.name')"
              autofocus
              :rules="[v => validateName(v)]"
            />
          </v-form>
        </v-card-text>
      </v-card>
    </v-dialog>

    <!-- Activate confirm -->
    <DialogConfirm
      v-if="dialogActivateConfirm"
      :dialog="dialogActivateConfirm"
      :text="t('actions.activate_database')"
      @close="dialogActivateConfirm = false"
      @confirm="activateDb"
    />
  </div>
</template>

<script setup lang="ts">
import {ref, computed, onMounted, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {typedApi} from '@/services/typedApi'
import {useAppStore} from '@/stores/app'
import {useDialogsStore} from '@/stores/dialogs'
import type { DatabaseEntry } from '@/types/settings'
import type {VFormInstance} from '@/types/vue'

import SettingsBackups from '@/components/settings/database/SettingsBackups.vue'
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import DialogConfirm from '@/components/dialogs/DialogConfirm.vue'
import {updateConfig, reloadApplicationAfterDatabaseChange} from '@/services/configService'
import {setNotification} from '@/services/notificationService'
import {
  getDateFromMs,
  getReadableFileSize,
  validateName,
} from '@/services/formatUtils'

interface DialogHeaderButton {
  icon?: string
  text?: string
  color?: string
  action?: () => void | Promise<void>
}

/* stores */
const store = useAppStore()
const dialogsStore = useDialogsStore()
const {t} = useI18n()

/* state */
const dbName = ref('')
const db = ref<DatabaseEntry | null>(null)
const valid = ref(false)

const dialogDb = ref(false)
const dialogActivateConfirm = ref(false)

const headerText = ref('')
const buttons = ref<DialogHeaderButton[]>([])

const formRef = ref<VFormInstance>(null)
const dbSizes = ref<Record<string, number>>({})

function getConfigDatabases(): DatabaseEntry[] {
  return (store.config.databases as DatabaseEntry[] | undefined) ?? []
}

function setConfigDatabases(databases: DatabaseEntry[]) {
  store.config.databases = databases
}

/* computed */
const databases = computed({
  get: () => [...(store.databases as DatabaseEntry[])].sort((a, b) => {
    return Number(b.active) - Number(a.active)
  }),
  set: v => (store.databases = v),
})

async function loadDatabaseSizes() {
  const ids = databases.value.map(item => item.id)
  if (!ids.length) {
    dbSizes.value = {}
    return
  }

  try {
    const {data} = await typedApi.getDatabaseSizes({ids})
    dbSizes.value = data.sizes || {}
  } catch (error) {
    console.error('Error loading database sizes:', error)
  }
}

function formatDbSize(id: string) {
  const size = dbSizes.value[id]
  if (size == null) return '…'
  return getReadableFileSize(size)
}

/* actions */
function openAdd() {
  dbName.value = ''
  headerText.value = t('settings_labels.database.adding_database')
  buttons.value = [
    {
      icon: 'plus',
      text: t('common.add'),
      color: 'success',
      action: addDb,
    },
  ]
  dialogDb.value = true
}

function openEdit(item: DatabaseEntry) {
  db.value = item
  dbName.value = item.name
  headerText.value = t('settings_labels.database.editing_database')
  buttons.value = [
    {
      icon: 'content-save',
      text: t('common.save'),
      color: 'success',
      action: updateDb,
    },
  ]
  dialogDb.value = true
}

function openActivate(item: DatabaseEntry) {
  if (item.active) return
  db.value = item
  dialogActivateConfirm.value = true
}

async function addDb() {
  await formRef.value?.validate()
  if (!valid.value) return

  const databasesList = getConfigDatabases()

  databasesList.push({
    id: Date.now().toString(16),
    name: dbName.value,
    active: false,
    createdAt: Date.now(),
  })

  setConfigDatabases(databasesList)
  await updateConfig({databases: databasesList})
  databases.value = databasesList

  db.value = [...databases.value].sort(
    (a, b) => b.createdAt - a.createdAt,
  )[0] ?? null

  dialogDb.value = false
  dialogActivateConfirm.value = true
}

async function updateDb() {
  await formRef.value?.validate()
  if (!valid.value || !db.value) return

  const databasesList = getConfigDatabases()
  const target = databasesList.find(i => i.id === db.value?.id)
  if (!target) return

  target.name = dbName.value

  setConfigDatabases(databasesList)
  await updateConfig({databases: databasesList})
  databases.value = databasesList

  dialogDb.value = false
}

function syncActiveDatabase(databaseId: string) {
  const databasesList = getConfigDatabases().map((entry) => ({
    ...entry,
    active: entry.id === databaseId,
  }))

  setConfigDatabases(databasesList)
  databases.value = databasesList
}

async function activateDb() {
  if (!db.value) return

  const targetId = db.value.id
  dialogActivateConfirm.value = false
  dialogsStore.process.show = true

  try {
    await typedApi.switchDatabase({databaseId: targetId})
    syncActiveDatabase(targetId)
    await reloadApplicationAfterDatabaseChange()
    await loadDatabaseSizes()
    setNotification({
      type: 'success',
      text: t('settings_labels.database.database_activated'),
    })
  } catch (error) {
    console.error('Failed to activate database:', error)
    setNotification({
      type: 'error',
      text: error instanceof Error ? error.message : t('common.error'),
    })
  } finally {
    dialogsStore.process.show = false
  }
}

async function confirmRemoving(item: DatabaseEntry) {
  db.value = item

  dialogsStore.confirm.text = 'The database will be permanently deleted. \n Are you sure?'
  dialogsStore.confirm.show = true
  dialogsStore.confirm.action = async () => {
    await typedApi.deleteDb({
      id: item.id,
    })

    const databasesList = getConfigDatabases().filter(i => i.id !== item.id)

    setConfigDatabases(databasesList)
    await updateConfig({databases: databasesList})
    databases.value = databasesList
  }
}

onMounted(loadDatabaseSizes)
watch(databases, loadDatabaseSizes)
</script>

<style scoped>
.v-list-item.active {
  pointer-events: none;
}

.v-list-item.active .v-btn {
  pointer-events: all;
}
</style>
