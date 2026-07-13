const META_NAME_KEYS: Record<string, string> = {
  color: 'color',
  rating: 'rating',
  favorite: 'favorite',
  bookmark: 'bookmark',
  country: 'country',
  file_name: 'file_name',
}

interface MetaLike {
  name?: string
}

type TranslateFn = (key: string, fallback?: string) => string

export const getMetaName = (meta: MetaLike | null | undefined, t: TranslateFn): string => {
  const fallback = meta?.name || ''
  const key = META_NAME_KEYS[fallback.toString().trim().toLowerCase()]

  return key ? t(`meta.default_names.${key}`, fallback) : fallback
}
