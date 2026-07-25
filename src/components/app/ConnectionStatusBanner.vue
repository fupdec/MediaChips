<template>
  <Teleport to="body">
    <transition name="connection-banner">
      <div
        v-if="show"
        class="connection-lost-banner"
        role="alert"
        aria-live="assertive"
      >
        <v-icon icon="mdi-cloud-off-outline" class="connection-lost-banner__icon"/>
        <div class="connection-lost-banner__body">
          <div class="connection-lost-banner__title">{{ title }}</div>
          <div
            v-if="subtitle"
            class="connection-lost-banner__subtitle"
          >
            {{ subtitle }}
          </div>
        </div>
        <div class="connection-lost-banner__actions">
          <v-btn
            v-if="showCancelAutoRestart"
            @click="$emit('cancel-auto-restart')"
            variant="text"
            color="white"
            size="small"
            class="px-3"
          >
            {{ cancelAutoRestartLabel }}
          </v-btn>
          <v-btn
            v-if="showRestart"
            @click="$emit('restart')"
            variant="flat"
            color="white"
            size="small"
            class="px-4"
            :loading="restarting"
          >
            <v-icon icon="mdi-restart" start/>
            {{ restartLabel }}
          </v-btn>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup lang="ts">
defineProps<{
  show: boolean
  title: string
  subtitle?: string
  showRestart?: boolean
  restartLabel: string
  restarting?: boolean
  showCancelAutoRestart?: boolean
  cancelAutoRestartLabel?: string
}>()

defineEmits<{
  restart: []
  'cancel-auto-restart': []
}>()
</script>

<style scoped>
.connection-lost-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: rgb(var(--v-theme-error));
  color: #fff;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.25);
  pointer-events: auto;
}

.connection-lost-banner__icon {
  flex-shrink: 0;
}

.connection-lost-banner__body {
  flex: 1;
  min-width: 0;
}

.connection-lost-banner__title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
}

.connection-lost-banner__subtitle {
  margin-top: 2px;
  font-size: 12px;
  opacity: 0.9;
  line-height: 1.3;
}

.connection-lost-banner__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.connection-banner-enter-active,
.connection-banner-leave-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.connection-banner-enter-from,
.connection-banner-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}
</style>
