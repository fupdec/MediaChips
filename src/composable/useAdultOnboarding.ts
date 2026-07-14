import { useDialogsStore } from '@/stores/dialogs'

export function openAdultOnboarding(): void {
  useDialogsStore().adultOnboarding.show = true
}

export function closeAdultOnboarding(): void {
  useDialogsStore().adultOnboarding.show = false
}
