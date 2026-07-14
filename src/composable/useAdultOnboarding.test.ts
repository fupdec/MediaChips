import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDialogsStore } from '@/stores/dialogs'
import {
  openAdultOnboarding,
  closeAdultOnboarding,
} from '@/composable/useAdultOnboarding'

describe('useAdultOnboarding', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('opens and closes the adult onboarding dialog', () => {
    const dialogs = useDialogsStore()

    openAdultOnboarding()
    expect(dialogs.adultOnboarding.show).toBe(true)

    closeAdultOnboarding()
    expect(dialogs.adultOnboarding.show).toBe(false)
  })
})
