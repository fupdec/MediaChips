import { i18n } from '@/i18n/loadLocale'

type Locale = 'en' | 'ru' | 'cn' | 'de' | 'es' | 'fr' | 'ja' | 'pt'

export type { Locale }

const LOCALES: Locale[] = ['en', 'ru', 'cn', 'de', 'es', 'fr', 'ja', 'pt']

export function toLocale(value: string | undefined): Locale {
  if (value && LOCALES.includes(value as Locale)) {
    return value as Locale
  }
  return 'en'
}

function getMessages(locale: Locale): Record<string, unknown> {
  const catalogs = i18n.global.messages.value as Record<string, Record<string, unknown>>
  return catalogs[locale] ?? catalogs.en ?? {}
}

function getByPath(obj: Record<string, unknown> | undefined, keyPath: string): unknown {
  return keyPath.split('.').reduce<unknown>((value, key) => {
    if (value && typeof value === 'object') {
      return (value as Record<string, unknown>)[key]
    }
    return undefined
  }, obj)
}

function resolvePlainMessage(locale: Locale, key: string): string | undefined {
  const value = getByPath(getMessages(locale), key)
  return typeof value === 'string' ? value : undefined
}

export function translate(
  key: string,
  params: Record<string, string | number> = {},
  locale: Locale = 'en',
): string {
  const code = toLocale(locale)

  // Prefer vue-i18n so fallbackLocale applies when a key is missing in the active catalog.
  try {
    // Locales beyond `en` are registered dynamically; vue-i18n's typed Locales stay on `en`.
    const translated = Object.keys(params).length > 0
      ? i18n.global.t(key, params, {locale: code as 'en'})
      : i18n.global.t(key, code as 'en')
    if (typeof translated === 'string' && translated !== key) {
      return translated
    }
  } catch {
    // Fall through to manual lookup.
  }

  let text = resolvePlainMessage(code, key)
    ?? resolvePlainMessage('en', key)
    ?? key

  for (const [name, value] of Object.entries(params)) {
    text = text.replace(new RegExp(`\\{${name}\\}`, 'g'), String(value))
  }

  return text
}

export default translate
