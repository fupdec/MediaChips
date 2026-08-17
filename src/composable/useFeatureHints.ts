import {computed, ref, watch, type Ref} from 'vue'
import {useRoute} from 'vue-router'
import {useAppStore} from '@/stores/app'
import {useDialogsStore} from '@/stores/dialogs'
import {useElementSpotlightStore} from '@/stores/elementSpotlight'
import {useItemsStore} from '@/stores/items'
import {useSettingsStore} from '@/stores/settings'
import {setOption} from '@/services/settingsService'
import {FEATURE_HINTS, type FeatureHintDefinition} from '@/services/featureHints'
import {
  getSeenFeatureHints,
  isFeatureHintSeen,
  markFeatureHintSeen,
} from '@/services/featureHintPreferences'
import {shouldShowOnboarding} from '@/composable/useOnboarding'

const activeHint = ref<FeatureHintDefinition | null>(null)
const tipVisible = ref(false)
let showInFlight = false
let scheduledTimer: ReturnType<typeof setTimeout> | null = null

export function useFeatureHintState() {
  return {
    activeHint: activeHint as Ref<FeatureHintDefinition | null>,
    tipVisible,
    tipStyle: computed(() => {
      const spotlight = useElementSpotlightStore()
      const hole = spotlight.holes[0]
      if (!hole) {
        return {
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        }
      }

      const tipWidth = 320
      const gap = 14
      const viewportPad = 16
      const viewportW = spotlight.viewportWidth || window.innerWidth
      const viewportH = spotlight.viewportHeight || window.innerHeight

      let left = hole.left + hole.width / 2 - tipWidth / 2
      left = Math.max(viewportPad, Math.min(left, viewportW - tipWidth - viewportPad))

      const belowTop = hole.top + hole.height + gap
      const estimatedTipHeight = 160
      const fitsBelow = belowTop + estimatedTipHeight + viewportPad < viewportH
      const top = fitsBelow
        ? belowTop
        : Math.max(viewportPad, hole.top - estimatedTipHeight - gap)

      return {
        top: `${Math.round(top)}px`,
        left: `${Math.round(left)}px`,
        width: `${tipWidth}px`,
        transform: 'none',
      }
    }),
  }
}

function clearScheduled() {
  if (scheduledTimer == null) return
  clearTimeout(scheduledTimer)
  scheduledTimer = null
}

function blockingDialogOpen(dialogs: ReturnType<typeof useDialogsStore>): boolean {
  if (dialogs.onboarding?.show) return true
  if (dialogs.changelog?.show) return true
  if (dialogs.documentation) return true
  if (dialogs.process?.show) return true
  return false
}

function findNextHint(routeType: string | undefined): FeatureHintDefinition | null {
  const seen = new Set(getSeenFeatureHints())
  for (const hint of FEATURE_HINTS) {
    if (seen.has(hint.id)) continue
    if (hint.routeTypes?.length) {
      if (!routeType || !hint.routeTypes.includes(routeType as 'media')) continue
    }
    return hint
  }
  return null
}

async function ensureSidebarExpandedForHint(hint: FeatureHintDefinition): Promise<void> {
  if (!hint.ensureSidebarExpanded) return

  const settingsStore = useSettingsStore()
  if (settingsStore.sidebarCollapsed !== '1') return

  await setOption('0', 'sidebarCollapsed')
  // Wait for SideBarBrowser to leave rail mode and mount the edit control.
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  await new Promise<void>((resolve) => setTimeout(resolve, 320))
}

export function useFeatureHints(options: {isPlayerWindow: Ref<boolean>; isShellReady: Ref<boolean>}) {
  const route = useRoute()
  const appStore = useAppStore()
  const dialogsStore = useDialogsStore()
  const itemsStore = useItemsStore()
  const settingsStore = useSettingsStore()
  const spotlight = useElementSpotlightStore()

  async function dismissActiveHint(markSeen = true) {
    const hint = activeHint.value
    tipVisible.value = false
    activeHint.value = null
    // dismiss() fires onDone; activeHint is already null so onDone won't double-mark.
    spotlight.dismiss()
    if (markSeen && hint) {
      await markFeatureHintSeen(hint.id)
    }
  }

  async function showHint(hint: FeatureHintDefinition): Promise<boolean> {
    if (showInFlight || activeHint.value) return false
    if (isFeatureHintSeen(hint.id)) return false
    showInFlight = true
    activeHint.value = hint
    let presented = false

    try {
      await ensureSidebarExpandedForHint(hint)

      const matched = await spotlight.spotlight(hint.selector, {
        durationMs: 0,
        pad: 10,
        opacity: 0.55,
        settleMs: 600,
        firstOnly: true,
        onDone: () => {
          // Only mark seen after the tip was actually shown (user dismiss / Escape).
          const current = activeHint.value
          tipVisible.value = false
          activeHint.value = null
          if (current && presented) {
            void markFeatureHintSeen(current.id)
          }
        },
      })

      if (!matched) {
        activeHint.value = null
        tipVisible.value = false
        return false
      }

      presented = true
      tipVisible.value = true
      return true
    } finally {
      showInFlight = false
    }
  }

  function scheduleTryShow(delayMs = 1400) {
    clearScheduled()
    scheduledTimer = setTimeout(() => {
      scheduledTimer = null
      void tryShowNextHint()
    }, delayMs)
  }

  async function tryShowNextHint() {
    if (options.isPlayerWindow.value) return
    if (!options.isShellReady.value) return
    if (appStore.isLocked) return
    if (shouldShowOnboarding(false)) return
    if (blockingDialogOpen(dialogsStore)) return
    if (activeHint.value || showInFlight || spotlight.show) return

    const routeType = itemsStore.type === 'media' || String(route.name || '').includes('media')
      ? 'media'
      : itemsStore.type
    const hint = findNextHint(routeType)
    if (!hint) return

    const selector = Array.isArray(hint.selector) ? hint.selector[0] : hint.selector
    let hasTarget = Boolean(document.querySelector(selector))
    if (!hasTarget && hint.ensureSidebarExpanded && settingsStore.sidebarCollapsed === '1') {
      await ensureSidebarExpandedForHint(hint)
      hasTarget = Boolean(document.querySelector(selector))
    }
    if (!hasTarget) {
      // Media list still loading — retry once items appear (watch also covers length changes).
      if (routeType === 'media' && itemsStore.itemsOnPage.length === 0) {
        scheduleTryShow(1800)
      }
      return
    }

    await showHint(hint)
  }

  watch(
    () => [
      options.isShellReady.value,
      options.isPlayerWindow.value,
      appStore.isLocked,
      itemsStore.type,
      itemsStore.itemsOnPage.length,
      dialogsStore.onboarding?.show,
      dialogsStore.changelog?.show,
      settingsStore.sidebarCollapsed,
      route.fullPath,
    ],
    () => {
      scheduleTryShow()
    },
    {immediate: true},
  )

  return {
    ...useFeatureHintState(),
    tryShowNextHint,
    dismissActiveHint,
    scheduleTryShow,
  }
}
