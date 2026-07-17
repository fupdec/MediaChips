interface TranslateHelpers {
  te?: (key: string) => boolean
  t?: (key: string) => string
}

const META_TYPE_ICONS: Record<string, string> = {
  array: 'mdi-tag-multiple-outline',
  string: 'mdi-text',
  number: 'mdi-numeric',
  boolean: 'mdi-checkbox-marked-outline',
  date: 'mdi-calendar-outline',
  rating: 'mdi-star-outline',
}

const META_TYPE_TEXT_FALLBACK: Record<string, string> = {
  array: 'Tag category',
  string: 'Text',
  number: 'Number',
  boolean: 'Checkbox',
  date: 'Date',
  rating: 'Rating',
}

export function getTextDataType(type: string, { te, t }: TranslateHelpers = {}) {
  const key = `meta.types.${type}`
  if (te?.(key)) {
    return t?.(key) || type
  }
  return META_TYPE_TEXT_FALLBACK[type] || type
}

export function getIconDataType(type: string) {
  return META_TYPE_ICONS[type]
}

export async function loadMetaTypes() {
  const module = await import('@/assets/MetaTypes')
  return module.default
}
