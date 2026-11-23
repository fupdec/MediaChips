import {computed} from 'vue'
import {useAppStore} from '@/stores/app'
import {useDialogsStore} from '@/stores/dialogs'
import {useRegistrationStore} from '@/stores/registration'
import {isProAccessSettled, isProFeaturesGrandfathered, readProAccessConfig} from '@/services/proAccessConfig'
import {hasProAccess, proTrialDaysLeft, type ProFeature} from '@/utils/proAccess'

/**
 * Pro feature gate: a registered key, a grandfathered install or an active trial unlocks everything;
 * otherwise `requirePro` opens the paywall for that feature.
 */
export function useProFeatureGate() {
  const appStore = useAppStore()
  const registrationStore = useRegistrationStore()
  const dialogsStore = useDialogsStore()

  const trialStartedAt = computed(() => readProAccessConfig(appStore.config).proTrialStartedAt)
  const trialDaysLeft = computed(() => proTrialDaysLeft(trialStartedAt.value))
  // Until the one-time migration has decided who is an existing install, nothing is blocked.
  const hasPro = computed(() => !isProAccessSettled(appStore.config) || hasProAccess({
    registered: registrationStore.reg,
    grandfathered: isProFeaturesGrandfathered(appStore.config),
    trialStartedAt: trialStartedAt.value,
  }))

  /** @returns true when the feature may be used; false when blocked (paywall opened). */
  function requirePro(feature: ProFeature): boolean {
    if (hasPro.value) return true
    dialogsStore.openPaywall(feature)
    return false
  }

  return {hasPro, trialDaysLeft, requirePro}
}
