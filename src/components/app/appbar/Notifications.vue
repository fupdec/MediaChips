<template>
  <div class="notifications-menu">
    <div class="notifications-bell" :class="{'notifications-bell--busy': !!taskSummary}">
      <v-progress-circular
        v-if="taskSummary"
        class="notifications-bell__ring"
        :model-value="taskSummary.progress ?? undefined"
        :indeterminate="!taskSummary.paused && taskSummary.progress == null"
        :color="taskSummary.paused ? undefined : 'primary'"
        :size="36"
        :width="2"
        data-testid="notifications-task-ring"
      />
      <v-badge
        :model-value="!!badge && !taskSummary"
        dot
        location="top start"
        color="secondary"
        offset-x="10"
        offset-y="10"
      >
        <v-btn
          ref="activatorRef"
          icon
        >
          <v-icon>mdi-bell-outline</v-icon>
          <v-tooltip activator="parent" location="bottom">
            <div>{{ t("appbar.notifications") }}</div>
            <div v-if="taskSummary" class="notifications-bell__tasks">{{ taskSummary.tooltip }}</div>
          </v-tooltip>
        </v-btn>
      </v-badge>
    </div>

    <v-menu
      ref="menuRef"
      v-model="showMenu"
      :activator="activatorRef as never"
      location="bottom end"
      origin="top end"
      offset="8"
      :close-on-content-click="false"
      scroll-strategy="reposition"
      @update:model-value="hideAll"
    >
      <v-card width="420" max-width="calc(100vw - 24px)" class="notifications-wrap" rounded="xl">
        <v-card-actions class="notifications-header px-4">
          <div class="d-flex align-center font-weight-medium">
            <v-icon size="20" icon="mdi-bell" class="me-2" />
            {{ t("appbar.notifications") }}
          </div>
          <v-spacer></v-spacer>
          <v-btn
            v-if="notifications.length > 0"
            @click="closeAll"
            variant="text"
            size="small"
          >
            <v-icon start>mdi-notification-clear-all</v-icon>
            {{ t('appbar.closeAll') }}
          </v-btn>
        </v-card-actions>

        <v-divider></v-divider>

        <div class="notifications-list">
          <v-card-text class="notifications-stack">
            <div v-if="hasPinnedTasks" class="notifications-pinned" data-testid="notifications-pinned">
              <div class="notifications-pinned__head">
                <v-icon size="14" icon="mdi-progress-clock" />
                <span>{{ t('appbar.activeProcessesTitle', {count: pinnedTaskCount}) }}</span>
              </div>
              <v-card v-if="copyJobs.length" class="task-notification task-card" :style="accent('primary')" data-testid="copy-discovery-task">
                <div class="task-notification__header">
                  <v-avatar size="32" color="primary" variant="tonal" icon="mdi-file-find-outline" />
                  <div class="task-notification__body">
                    <div class="task-notification__title">{{ t('copyDiscovery.title') }}</div>
                    <div class="task-card__chips">
                      <v-chip
                        size="x-small"
                        variant="tonal"
                        :color="copySummaryState === 'paused' ? undefined : 'primary'"
                        :prepend-icon="copySummaryState === 'paused' ? 'mdi-pause' : 'mdi-magnify-scan'"
                      >{{ t(`copyDiscovery.states.${copySummaryState}`) }}</v-chip>
                      <v-chip v-if="copyJobs.length > 1" size="x-small" variant="outlined" prepend-icon="mdi-layers-outline">
                        {{ t('copyDiscovery.jobs_count', {count: copyJobs.length}) }}
                      </v-chip>
                    </div>
                    <div class="task-notification__progress">
                      <v-progress-linear
                        color="primary"
                        height="5"
                        rounded
                        :model-value="0"
                        :indeterminate="copySummaryState !== 'paused'"
                      />
                    </div>
                  </div>
                </div>
                <div class="task-notification__actions">
                  <v-btn size="small" variant="tonal" color="primary" :disabled="copyAction" @click="controlCopyJobs(copySummaryState === 'paused' ? 'resume' : 'pause')">
                    {{ t(copySummaryState === 'paused' ? 'copyDiscovery.resume' : 'copyDiscovery.pause') }}
                  </v-btn>
                  <v-btn size="small" variant="text" color="error" :disabled="copyAction" @click="controlCopyJobs('cancel')">
                    {{ t('copyDiscovery.cancel') }}
                  </v-btn>
                  <v-btn size="small" variant="text" :to="copySettings" @click="showMenu = false">{{ t('copyDiscovery.configure') }}</v-btn>
                </div>
              </v-card>
              <v-alert v-if="copyError" type="error" density="compact">{{ t('copyDiscovery.states.failed') }}</v-alert>
              <v-card v-if="duplicateCheck.visible.value && duplicateCheck.status.value" class="task-notification task-card task-card--duplicates" :style="accent('warning')" data-testid="duplicates-on-add-task">
                <div class="task-notification__header">
                  <v-avatar size="32" color="warning" variant="tonal" icon="mdi-content-duplicate" />
                  <div class="task-notification__body">
                    <div class="task-notification__title">{{ t('duplicatesOnAdd.task_title') }}</div>
                    <div class="task-card__chips">
                      <v-chip
                        v-if="duplicateCheck.status.value.state !== 'running'"
                        size="x-small"
                        variant="tonal"
                        :prepend-icon="dupStateIcon(duplicateCheck.status.value.state)"
                      >{{ t(`duplicatesOnAdd.state_${duplicateCheck.status.value.state}`) }}</v-chip>
                      <v-chip size="x-small" variant="tonal" prepend-icon="mdi-timer-sand">
                        {{ t('duplicatesOnAdd.chip_pending', {count: duplicateCheck.status.value.pending}) }}
                      </v-chip>
                      <v-chip size="x-small" variant="tonal" prepend-icon="mdi-magnify">
                        {{ t('duplicatesOnAdd.chip_found', {count: duplicateCheck.status.value.found}) }}
                      </v-chip>
                      <v-chip size="x-small" variant="tonal" prepend-icon="mdi-set-merge">
                        {{ t('duplicatesOnAdd.chip_merged', {count: duplicateCheck.status.value.merged}) }}
                      </v-chip>
                    </div>
                    <div v-if="duplicateCheck.status.value.current" class="task-notification__status text-truncate">
                      {{ duplicateCheck.status.value.current }}
                    </div>
                    <div v-if="duplicateCheck.progress.value != null || duplicateCheck.status.value.state === 'running'" class="task-notification__progress">
                      <v-progress-linear :model-value="duplicateCheck.progress.value ?? 0" color="warning" height="5" rounded
                        :indeterminate="duplicateCheck.status.value.state === 'running' && (duplicateCheck.progress.value == null || duplicateCheck.status.value.checked === 0)" />
                      <span v-if="duplicateCheck.progress.value != null" class="task-notification__percent">{{ Math.round(duplicateCheck.progress.value) }}%</span>
                    </div>
                  </div>
                </div>
                <div class="task-notification__actions">
                  <v-btn size="small" variant="tonal" color="primary" :disabled="duplicateCheck.busy.value"
                    @click="duplicateCheck.control(duplicateCheck.status.value.state === 'paused' ? 'resume' : 'pause')">
                    {{ t(duplicateCheck.status.value.state === 'paused' ? 'copyDiscovery.resume' : 'copyDiscovery.pause') }}
                  </v-btn>
                  <v-btn size="small" variant="text" color="error" :disabled="duplicateCheck.busy.value" @click="duplicateCheck.control('skip')">
                    {{ t('duplicatesOnAdd.skip') }}
                    <v-tooltip activator="parent" location="bottom" max-width="280">{{ t('duplicatesOnAdd.skip_hint') }}</v-tooltip>
                  </v-btn>
                  <v-btn size="small" variant="text" :to="duplicatesSettings" @click="showMenu = false">{{ t('copyDiscovery.configure') }}</v-btn>
                </div>
              </v-card>
              <v-alert v-if="duplicateCheck.failed.value" type="error" density="compact">{{ t('duplicatesOnAdd.control_failed') }}</v-alert>
              <template v-for="item in taskItems" :key="item.key">
                <v-card
                  class="task-notification task-card"
                  :style="accent(item.color)"
                >
                  <div class="task-notification__header">
                    <v-avatar
                      :color="item.color || 'primary'"
                      :icon="`mdi-${item.icon || 'cog'}`"
                      size="32"
                      variant="tonal"
                    />
                    <div class="task-notification__body">
                      <div class="task-notification__title" :title="item.title">{{ item.title }}</div>
                      <div v-if="item.subtitle" class="task-notification__status" :title="item.subtitle">{{ item.subtitle }}</div>
                      <div v-if="item.progress != null || !item.done" class="task-notification__progress">
                        <v-progress-linear
                          :model-value="item.progress ?? 0"
                          :indeterminate="item.progress == null"
                          :color="item.color || 'primary'"
                          height="5"
                          rounded
                        />
                        <span v-if="item.progress != null" class="task-notification__percent">{{ Math.round(item.progress) }}%</span>
                      </div>
                    </div>
                  </div>

                  <div v-if="item.click || item.action || item.done" class="task-notification__actions">
                    <v-btn
                      v-if="item.click"
                      @click.stop="openTask(item.click)"
                      color="primary"
                      variant="text"
                      size="small"
                    >
                      <v-icon start>mdi-open-in-new</v-icon>
                      {{ t('media.adding.open_process_dialog') }}
                    </v-btn>
                    <v-btn
                      v-if="item.action || item.done"
                      @click.stop="stopTask(item)"
                      :color="item.done ? 'secondary' : 'error'"
                      variant="text"
                      size="small"
                    >
                      <v-icon start>{{ item.done ? 'mdi-close' : 'mdi-close-octagon' }}</v-icon>
                      {{ item.done ? t('common.close') : t('common.stop') }}
                    </v-btn>
                  </div>
                </v-card>
              </template>
            </div>
            <template v-for="item in notificationItems" :key="item.key">
              <Notification
                :notification="item.notification"
              />
            </template>

            <div v-if="activityItems.length === 0 && copyJobs.length === 0 && !duplicateCheck.visible.value" class="text-center py-2">
              <div class="layout-img">
                <v-img
                  src="/images/bell.svg"
                  max-height="140"
                  class="my-4"
                  contain
                ></v-img>
                <div class="text-medium-emphasis">
                  {{ t("appbar.noNotifications") }}
                </div>
              </div>
            </div>
          </v-card-text>
        </div>
      </v-card>
    </v-menu>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useNotificationsStore } from '@/stores/notifications'
import { useTasksStore } from '@/stores/tasks'
import { useSceneScraperStore } from '@mediachips/plugin-adult/stores/sceneScraper'
import { useScraperStore } from '@mediachips/plugin-adult/stores/scraper'
import {useI18n} from "vue-i18n";
import type { TaskItem } from '@/types/stores'

import {copyDiscoveryApi} from '@/services/typedApi/copyDiscovery'
import {useDuplicatesOnAddEvents} from '@/composable/useDuplicatesOnAddEvents'
import {useAppStore} from '@/stores/app'
import type {CopyDiscoveryJob} from '@shared/copyDiscovery'

import Notification from '@/components/app/Notification.vue'

type NotificationEntry = ReturnType<typeof useNotificationsStore>['getNotificationsHidden'][number]

type TaskActivityItem = TaskItem & { kind: 'task'; key: string }
type NotificationActivityItem = {
  kind: 'notification'
  key: string
  notification: NotificationEntry
  timestamp: number
}

const notificationsStore = useNotificationsStore()
const tasksStore = useTasksStore()
const sceneScraperStore = useSceneScraperStore()
const scraperStore = useScraperStore()
const activatorRef = ref<HTMLElement | { $el?: HTMLElement } | null>(null)
const menuRef = ref<{ updateLocation?: () => void } | null>(null)

const {t} = useI18n()
const duplicateCheck = useDuplicatesOnAddEvents()
const duplicatesSettings = {name: 'Settings', query: {tab: 'maintenance', section: 'copy_discovery'}}

// Computed свойства
const notifications = computed(() => {
  return [...notificationsStore.getNotificationsHidden].reverse()
})

const tasks = computed(() => tasksStore.list)

const taskItems = computed((): TaskActivityItem[] => tasks.value.map(task => ({
  ...task,
  kind: 'task' as const,
  key: `task-${task.id}`,
})))

const notificationItems = computed((): NotificationActivityItem[] => notifications.value.map(notification => ({
  kind: 'notification' as const,
  key: `notification-${notification.id}`,
  notification,
  timestamp: notification.timestamp || 0,
})))

const activityItems = computed((): Array<TaskActivityItem | NotificationActivityItem> => [
  ...taskItems.value,
  ...notificationItems.value,
])

type CopyActivity = Pick<CopyDiscoveryJob, 'id' | 'state'>
const app = useAppStore()
const copyJobs = ref<CopyActivity[]>([])
/** Compact summary shown next to the bell so running tasks stay visible with the panel closed. */
const taskSummary = computed(() => {
  const entries: Array<{label: string; progress: number | null; paused: boolean}> = []
  if (copyJobs.value.length) {
    entries.push({label: t('copyDiscovery.title'), progress: null, paused: copySummaryState.value === 'paused'})
  }
  if (duplicateCheck.visible.value && duplicateCheck.status.value) {
    entries.push({
      label: t('duplicatesOnAdd.task_title'),
      progress: duplicateCheck.progress.value ?? null,
      paused: duplicateCheck.status.value.state === 'paused',
    })
  }
  for (const item of taskItems.value) {
    if (item.done) continue
    entries.push({label: String(item.title || ''), progress: item.progress ?? null, paused: false})
  }
  if (!entries.length) return null
  // A task with a real percentage is the most informative one to show.
  const primary = entries.find(entry => entry.progress != null && !entry.paused) || entries.find(entry => !entry.paused) || entries[0]
  const label = primary.progress != null ? `${primary.label} · ${Math.round(primary.progress)}%` : primary.label
  return {
    label,
    progress: primary.progress,
    paused: primary.paused,
    more: entries.length - 1,
    tooltip: entries.map(entry => entry.progress != null ? `${entry.label} · ${Math.round(entry.progress)}%` : entry.label).join('\n'),
  }
})
const THEME_COLORS = new Set(['primary', 'secondary', 'success', 'warning', 'error', 'info'])
/** Accent colour of a task card (left bar, border, tint) from a Vuetify theme colour name. */
const accent = (color?: unknown) => ({
  '--task-accent': `var(--v-theme-${typeof color === 'string' && THEME_COLORS.has(color) ? color : 'primary'})`,
})
const dupStateIcon = (state: string) => ({
  running: 'mdi-sync', paused: 'mdi-pause', idle: 'mdi-check', disabled: 'mdi-power',
} as Record<string, string>)[state] || 'mdi-sync'
const pinnedTaskCount = computed(() => Number(copyJobs.value.length > 0) + Number(duplicateCheck.visible.value) + taskItems.value.length)
const hasPinnedTasks = computed(() => copyJobs.value.length > 0 || duplicateCheck.visible.value || taskItems.value.length > 0)
const copyAction = ref(false)
const copyError = ref(false)
const copySettings = {name: 'Settings', query: {tab: 'maintenance', section: 'copy_discovery'}}
const copyPolling = new AbortController()
let copyTimer: ReturnType<typeof setTimeout> | undefined

async function pollCopyJobs() {
  const dbPath = app.dbPath
  try {
    if (!document.hidden && !copyAction.value) {
      const {data} = await copyDiscoveryApi.activity(copyPolling.signal)
      if (app.dbPath === dbPath && !copyAction.value) copyJobs.value = data
    }
  } catch {
    // The backend can be briefly unavailable while switching libraries.
  } finally {
    const busy = copyJobs.value.some(job => job.state !== 'paused')
    if (!copyPolling.signal.aborted) copyTimer = setTimeout(pollCopyJobs, busy ? 3000 : 30000)
  }
}

/** All queued discovery jobs share one card; the buttons act on every job of the list. */
const copySummaryState = computed<CopyActivity['state']>(() => {
  const jobs = copyJobs.value
  for (const state of ['discovering', 'verifying', 'queued'] as const) {
    if (jobs.some(job => job.state === state)) return state
  }
  return 'paused'
})

async function controlCopyJobs(action: 'pause' | 'resume' | 'cancel') {
  const dbPath = app.dbPath
  const targets = copyJobs.value.filter(job =>
    action === 'resume' ? job.state === 'paused' : action === 'pause' ? job.state !== 'paused' : true)
  if (!targets.length) return
  copyAction.value = true
  copyError.value = false
  try {
    for (const job of targets) {
      const {data} = await copyDiscoveryApi[action](job.id)
      if (app.dbPath !== dbPath) return
      copyJobs.value = copyJobs.value.flatMap(item => item.id !== job.id ? [item] :
        data.state === 'cancelled' ? [] : [{id: data.id, state: data.state}])
    }
  } catch {
    if (app.dbPath === dbPath) copyError.value = true
  } finally {
    copyAction.value = false
  }
}

watch(() => app.dbPath, () => { copyJobs.value = []; copyError.value = false })

onMounted(pollCopyJobs)
onBeforeUnmount(() => {
  copyPolling.abort()
  clearTimeout(copyTimer)
})

const badge = computed(() => activityItems.value.length + copyJobs.value.length + Number(duplicateCheck.visible.value))

const showMenu = computed({
  get: () => notificationsStore.show,
  set: (value) => notificationsStore.show = value
})

watch(() => notificationsStore.show, async (show) => {
  if (!show) return
  // However the panel was opened (bell, task chip, toast "show all"), toasts move into its list.
  notificationsStore.hideAllNotifications()
  await nextTick()
  menuRef.value?.updateLocation?.()
})

// Методы
const hideAll = () => {
  notificationsStore.hideAllNotifications()
}

const openTask = (action: unknown) => {
  showMenu.value = false
  if (action && typeof action === 'function') {
    action()
  }
}

const stopTask = (task: TaskActivityItem) => {
  if (!task.done && task.action && typeof task.action === 'function') {
    task.action()
  }
  tasksStore.removeTask(task.id)
  if (task.id && sceneScraperStore.batchTaskId === task.id) {
    sceneScraperStore.batchTaskId = null
  }
  if (task.id && scraperStore.batchTaskId === task.id) {
    scraperStore.batchTaskId = null
  }
}

const closeAll = () => {
  showMenu.value = false
  setTimeout(() => {
    notificationsStore.closeAllNotifications()
  }, 300)
}
</script>

<style lang="scss" scoped>
@use "../../../assets/styles/notification-card" as card;

.notifications-menu {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.notifications-header {
  min-height: 52px;
  background: linear-gradient(
    115deg,
    rgba(var(--v-theme-primary), 0.15),
    rgba(var(--v-theme-primary), 0.04) 72%,
    rgba(var(--v-theme-secondary), 0.09)
  );
}

.notifications-stack {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  padding: 10px;
  background: rgba(var(--v-theme-on-surface), 0.025);
}

.task-notification {
  @include card.surface;
  box-shadow: 0 2px 5px rgba(var(--v-theme-on-surface), 0.04);

  :deep(.v-avatar) {
    @include card.icon;
  }
}

.task-notification__header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.task-notification__body {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.task-notification__title {
  @include card.title;
}

.task-notification__status {
  @include card.text;
}

/* One line each: a status that changes while a task runs must not re-wrap and move the buttons below it. */
.task-notification__title,
.task-notification__status {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-notification__progress {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.task-notification__percent {
  flex-shrink: 0;
  padding: 2px 6px;
  border-radius: 6px;
  background: rgba(var(--v-theme-on-surface), 0.07);
  font-weight: 600;
}

.task-notification__actions {
  @include card.actions;
  margin-inline-start: 44px;
}

.notifications-list {
  max-height: min(65dvh, calc(100dvh - 112px));
  overflow: auto;
  overscroll-behavior: contain;
}

.notifications-pinned {
  display: grid;
  gap: 8px;
  padding-bottom: 14px;
  margin-bottom: 6px;
  border-bottom: 1px dashed rgba(var(--v-theme-on-surface), 0.18);
}

.notifications-pinned__head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  opacity: 0.65;
}

/* Tasks are tinted with an accent colour so they read differently from notifications. */
.task-notification.task-card {
  --task-accent: var(--v-theme-primary);
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(var(--task-accent), 0.4);
  background:
    linear-gradient(135deg, rgba(var(--task-accent), 0.14), rgba(var(--task-accent), 0.04) 60%, transparent),
    rgb(var(--v-theme-surface));
  box-shadow: 0 4px 14px rgba(var(--task-accent), 0.16);
}

.task-card--duplicates {
  .task-notification__status {
    margin-top: 14px;
  }

  .task-notification__progress {
    margin-top: 6px;
  }
}

.task-card__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;

  :deep(.v-chip) {
    flex: none;
    font-variant-numeric: tabular-nums;
  }
}

.notifications-bell {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  &__ring {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  &__tasks {
    white-space: pre-line;
    opacity: 0.85;
  }
}
</style>
