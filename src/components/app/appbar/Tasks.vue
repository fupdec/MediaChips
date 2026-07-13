<template>
  <v-menu
    v-model="menuVisible"
    :close-on-content-click="false"
    offset-y
    nudge-bottom="10"
  >
    <template #activator="{ props: activatorProps }">
      <v-tooltip location="bottom">
        <template #activator="{ props: tooltipProps }">
          <v-badge
            :model-value="!!badge"
            :content="badge"
            color="secondary"
            offset-x="35"
            offset-y="10"
          >
            <v-btn
              v-bind="mergeProps(activatorProps, tooltipProps)"
              :class="{ 'busy': badge > 0 }"
              class="cogs"
              icon
            >
              <v-icon size="13" class="small">mdi-cog</v-icon>
              <v-icon size="18" class="big">mdi-cog</v-icon>
            </v-btn>
          </v-badge>
        </template>
        <span>{{ t("appbar.tasks") }}</span>
      </v-tooltip>
    </template>

    <v-card width="400" rounded="lg">
      <v-card-actions class="px-4">
        <v-icon start>mdi-cogs</v-icon>
        {{ t("appbar.tasks") }}
      </v-card-actions>

      <v-divider></v-divider>

      <v-card-text v-if="tasks.length > 0" class="tasks-list pa-2" density="compact">
        <v-card
          v-for="task in tasks"
          :key="task.id"
          :title="task.title"
          :subtitle="task.subtitle"
          elevation="3"
          rounded="lg"
          class="task-list"
        >
          <template #prepend>
            <v-avatar :color="task.color || 'primary'">
              <v-icon :icon="`mdi-${task.icon || 'cog'}`" dark></v-icon>
            </v-avatar>
          </template>
          <template v-if="task.progress" #loader>
            <v-progress-linear
              :model-value="task.progress"
              :color="task.color || 'primary'"
              height="2"
            ></v-progress-linear>
          </template>
          <v-card-actions class="pt-0">
            <v-btn
              v-if="task.click"
              @click.stop="open(task.click)"
              color="primary"
              variant="text"
              class="px-4"
            >
              <v-icon start>mdi-open-in-new</v-icon>
              {{ t('media.adding.open_process_dialog') }}
            </v-btn>
            <v-btn
              v-if="task.action"
              @click.stop="remove(task.action, task.id)"
              color="error"
              variant="text"
              class="px-4"
            >
              <v-icon start>mdi-close-octagon</v-icon>
              Stop
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-card-text>

      <v-card-text v-else class="text-center">
        <div class="layout-img">
          <v-img
            src="/images/cogs.svg"
            max-height="140"
            class="my-4"
            contain
          ></v-img>
          <div class="text-medium-emphasis">
            {{ t("appbar.noTasks") }}
          </div>
        </div>
      </v-card-text>
    </v-card>
  </v-menu>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue'
import {useTasksStore} from '@/stores/tasks'
import {useSceneScraperStore} from '@/stores/sceneScraper'
import {useScraperStore} from '@/stores/scraper'
import {mergeProps} from 'vue'
import {useI18n} from 'vue-i18n'
import {onMounted, onBeforeUnmount} from 'vue'
import {useEventBus} from '@/utils/eventBus'

// i18n
const {t} = useI18n()

const tasksStore = useTasksStore()
const sceneScraperStore = useSceneScraperStore()
const scraperStore = useScraperStore()
const eventBus = useEventBus()

const menuVisible = ref(false)

// Computed свойства
const tasks = computed(() => tasksStore.list)
const badge = computed(() => tasksStore.list.length)

// Методы
const open = (action: unknown) => {
  menuVisible.value = false
  if (typeof action === 'function') {
    action()
  }
}

const remove = (action: unknown, id: string | number) => {
  if (typeof action === 'function') {
    action()
  }
  const taskId = String(id)
  tasksStore.removeTask(taskId)
  if (sceneScraperStore.batchTaskId === taskId) {
    sceneScraperStore.batchTaskId = null
  }
  if (scraperStore.batchTaskId === taskId) {
    scraperStore.batchTaskId = null
  }
}

const openTasksMenu = () => {
  menuVisible.value = true
}

onMounted(() => {
  eventBus.on('openTasksMenu', openTasksMenu)
})

onBeforeUnmount(() => {
  eventBus.off('openTasksMenu', openTasksMenu)
})
</script>

<style lang="scss" scoped>
.tasks-list {
  max-height: calc(60vh - 60px);
  overflow: auto;
}

.task-list {
  margin-bottom: 16px;
}

.task-list:last-of-type {
  margin-bottom: 0;
}

.cogs {
  position: relative;

  &.busy {
    .small,
    .big {
      animation: rotate infinite 2s forwards linear;
    }
  }

  .small,
  .big {
    position: absolute;
  }

  .small {
    top: 7px;
    left: 18px;
  }

  .big {
    top: 15px;
    left: 6px;
  }
}

@keyframes rotate {
  from {
    transform: rotate(0);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>