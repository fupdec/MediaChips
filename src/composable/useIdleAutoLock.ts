import {onScopeDispose, watch} from 'vue'
import {storeToRefs} from 'pinia'
import {useAppStore} from '@/stores/app'
import {useSettingsStore} from '@/stores/settings'

export const AUTO_LOCK_IDLE_MINUTE_OPTIONS = [0, 1, 5, 10, 15, 30, 60] as const

export type AutoLockIdleMinutes = (typeof AUTO_LOCK_IDLE_MINUTE_OPTIONS)[number]

const ACTIVITY_EVENTS = [
  'pointerdown',
  'mousemove',
  'keydown',
  'wheel',
  'touchstart',
  'scroll',
] as const

const CHECK_INTERVAL_MS = 5_000
const ACTIVITY_THROTTLE_MS = 1_000

export function parseAutoLockIdleMinutes(raw: unknown): AutoLockIdleMinutes {
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return 0
  const rounded = Math.round(value)
  if ((AUTO_LOCK_IDLE_MINUTE_OPTIONS as readonly number[]).includes(rounded)) {
    return rounded as AutoLockIdleMinutes
  }
  // Unknown custom values: clamp to a sane positive timeout.
  return Math.min(Math.max(rounded, 1), 240) as AutoLockIdleMinutes
}

export function shouldAutoLockIdle(options: {
  passwordProtection: string | null | undefined
  autoLockIdleMinutes: unknown
  isLocked: boolean
}): boolean {
  if (options.passwordProtection !== '1') return false
  if (options.isLocked) return false
  return parseAutoLockIdleMinutes(options.autoLockIdleMinutes) > 0
}

export function isIdlePastTimeout(
  lastActivityAt: number,
  now: number,
  idleMinutes: number,
): boolean {
  if (idleMinutes <= 0) return false
  return now - lastActivityAt >= idleMinutes * 60_000
}

export function useIdleAutoLock(options: {lockApp: () => void}) {
  const appStore = useAppStore()
  const settingsStore = useSettingsStore()
  const {isLocked} = storeToRefs(appStore)
  const {passwordProtection, autoLockIdleMinutes} = storeToRefs(settingsStore)

  let lastActivityAt = Date.now()
  let lastThrottleAt = 0
  let checkTimer: ReturnType<typeof setInterval> | null = null
  let listening = false

  function markActivity() {
    const now = Date.now()
    if (now - lastThrottleAt < ACTIVITY_THROTTLE_MS) return
    lastThrottleAt = now
    lastActivityAt = now
  }

  function stopListening() {
    if (!listening) return
    for (const eventName of ACTIVITY_EVENTS) {
      window.removeEventListener(eventName, markActivity, true)
    }
    listening = false
  }

  function startListening() {
    if (listening) return
    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, markActivity, {capture: true, passive: true})
    }
    listening = true
  }

  function clearCheckTimer() {
    if (!checkTimer) return
    clearInterval(checkTimer)
    checkTimer = null
  }

  function tick() {
    if (!shouldAutoLockIdle({
      passwordProtection: passwordProtection.value,
      autoLockIdleMinutes: autoLockIdleMinutes.value,
      isLocked: isLocked.value,
    })) {
      return
    }

    const minutes = parseAutoLockIdleMinutes(autoLockIdleMinutes.value)
    if (isIdlePastTimeout(lastActivityAt, Date.now(), minutes)) {
      options.lockApp()
    }
  }

  function syncWatcher() {
    const enabled = shouldAutoLockIdle({
      passwordProtection: passwordProtection.value,
      autoLockIdleMinutes: autoLockIdleMinutes.value,
      isLocked: isLocked.value,
    })

    if (!enabled) {
      stopListening()
      clearCheckTimer()
      return
    }

    lastActivityAt = Date.now()
    startListening()
    if (!checkTimer) {
      checkTimer = setInterval(tick, CHECK_INTERVAL_MS)
    }
  }

  const stopWatch = watch(
    [passwordProtection, autoLockIdleMinutes, isLocked],
    () => {
      syncWatcher()
    },
    {immediate: true},
  )

  function stop() {
    stopWatch()
    stopListening()
    clearCheckTimer()
  }

  onScopeDispose(stop)

  return {
    markActivity,
    syncWatcher,
    stop,
    /** Test helpers */
    getLastActivityAt: () => lastActivityAt,
  }
}
