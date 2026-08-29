<template>
  <div class="databases mx-4">
    <settings-category-divider
      :title="t('settings.groups.storage')"
      icon="database-outline"
    />

    <p class="databases__hint text-caption text-medium-emphasis mb-4">
      {{ t('settings_labels.database.databases_hint') }}
    </p>

    <div class="databases__toolbar mb-4">
      <v-btn
        id="database_add"
        color="success"
        rounded="pill"
        variant="flat"
        class="pr-4"
        @click="openAdd"
      >
        <v-icon icon="mdi-plus" start/>
        {{ t('settings_labels.database.add_new_database') }}
      </v-btn>

      <div
        v-if="databases.length"
        class="databases__summary text-caption text-medium-emphasis"
      >
        <span class="databases__summary-count">{{ databases.length }}</span>
        <span>{{ formatTotalSize }}</span>
      </div>

      <div class="databases__toolbar-actions">
        <SettingsBackups/>
      </div>
    </div>

    <div class="databases__list">
      <div
        v-for="item in databases"
        :key="item.id"
        class="databases-card"
        :class="{
          'databases-card--active': item.active,
          'databases-card--clickable': !item.active,
        }"
        role="button"
        :tabindex="item.active ? -1 : 0"
        @click="openActivate(item)"
        @keydown.enter.prevent="openActivate(item)"
        @keydown.space.prevent="openActivate(item)"
      >
        <div class="databases-card__icon" aria-hidden="true">
          <v-icon size="20" :icon="`mdi-${item.icon || DEFAULT_DB_ICON}`"/>
        </div>

        <div class="databases-card__meta">
          <div class="databases-card__title-row">
            <span class="databases-card__title">{{ item.name }}</span>
            <v-chip
              v-if="item.active"
              color="success"
              size="x-small"
              variant="tonal"
              class="databases-card__badge"
            >
              {{ t('common.active') }}
            </v-chip>
          </div>

          <div class="databases-card__stats">
            <span class="databases-card__stat">
              <v-icon icon="mdi-calendar-outline" size="14" class="mr-1"/>
              {{ t('settings_labels.database.created') }}
              {{ getDateFromMs(item.createdAt) }}
            </span>
            <span class="databases-card__stat databases-card__stat--mono">
              ID {{ item.id }}
            </span>
            <span class="databases-card__stat databases-card__stat--strong">
              <v-icon icon="mdi-harddisk" size="14" class="mr-1"/>
              {{ formatDbSize(item.id) }}
            </span>
            <span
              class="databases-card__stat"
              :class="{
                'databases-card__stat--warn': backupCountOf(item.id) === 0,
                'databases-card__stat--ok': (backupCountOf(item.id) ?? 0) > 0,
              }"
            >
              <v-icon icon="mdi-backup-restore" size="14" class="mr-1"/>
              <template v-if="backupCountOf(item.id) == null">…</template>
              <template v-else>
                {{ t('settings_labels.database.database_backups_count', {
                  count: backupCountOf(item.id),
                }) }}
              </template>
            </span>
          </div>

          <div
            v-if="shareOf(item.id) != null"
            class="databases-card__bar"
            aria-hidden="true"
          >
            <div
              class="databases-card__bar-fill"
              :style="{ width: `${shareOf(item.id)}%` }"
            />
          </div>
        </div>

        <div class="databases-card__actions" @click.stop>
          <v-btn
            icon
            variant="text"
            size="small"
            rounded="pill"
            :aria-label="t('settings_labels.database.duplicate_database')"
            @click="openDuplicate(item)"
          >
            <v-icon icon="mdi-content-copy" size="18"/>
          </v-btn>
          <v-btn
            icon
            variant="text"
            size="small"
            rounded="pill"
            :aria-label="t('common.edit')"
            @click="openEdit(item)"
          >
            <v-icon icon="mdi-pencil" size="18"/>
          </v-btn>
          <v-btn
            v-if="!item.active"
            icon
            variant="text"
            size="small"
            rounded="pill"
            color="error"
            :aria-label="t('common.remove')"
            @click="confirmRemoving(item)"
          >
            <v-icon icon="mdi-delete-outline" size="18"/>
          </v-btn>
        </div>
      </div>
    </div>

    <!-- Add / Edit dialog -->
    <v-dialog v-model="dialogDb" max-width="600">
      <v-card rounded="xl">
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
const dbBackupCounts = ref<Record<string, number>>({})

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

const totalSize = computed(() => {
  const values = databases.value
    .map((item) => dbSizes.value[item.id])
    .filter((value): value is number => typeof value === 'number')
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0)
})

const formatTotalSize = computed(() => {
  if (totalSize.value == null) return '…'
  return getReadableFileSize(totalSize.value)
})

async function loadDatabaseSizes() {
  const ids = databases.value.map(item => item.id)
  if (!ids.length) {
    dbSizes.value = {}
    dbBackupCounts.value = {}
    return
  }

  // Drop sizes for removed DBs; keep cached values for the rest so the UI
  // does not flash "…" while a huge library is still measuring.
  const idSet = new Set(ids)
  dbSizes.value = Object.fromEntries(
    Object.entries(dbSizes.value).filter(([id]) => idSet.has(id)),
  )
  dbBackupCounts.value = Object.fromEntries(
    Object.entries(dbBackupCounts.value).filter(([id]) => idSet.has(id)),
  )

  // Measure each DB independently so small ones paint before the largest finishes.
  await Promise.all(ids.map(async (id) => {
    try {
      const {data} = await typedApi.getDatabaseSizes({ids: [id]})
      const size = data.sizes?.[id]
      if (typeof size === 'number') {
        dbSizes.value = {...dbSizes.value, [id]: size}
      }
      // Older servers may omit backupCounts — fall back to 0 once sizes are known.
      dbBackupCounts.value = {
        ...dbBackupCounts.value,
        [id]: data.backupCounts?.[id] ?? 0,
      }
    } catch (error) {
      console.error('Error loading database size:', id, error)
    }
  }))
}

function formatDbSize(id: string) {
  const size = dbSizes.value[id]
  if (size == null) return '…'
  return getReadableFileSize(size)
}

function backupCountOf(id: string): number | null {
  if (!(id in dbBackupCounts.value)) return null
  return dbBackupCounts.value[id] ?? 0
}

function shareOf(id: string): number | null {
  const total = totalSize.value
  const size = dbSizes.value[id]
  if (total == null || total <= 0 || size == null) return null
  return Math.max(0, Math.min(100, (size / total) * 100))
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
.databases__hint {
  line-height: 1.45;
  max-width: 42rem;
}

.databases__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 12px;
}

.databases__summary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-right: auto;
  font-variant-numeric: tabular-nums;
}

.databases__summary-count {
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

.databases__toolbar-actions {
  margin-left: auto;
}

.databases__list {
  display: grid;
  gap: 10px;
}

.databases-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
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

.databases-card--clickable {
  cursor: pointer;
}

.databases-card--clickable:hover {
  border-color: rgba(var(--v-theme-primary), 0.22);
  background: rgba(var(--v-theme-primary), 0.04);
  box-shadow: 0 8px 24px rgba(var(--v-theme-on-surface), 0.06);
  transform: translateY(-1px);
}

.databases-card--active {
  border-color: rgba(var(--v-theme-success), 0.28);
  background:
    linear-gradient(135deg, rgba(var(--v-theme-success), 0.1), rgba(var(--v-theme-success), 0.03));
  box-shadow: 0 0 0 1px rgba(var(--v-theme-success), 0.12);
}

.databases-card__icon {
  flex: 0 0 42px;
  width: 42px;
  height: 42px;
  border-radius: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.1);
}

.databases-card--active .databases-card__icon {
  color: rgb(var(--v-theme-success));
  background: rgba(var(--v-theme-success), 0.14);
}

.databases-card__meta {
  flex: 1 1 auto;
  min-width: 0;
}

.databases-card__title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.databases-card__title {
  font-size: 0.975rem;
  font-weight: 650;
  line-height: 1.3;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.databases-card__badge {
  flex: 0 0 auto;
}

.databases-card__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-top: 4px;
}

.databases-card__stat {
  display: inline-flex;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 0.75rem;
  line-height: 1.35;
  font-variant-numeric: tabular-nums;
}

.databases-card__stat--mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.7rem;
  opacity: 0.9;
}

.databases-card__stat--strong {
  color: rgba(var(--v-theme-on-surface), 0.78);
  font-weight: 600;
}

.databases-card__stat--ok {
  color: rgb(var(--v-theme-success));
  font-weight: 600;
}

.databases-card__stat--warn {
  color: rgb(var(--v-theme-warning));
  font-weight: 600;
}

.databases-card__bar {
  margin-top: 8px;
  height: 5px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(var(--v-theme-on-surface), 0.08);
  max-width: 420px;
}

.databases-card__bar-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(
    90deg,
    rgba(var(--v-theme-primary), 0.55),
    rgba(var(--v-theme-primary), 0.9)
  );
  transition: width 0.35s ease;
}

.databases-card--active .databases-card__bar-fill {
  background: linear-gradient(
    90deg,
    rgba(var(--v-theme-success), 0.55),
    rgba(var(--v-theme-success), 0.9)
  );
}

.databases-card__actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 2px;
  padding: 4px;
  border-radius: 999px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background: rgba(var(--v-theme-surface), 0.85);
}

@media (max-width: 700px) {
  .databases-card {
    flex-wrap: wrap;
  }

  .databases-card__actions {
    margin-left: auto;
  }

  .databases__toolbar-actions {
    margin-left: 0;
  }
}
</style>
