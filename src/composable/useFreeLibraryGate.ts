import {computed} from 'vue'
import {useAppStore} from '@/stores/app'
import {useDialogsStore} from '@/stores/dialogs'
import {useRegistrationStore} from '@/stores/registration'
import {isFreeLibraryGrandfathered} from '@/services/freeLibraryCapConfig'
import {
  FREE_LIBRARY_CAP,
  isFreeLibraryAtCap,
  isFreeLibraryNearCap,
  shouldBlockFreeLibraryImport,
} from '@/utils/freeLibraryCap'

/**
 * Free-tier library gate: block new imports at the cap and open the paywall.
 */
export function useFreeLibraryGate() {
  const appStore = useAppStore()
  const registrationStore = useRegistrationStore()
  const dialogsStore = useDialogsStore()

  const libraryCount = computed(() => registrationStore.libraryCount)
  const registered = computed(() => registrationStore.reg)
  const grandfathered = computed(() => isFreeLibraryGrandfathered(appStore.config))
  const atCap = computed(() => isFreeLibraryAtCap({
    registered: registered.value,
    grandfathered: grandfathered.value,
    libraryCount: libraryCount.value,
  }))
  const nearCap = computed(() => isFreeLibraryNearCap({
    registered: registered.value,
    grandfathered: grandfathered.value,
    libraryCount: libraryCount.value,
  }))
  const freeCap = FREE_LIBRARY_CAP

  async function refreshLibraryCount() {
    return registrationStore.refreshLibraryCount()
  }

  function openPaywall() {
    dialogsStore.openPaywall()
  }

  /**
   * @returns true when import may proceed; false when blocked (paywall opened).
   */
  async function ensureCanImportMedia(): Promise<boolean> {
    if (registrationStore.reg || isFreeLibraryGrandfathered(appStore.config)) return true

    const count = await registrationStore.refreshLibraryCount()
    if (!shouldBlockFreeLibraryImport({
      registered: false,
      grandfathered: false,
      libraryCount: count,
    })) {
      return true
    }

    dialogsStore.openPaywall()
    return false
  }

  return {
    libraryCount,
    registered,
    grandfathered,
    atCap,
    nearCap,
    freeCap,
    refreshLibraryCount,
    openPaywall,
    ensureCanImportMedia,
  }
}
