import {i18n, loadLocale} from '@/i18n/loadLocale'
import {setOption} from '@/services/settingsService'
import {syncShellLocale} from '@/services/electronBridge'
import {isDesktopElectronUi} from '@/utils/electronUi'

export async function applyAppUiLocale(code: string): Promise<string> {
  const next = await loadLocale(code)
  i18n.global.locale.value = next as typeof i18n.global.locale.value
  document.documentElement.lang = next
  await setOption(next, 'locale')
  if (isDesktopElectronUi()) {
    void syncShellLocale(next)
  }
  return next
}
