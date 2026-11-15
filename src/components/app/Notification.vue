<template>
  <v-card
    ref="cardRef"
    @pointerdown="onSwipePointerDown"
    @mouseenter="stopTimer"
    @mouseleave="resumeTimer"
    @click="onCardClick"
    class="notification"
    :class="[swipeClass, {'notification--clickable': Boolean(notificationClick), 'notification--history': isHidden}]"
    :style="notificationSwipeStyle"
    :elevation="isHidden ? 0 : 9"
  >
    <v-btn :color="notification.color" class="notification__icon" variant="tonal" icon>
      <v-icon>mdi-{{ notification.icon }}</v-icon>
    </v-btn>

    <div class="notification__body">
      <div class="notification__title">{{ notification.title }}</div>
      <div
        @click="collapsed = !collapsed"
        class="notification__text"
        v-html="displayText"
      ></div>
      <div v-if="isHidden && hasDownloadProgress" class="notification__progress">
        <v-progress-linear
          :model-value="downloadProgress"
          :color="notification.color || 'primary'"
          height="5"
          rounded
        />
        <span class="notification__percent">{{ Math.round(downloadProgress) }}%</span>
      </div>
      <div
        v-if="actions.length"
        class="notification__actions"
      >
        <v-btn
          v-for="action in actions"
          :key="action.id || action.text"
          @click.stop="runAction(action)"
          :color="action.color || notification.color"
          :variant="action.variant || 'text'"
          size="small"
          class="notification__action"
        >
          <v-icon
            v-if="action.icon"
            start
          >mdi-{{ action.icon }}</v-icon>
          {{ action.text }}
        </v-btn>
      </div>
      <div v-if="isHidden && formattedTimestamp" class="notification__timestamp">
        <v-icon size="12" aria-hidden="true">mdi-clock-outline</v-icon>
        {{ formattedTimestamp }}
      </div>
    </div>

    <div class="notification__manage">
      <v-btn
        @click.stop="closeNotification"
        :aria-label="$t('common.close')"
        class="notification__close-btn"
        icon variant="plain"
      >
        <v-icon>mdi-close</v-icon>
      </v-btn>
      <v-btn
        v-if="!notification.hidden"
        @click="hideNotification"
        class="notification__close-btn"
        variant="plain"
        icon
      >
        <v-icon>mdi-minus</v-icon>
      </v-btn>
    </div>

    <div
      v-if="!isHidden && hasDownloadProgress"
      class="notification__timeout notification__timeout--download"
      aria-hidden="true"
    >
      <div
        class="notification__timeout-bar"
        :style="{
          transform: `scaleX(${Math.max(0, Math.min(100, downloadProgress)) / 100})`,
          backgroundColor: `rgb(var(--v-theme-${notification.color || 'primary'}))`,
        }"
      ></div>
    </div>

    <div
      v-else-if="!isHidden"
      class="notification__timeout"
      aria-hidden="true"
    >
      <div
        class="notification__timeout-bar"
        :style="{
          transform: `scaleX(${Math.max(0, progress) / 100})`,
          backgroundColor: `rgb(var(--v-theme-${notification.color || 'primary'}))`,
        }"
      ></div>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import {ref, computed, onMounted, onUnmounted, watch} from 'vue'
import {useSettingsStore} from '@/stores/settings'
import {useNotificationsStore} from '@/stores/notifications'
import {useSwipeToDismiss} from '@/composable/useSwipeToDismiss'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/en'
import 'dayjs/locale/de'
import 'dayjs/locale/fr'
import 'dayjs/locale/ja'
import 'dayjs/locale/ko'
import 'dayjs/locale/pl'
import 'dayjs/locale/tr'
import 'dayjs/locale/it'
import 'dayjs/locale/zh-tw'
import 'dayjs/locale/pt-br'
import 'dayjs/locale/es'
import 'dayjs/locale/zh-cn'
import 'dayjs/locale/ru'
import type { NotificationInput } from '@/services/notificationService'

interface NotificationAction {
  id?: string
  text?: string
  color?: string
  variant?: 'text' | 'flat' | 'elevated' | 'outlined' | 'plain' | 'tonal'
  icon?: string
  hide?: boolean
  close?: boolean
  action?: (notification: PoolNotification) => void
}

type PoolNotification = NotificationInput & {
  id: number
  title?: string
  timestamp?: number
  actions?: NotificationAction[]
}

const settingsStore = useSettingsStore()
const locale = settingsStore.locale == 'cn' ? 'zh-cn' : settingsStore.locale == 'tw' ? 'zh-tw' : settingsStore.locale == 'pt' ? 'pt-br' : settingsStore.locale

dayjs.extend(relativeTime)
dayjs.locale(locale)

const props = defineProps<{
  notification: PoolNotification
}>()

const cardRef = ref<{ $el?: HTMLElement } | null>(null)
const progress = ref(100)
const collapsed = ref(true)
let rafId = 0
let periodMs = 5000
let endsAt = 0

const notificationsStore = useNotificationsStore()

const isHidden = computed(() => props.notification.hidden)
const actions = computed(() => Array.isArray(props.notification.actions) ? props.notification.actions : [])
const hasDownloadProgress = computed(() => (
  props.notification.progressPercent != null
  && Number.isFinite(Number(props.notification.progressPercent))
))
const downloadProgress = computed(() => Number(props.notification.progressPercent) || 0)
const notificationClick = computed(() => {
  const click = props.notification.click
  return typeof click === 'function' ? click : null
})

const closeNotification = () => {
  notificationsStore.closeNotification(props.notification.id)
}

const hideNotification = () => {
  notificationsStore.hideNotification(props.notification.id)
}

const onCardClick = (event: MouseEvent) => {
  const target = event.target as HTMLElement | null
  if (target?.closest('.notification__manage, .notification__actions, .notification__close-btn, .notification__action')) {
    return
  }
  const click = notificationClick.value
  if (!click) return
  click()
}

const {
  offsetX,
  isDragging,
  dismissing,
  swipeStyle,
  swipeClass,
  onPointerDown: onSwipePointerDown,
  bindWheel,
  resolveEl,
} = useSwipeToDismiss(() => {
  // Swipe away from the toast pool removes the toast (same as auto-timeout / X).
  closeNotification()
})

const notificationSwipeStyle = computed(() => {
  // Idle: no inline transform — pool leave CSS must be able to slide right.
  // (Previously a near-end translateX(20px) blocked auto-hide leave animation.)
  if (!isDragging.value && offsetX.value === 0 && !dismissing.value) {
    return undefined
  }

  return {
    transform: `translateX(${offsetX.value}px)`,
    opacity: swipeStyle.value?.opacity,
  }
})

const displayText = computed(() => {
  let text = props.notification.text || ''
  // Only collapse very long bodies; short toasts should wrap fully in the card.
  if (collapsed.value && text.length > 180) {
    text = text.slice(0, 180) + '...'
  }
  return text
})

const getSafeFormattedTimestamp = (timestamp?: number) => {
  try {
    if (!timestamp) return ''

    const date = dayjs(timestamp)
    if (date.isValid()) {
      return date.fromNow()
    }

    return new Date(timestamp).toLocaleTimeString()
  } catch (error) {
    console.error('Error in getSafeFormattedTimestamp:', error)
    return ''
  }
}

const formattedTimestamp = computed(() => {
  return getSafeFormattedTimestamp(props.notification.timestamp)
})

const runAction = (action: NotificationAction) => {
  if (action.action && typeof action.action === 'function') {
    action.action(props.notification)
  }

  if (action.hide) {
    hideNotification()
  }

  if (action.close) {
    closeNotification()
  }
}

const tick = (now: number) => {
  const left = Math.max(0, endsAt - now)
  progress.value = periodMs > 0 ? (left / periodMs) * 100 : 0
  if (left <= 0) {
    rafId = 0
    hideNotification()
    return
  }
  rafId = requestAnimationFrame(tick)
}

const stopTimer = () => {
  if (!rafId) return
  cancelAnimationFrame(rafId)
  rafId = 0
  // Freeze remaining fraction so resume continues from here.
  if (periodMs > 0 && endsAt > 0) {
    const left = Math.max(0, endsAt - performance.now())
    progress.value = (left / periodMs) * 100
  }
}

const runTimer = () => {
  if (isHidden.value || dismissing.value) {
    stopTimer()
    return
  }

  periodMs = props.notification.timeout || 5000
  if (periodMs <= 0) return

  stopTimer()
  const remaining = Math.max(0, (progress.value / 100) * periodMs)
  if (remaining <= 0) {
    hideNotification()
    return
  }
  endsAt = performance.now() + remaining
  rafId = requestAnimationFrame(tick)
}

const resumeTimer = () => {
  if (dismissing.value || isDragging.value || offsetX.value > 0) return
  if (isHidden.value) return
  if (!props.notification.timeout || props.notification.timeout <= 0) return
  if (!rafId && progress.value > 0) {
    runTimer()
  }
}

watch([isDragging, offsetX, dismissing], ([dragging, ox, isDismissing]) => {
  if (dragging || ox > 0 || isDismissing) {
    stopTimer()
    return
  }
  resumeTimer()
})

onMounted(() => {
  if (!props.notification.hidden && props.notification.timeout && props.notification.timeout > 0) {
    runTimer()
  }
  bindWheel(resolveEl(cardRef))
})

onUnmounted(() => {
  stopTimer()
})
</script>

<style scoped lang="scss">
@use "../../assets/styles/notification-card" as card;

.notification {
  display: flex;
  align-items: flex-start;
  height: auto;
  width: var(--toast-width, 370px);
  max-width: 100%;
  margin: 0 0 16px;
  @include card.surface;
  position: relative;
  // Clip only the timeout bar / swipe edges; let multi-line text grow the card.
  overflow: hidden;
  z-index: 50000;
  pointer-events: all;
  touch-action: pan-y;
  overscroll-behavior-x: none;
  // Swipe uses inline transform; leave slide is driven by the pool transition.
  transition: box-shadow 0.3s ease;
  cursor: grab;

  // Hover overlay is `currentColor` (white in dark theme). During leave
  // transform it composites as a leftover stripe on the left edge.
  :deep(.v-card__overlay),
  :deep(.v-card__underlay) {
    display: none;
  }

  &--clickable {
    cursor: pointer;
  }

  &.swipe-dismiss--swiping {
    transition: none;
    cursor: grabbing;
  }

  &.swipe-dismiss--active {
    user-select: none;
    transition: transform 0.2s ease, opacity 0.2s ease;
  }

  &__body {
    min-width: 0;
    flex: 1;
    padding-right: 28px;
  }

  &__icon {
    @include card.icon;
    margin-inline-end: 10px;
    display: flex;
    justify-content: center;
    flex-shrink: 0;
    pointer-events: none;

    &::before {
      opacity: .08;
    }
  }

  &__title {
    @include card.title;
    max-width: 100%;
    overflow-wrap: anywhere;
    word-break: break-word;
    white-space: normal;
  }

  &__text {
    @include card.text;
    max-width: 100%;
    cursor: pointer;
    transition: opacity 0.2s ease;
    overflow-wrap: anywhere;
    word-break: break-word;
    white-space: normal;

    &:hover {
      opacity: 1;
    }
  }

  &__actions {
    @include card.actions;
  }

  &__action {
    min-width: 0;
    border-radius: 8px;
    letter-spacing: normal;
  }

  &__timeout {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 2px;
    overflow: hidden;
    pointer-events: none;

    &--download {
      height: 3px;
    }
  }

  &__timeout-bar {
    width: 100%;
    height: 100%;
    transform-origin: left center;
    will-change: transform;
  }

  &__progress {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 10px;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  &__percent {
    flex-shrink: 0;
    padding: 2px 6px;
    border-radius: 6px;
    background: rgba(var(--v-theme-on-surface), 0.07);
    font-weight: 600;
  }

  &__timestamp {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 9px;
    font-size: 11px;
    opacity: 0.65;
  }

  &--history {
    width: 100%;
    min-height: 0;
    margin: 0;
    box-shadow: 0 2px 5px rgba(var(--v-theme-on-surface), 0.04);
    z-index: auto;
  }

  &__manage {
    position: absolute;
    right: 5px;
    top: 5px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__close-btn {
    width: 24px;
    height: 24px;
    border-radius: 7px;
    font-size: 12px;
    margin-top: 4px;
  }
}

@media (max-width: 480px) {
  .notification {
    &:not(.notification--history) {
      width: min(var(--toast-width, 370px), calc(100vw - 30px));
    }
  }
}
</style>
