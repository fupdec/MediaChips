<template>
  <div class="mx-4">
    <settings-category-divider
      :title="t('settings.groups.storage')"
      icon="database-outline"
    />

    <!-- Actions -->
    <div class="d-flex flex-wrap ga-2 mb-2">
      <v-btn
        id="database_add"
        color="success"
        rounded
        variant="flat"
        class="pr-4"
        @click="openAdd"
      >
        <v-icon icon="mdi-plus" class="mr-2"/>
        {{ t('settings_labels.database.add_new_database') }}
      </v-btn>

      <SettingsBackups/>
    </div>

    <!-- List -->
    <v-list
      density="compact"
      rounded="xl"
      class="px-0 settings-outlined-list databases__list"
      bg-color="transparent"
    >
      <v-list-item
        v-for="(db, index) in databases"
        :key="db.id"
        :class="{
          active: db.active,
          'databases__row--zebra': index % 2 === 1,
        }"
        :color="db.active ? 'success' : undefined"
        rounded="pill"
        variant="outlined"
        class="databases__row py-2"
        @click="openActivate(db)"
      >
        <template #prepend>
          <v-avatar
            variant="tonal"
            :color="db.active ? 'success' : 'primary'"
            size="32"
            class="mr-1"
          >
            <v-icon
              size="18"
              :icon="`mdi-${db.icon || DEFAULT_DB_ICON}`"
            />
          </v-avatar>
        </template>

        <v-list-item-title class="databases__title d-flex align-center text-body-2">
          <span class="text-truncate">{{ db.name }}</span>
          <v-chip
            v-if="db.active"
            color="success"
            size="x-small"
            label
            rounded="pill"
            class="ml-2"
          >
            {{ t('common.active') }}
          </v-chip>
        </v-list-item-title>
        <v-list-item-subtitle class="databases__subtitle text-caption">
          {{ t('settings_labels.database.created') }} {{ getDateFromMs(db.createdAt) }}
          <span class="ml-3">ID: {{ db.id }}</span>
          <span class="ml-3 text-medium-emphasis">{{ formatDbSize(db.id) }}</span>
        </v-list-item-subtitle>

        <template #append>
          <div class="databases__actions d-flex">
            <v-btn
              icon
              variant="text"
              size="small"
              rounded="pill"
              :aria-label="t('settings_labels.database.duplicate_database')"
              @click.stop="openDuplicate(db)"
            >
              <v-icon icon="mdi-content-copy" />
            </v-btn>
            <v-btn
              icon
              variant="text"
              size="small"
              rounded="pill"
              :aria-label="t('common.edit')"
              @click.stop="openEdit(db)"
            >
              <v-icon icon="mdi-pencil" />
            </v-btn>
            <v-btn
              v-if="!db.active"
              icon
              variant="text"
              size="small"
              rounded="pill"
              color="error"
              :aria-label="t('common.remove')"
              @click.stop="confirmRemoving(db)"
            >
              <v-icon icon="mdi-delete-outline" />
            </v-btn>
          </div>
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
              :rules="[v => { const r = validateName(v); return r === true || t(r) }]"
            />

            <v-switch
              v-if="dialogMode === 'add'"
              v-model="createStarterMeta"
              color="primary"
              hide-details
              class="mb-2"
              :label="t('settings_labels.database.create_starter_meta')"
            />
            <p
              v-if="dialogMode === 'add'"
              class="text-caption text-medium-emphasis mb-4"
            >
              {{ t('settings_labels.database.create_starter_meta_hint') }}
            </p>

            <v-switch
              v-if="dialogMode === 'duplicate'"
              v-model="includeGeneratedCache"
              color="primary"
              hide-details
              class="mb-4"
              :label="t('settings_labels.database.copy_generated_cache')"
            />
            <p
              v-if="dialogMode === 'duplicate'"
              class="text-caption text-medium-emphasis mb-4"
            >
              {{ t('settings_labels.database.copy_generated_cache_hint') }}
            </p>

            <DialogIcons
              :icon="dbIcon"
              @apply="changeIcon"
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
import {ref, computed, watch, onMounted, defineAsyncComponent} from 'vue'
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
const DialogIcons = defineAsyncComponent(() => import('@/components/dialogs/DialogIcons.vue'))
import {updateConfig, reloadApplicationAfterDatabaseChange} from '@/services/configService'
import {ensureStarterMeta} from '@/services/ensureStarterMeta'
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

const DEFAULT_DB_ICON = 'database-outline'

/* stores */
const store = useAppStore()
const dialogsStore = useDialogsStore()
const {t} = useI18n()

/* state */
const dbName = ref('')
const dbIcon = ref(DEFAULT_DB_ICON)
const db = ref<DatabaseEntry | null>(null)
const valid = ref(false)
const dialogMode = ref<'add' | 'edit' | 'duplicate'>('add')
const includeGeneratedCache = ref(true)
const createStarterMeta = ref(true)
/** Set when a newly added DB opted into starter meta; applied on first activate. */
const pendingStarterMetaDbId = ref<string | null>(null)

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
  db.value = null
  dialogMode.value = 'add'
  dbName.value = ''
  dbIcon.value = DEFAULT_DB_ICON
  includeGeneratedCache.value = true
  createStarterMeta.value = true
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
  dialogMode.value = 'edit'
  db.value = item
  dbName.value = item.name
  dbIcon.value = item.icon || DEFAULT_DB_ICON
  includeGeneratedCache.value = true
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

function openDuplicate(item: DatabaseEntry) {
  dialogMode.value = 'duplicate'
  db.value = item
  dbName.value = `${item.name} (copy)`
  dbIcon.value = item.icon || DEFAULT_DB_ICON
  includeGeneratedCache.value = true
  headerText.value = t('settings_labels.database.duplicating_database')
  buttons.value = [
    {
      icon: 'content-copy',
      text: t('settings_labels.database.duplicate_database'),
      color: 'success',
      action: duplicateDb,
    },
  ]
  dialogDb.value = true
}

function openActivate(item: DatabaseEntry) {
  if (item.active) return
  db.value = item
  dialogActivateConfirm.value = true
}

function changeIcon(selectedIcon: string) {
  dbIcon.value = selectedIcon
}

async function addDb() {
  await formRef.value?.validate()
  if (!valid.value) return

  const databasesList = getConfigDatabases()

  const icon = dbIcon.value === DEFAULT_DB_ICON ? undefined : dbIcon.value

  databasesList.push({
    id: Date.now().toString(16),
    name: dbName.value,
    active: false,
    createdAt: Date.now(),
    ...(icon ? {icon} : {}),
  })

  setConfigDatabases(databasesList)
  await updateConfig({databases: databasesList})
  databases.value = databasesList

  db.value = [...databases.value].sort(
    (a, b) => b.createdAt - a.createdAt,
  )[0] ?? null

  pendingStarterMetaDbId.value = createStarterMeta.value && db.value
    ? db.value.id
    : null

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
  const icon = dbIcon.value === DEFAULT_DB_ICON ? undefined : dbIcon.value
  if (icon) {
    target.icon = icon
  } else {
    delete target.icon
  }

  setConfigDatabases(databasesList)
  await updateConfig({databases: databasesList})
  databases.value = databasesList

  dialogDb.value = false
}

async function duplicateDb() {
  await formRef.value?.validate()
  if (!valid.value || !db.value) return

  const source = db.value
  dialogDb.value = false
  dialogsStore.process.show = true
  dialogsStore.process.text = t('settings_labels.database.duplicating_database_progress')

  try {
    const icon = dbIcon.value === DEFAULT_DB_ICON ? undefined : dbIcon.value
    const {data} = await typedApi.duplicateDb({
      id: source.id,
      name: dbName.value,
      ...(icon ? {icon} : {}),
      includeGeneratedCache: includeGeneratedCache.value,
    })

    const databasesList = [
      ...getConfigDatabases(),
      data.database,
    ]
    setConfigDatabases(databasesList)
    await updateConfig({databases: databasesList})
    databases.value = databasesList
    await loadDatabaseSizes()

    db.value = data.database
    dialogActivateConfirm.value = true
    setNotification({
      type: 'success',
      text: t('settings_labels.database.database_duplicated'),
    })
  } catch (error) {
    console.error('Failed to duplicate database:', error)
    setNotification({
      type: 'error',
      text: error instanceof Error ? error.message : t('common.error'),
    })
  } finally {
    dialogsStore.process.show = false
    dialogsStore.process.text = null
  }
}

function syncActiveDatabase(databaseId: string) {
  const databasesList = getConfigDatabases().map((entry) => ({
    ...entry,
    active: entry.id === databaseId,
  }))

  setConfigDatabases(databasesList)
  databases.value = databasesList
}

async function applyPendingStarterMeta(databaseId: string) {
  if (pendingStarterMetaDbId.value !== databaseId) return
  pendingStarterMetaDbId.value = null

  try {
    const {data: mediaTypes} = await typedApi.getMediaTypes()
    const mediaTypeIds = (mediaTypes || [])
      .filter((mediaType) => mediaType.type === 'video' || mediaType.type === 'image')
      .map((mediaType) => Number(mediaType.id))
      .filter((id) => id > 0)

    if (!mediaTypeIds.length) return

    await ensureStarterMeta({mediaTypeIds})
  } catch (error) {
    console.error('Failed to create starter meta for new database:', error)
    setNotification({
      type: 'error',
      text: error instanceof Error ? error.message : t('common.error'),
    })
  }
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
    await applyPendingStarterMeta(targetId)
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
.databases__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.databases__row {
  align-items: center;
  min-height: 52px;
  border-color: rgba(var(--v-border-color), 0.14) !important;
  background: rgba(var(--v-theme-on-surface), 0.02);
}

.databases__row--zebra {
  background: rgba(var(--v-theme-on-surface), 0.035);
}

.databases__row:hover {
  background: rgba(var(--v-theme-primary), 0.04);
  border-color: rgba(var(--v-theme-primary), 0.22) !important;
}

.databases__row.active {
  pointer-events: none;
  background: rgba(var(--v-theme-success), 0.06);
  border-color: rgba(var(--v-theme-success), 0.28) !important;
}

.databases__row.active .v-btn {
  pointer-events: all;
}

.databases__title {
  font-weight: 500;
  min-width: 0;
}

.databases__subtitle {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.databases__actions {
  border: 1px solid rgba(var(--v-border-color), 0.2);
  border-radius: 999px;
  overflow: hidden;
  background: rgba(var(--v-theme-surface), 0.7);
}
</style>
