import { i18n } from '@/i18n/loadLocale'

type Locale = 'en' | 'ru' | 'cn' | 'es'

export type { Locale }

const LOCALES: Locale[] = ['en', 'ru', 'cn', 'es']

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

export function translate(
  key: string,
  params: Record<string, string | number> = {},
  locale: Locale = 'en',
): string {
  const code = toLocale(locale)
  let text = getByPath(getMessages(code), key)
    ?? getByPath(getMessages('en'), key)
    ?? key

  for (const [name, value] of Object.entries(params)) {
    text = String(text).replace(new RegExp(`\\{${name}\\}`, 'g'), String(value))
  }

  return String(text)
}

export default translate
