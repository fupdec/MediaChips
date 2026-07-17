import { createI18n } from 'vue-i18n'
import type { createVuetify } from 'vuetify'
import { en } from 'vuetify/locale'
import en_custom from '@/i18n/en'

type AppLocale = 'en' | 'cn' | 'de' | 'es' | 'ru'
type NonEnglishLocale = Exclude<AppLocale, 'en'>
type VuetifyInstance = ReturnType<typeof createVuetify>
type LocaleMessages = Record<string, unknown>

const LOCALE_SESSION_KEY = 'mediachips.locale'

const loadedLocales = new Set<AppLocale>(['en'])
let vuetifyInstance: VuetifyInstance | null = null

const customLocaleLoaders: Record<NonEnglishLocale, () => Promise<{ default: Record<string, unknown> }>> = {
  cn: () => import('@/i18n/cn'),
  de: () => import('@/i18n/de'),
  es: () => import('@/i18n/es'),
  ru: () => import('@/i18n/ru'),
}

const vuetifyLocaleLoaders: Record<NonEnglishLocale, () => Promise<LocaleMessages>> = {
  cn: () => import('vuetify/locale').then((m) => m.zhHans),
  de: () => import('vuetify/locale').then((m) => m.de),
  es: () => import('vuetify/locale').then((m) => m.es),
  ru: () => import('vuetify/locale').then((m) => m.ru),
}

function normalizeLocale(locale: string): AppLocale {
  if (locale === 'cn' || locale === 'de' || locale === 'es' || locale === 'ru') return locale
  return 'en'
}

function readSessionLocale(): AppLocale {
  try {
    return normalizeLocale(sessionStorage.getItem(LOCALE_SESSION_KEY) || 'en')
  } catch {
    return 'en'
  }
}

function writeSessionLocale(locale: AppLocale): void {
  try {
    sessionStorage.setItem(LOCALE_SESSION_KEY, locale)
  } catch {
    // ignore sessionStorage failures (private mode, etc.)
  }
}

function applyLocaleMessages(code: AppLocale, custom: Record<string, unknown>, vuetifyLocale: LocaleMessages) {
  const messages = {
    $vuetify: {...vuetifyLocale},
    ...custom,
  }

  i18n.global.setLocaleMessage(code, messages as (typeof i18n.global.messages.value)['en'])
  if (vuetifyInstance) {
    const vuetifyMessages = vuetifyInstance.locale.messages.value as Record<string, Record<string, unknown>>
    vuetifyMessages[code] = {
      ...vuetifyLocale,
      ...custom,
    }
  }
}

const initialLocale = readSessionLocale()

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale,
  fallbackLocale: 'en',
  messages: {
    en: {
      $vuetify: {...en},
      ...en_custom,
    },
  },
  silentTranslationWarn: true,
  missingWarn: false,
  fallbackWarn: false,
})

export function registerVuetifyForLocales(vuetify: VuetifyInstance): void {
  vuetifyInstance = vuetify
}

export function isLocaleLoaded(locale: string): boolean {
  return loadedLocales.has(normalizeLocale(locale))
}

export async function loadLocale(
  locale: string,
  {reload = false}: {reload?: boolean} = {},
): Promise<AppLocale> {
  const code = normalizeLocale(locale)
  if (!reload && loadedLocales.has(code)) {
    writeSessionLocale(code)
    return code
  }

  if (code === 'en') {
    const custom = reload
      ? ((await import('@/i18n/en')).default as Record<string, unknown>)
      : (en_custom as Record<string, unknown>)
    applyLocaleMessages('en', custom, en as LocaleMessages)
    loadedLocales.add('en')
    writeSessionLocale('en')
    return 'en'
  }

  const loaderCode = code as NonEnglishLocale
  const [customModule, vuetifyLocale] = await Promise.all([
    customLocaleLoaders[loaderCode](),
    vuetifyLocaleLoaders[loaderCode](),
  ])

  applyLocaleMessages(code, customModule.default, vuetifyLocale)
  loadedLocales.add(code)
  writeSessionLocale(code)

  return code
}

// Prefetch the remembered non-English catalog so a Vite page-reload of i18n
// files does not flash English until settings rehydrate.
if (initialLocale !== 'en') {
  void loadLocale(initialLocale).then((code) => {
    i18n.global.locale.value = code as typeof i18n.global.locale.value
  })
}

async function reloadActiveLocaleMessages(): Promise<void> {
  const current = normalizeLocale(String(i18n.global.locale.value) || readSessionLocale())

  // Force re-fetch of non-english catalogs after HMR.
  for (const code of [...loadedLocales]) {
    if (code !== 'en') loadedLocales.delete(code)
  }

  const enModule = await import('@/i18n/en')
  applyLocaleMessages('en', enModule.default as Record<string, unknown>, en as LocaleMessages)
  loadedLocales.add('en')

  await loadLocale(current, {reload: true})
  i18n.global.locale.value = current as typeof i18n.global.locale.value
  if (vuetifyInstance) {
    vuetifyInstance.locale.current.value = current
  }
}

if (import.meta.hot) {
  // Keep the chosen language across locale file edits instead of full page
  // reload falling back to English (createI18n default).
  import.meta.hot.accept(['./en', './ru', './es', './cn', './de'], () => {
    void reloadActiveLocaleMessages()
  })
}

export type { AppLocale }
