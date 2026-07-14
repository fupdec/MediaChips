/** Gender filter values accepted by ThePornDB performer search / scene import. */
export const SCRAPER_PERFORMER_GENDER_ANY = ''

export const SCRAPER_PERFORMER_GENDER_OPTIONS = [
  {value: 'Female', i18nKey: 'female'},
  {value: 'Male', i18nKey: 'male'},
  {value: 'Transgender Female', i18nKey: 'transgender_female'},
  {value: 'Transgender Male', i18nKey: 'transgender_male'},
  {value: 'Intersex', i18nKey: 'intersex'},
  {value: 'Non-Binary', i18nKey: 'non_binary'},
] as const

export type ScraperPerformerGender =
  (typeof SCRAPER_PERFORMER_GENDER_OPTIONS)[number]['value']

const SUPPORTED_GENDERS = new Set<string>(
  SCRAPER_PERFORMER_GENDER_OPTIONS.map((option) => option.value),
)

const API_GENDER_ALIASES: Record<string, ScraperPerformerGender> = {
  FEMALE: 'Female',
  MALE: 'Male',
  TRANSGENDER_FEMALE: 'Transgender Female',
  TRANSGENDERFEMALE: 'Transgender Female',
  TRANSFEMALE: 'Transgender Female',
  TRANSGENDER_MALE: 'Transgender Male',
  TRANSGENDERMALE: 'Transgender Male',
  TRANSMALE: 'Transgender Male',
  INTERSEX: 'Intersex',
  NON_BINARY: 'Non-Binary',
  NONBINARY: 'Non-Binary',
}

export function normalizeScraperPerformerGender(value: unknown): string {
  const gender = String(value ?? '').trim()
  if (!gender) return SCRAPER_PERFORMER_GENDER_ANY
  if (SUPPORTED_GENDERS.has(gender)) return gender
  return SCRAPER_PERFORMER_GENDER_ANY
}

/** Maps TPDB / GraphQL gender values onto the app filter values. */
export function normalizeApiPerformerGender(value: unknown): string {
  const gender = String(value ?? '').trim()
  if (!gender) return SCRAPER_PERFORMER_GENDER_ANY
  if (SUPPORTED_GENDERS.has(gender)) return gender

  const alias = API_GENDER_ALIASES[gender.toUpperCase().replace(/[\s-]+/g, '_')]
  return alias || SCRAPER_PERFORMER_GENDER_ANY
}

/** Returns undefined when "any" is selected so the API omits the gender filter. */
export function resolveScraperPerformerGenderParam(value: unknown): string | undefined {
  const gender = normalizeScraperPerformerGender(value)
  return gender || undefined
}

/**
 * When a gender filter is set, keep only performers of that gender.
 * Unknown / missing genders are excluded so auto-import stays predictable.
 */
export function performerMatchesGenderFilter(
  apiGender: unknown,
  filterGender: unknown,
): boolean {
  const filter = normalizeScraperPerformerGender(filterGender)
  if (!filter) return true

  const gender = normalizeApiPerformerGender(apiGender)
  return Boolean(gender) && gender === filter
}
