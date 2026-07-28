import type {CamGirlFinderMappedPerformer} from './camgirlfinderTypes'
import {
  platformLabel,
  type CamGirlFinderAccount,
  type CamGirlFinderGender,
  type CamGirlFinderJob,
  type CamGirlFinderPrediction,
} from './camgirlfinderApi'

export type {CamGirlFinderMappedPerformer} from './camgirlfinderTypes'

type ScraperPoster = {id: string | number; url: string; size: number}

const GENDER_MAP: Record<string, string> = {
  f: 'Female',
  m: 'Male',
  t: 'Transgender Female',
}

function normalizeName(value: unknown): string {
  return String(value || '').trim()
}

function mapGender(value: unknown): string | undefined {
  const key = String(value || '').trim().toLowerCase()
  return GENDER_MAP[key]
}

function uniqueNames(names: string[], primary?: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const primaryKey = primary ? primary.toLowerCase() : ''

  for (const name of names) {
    const trimmed = normalizeName(name)
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (primaryKey && key === primaryKey) continue
    if (seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
  }

  return out
}

function posterFromUrl(url: unknown, id: string | number): ScraperPoster | null {
  const href = String(url || '').trim()
  if (!href) return null
  return {id, url: href, size: 0}
}

function buildBio(lines: string[]): string {
  const filtered = lines.map((line) => line.trim()).filter(Boolean)
  if (!filtered.length) return ''
  return ['CamGirlFinder', ...filtered].join('\n')
}

function accountKey(platform: string, model: string): string {
  return `${String(platform || '').trim().toLowerCase()}::${String(model || '').trim().toLowerCase()}`
}

export function mapCamGirlFinderGender(value: unknown): string | undefined {
  return mapGender(value as CamGirlFinderGender | string)
}

export function mapFaceSearchJobToPerformers(
  job: CamGirlFinderJob,
  {limit = 24}: {limit?: number} = {},
): CamGirlFinderMappedPerformer[] {
  const predictions = Array.isArray(job.predictions) ? job.predictions : []
  const max = Math.min(Math.max(limit, 1), 50)

  return predictions.slice(0, max).map((prediction, index) => {
    const name = normalizeName(prediction.model) || `match-${index + 1}`
    const platform = normalizeName(prediction.platform)
    const aliases = uniqueNames(
      predictions.map((item) => item.model),
      name,
    )
    const gender = mapGender(prediction.gender)
    const face = prediction.urls?.faceImage || prediction.urls?.fullImage || job.urls?.faceImage
    const fullImage = prediction.urls?.fullImage || prediction.urls?.faceImage || job.urls?.fullImage
    const posters = [
      posterFromUrl(prediction.urls?.faceImage, `${prediction.platform}-${prediction.model}-face`),
      posterFromUrl(prediction.urls?.fullImage, `${prediction.platform}-${prediction.model}-full`),
      posterFromUrl(job.urls?.faceImage, `${job.id}-query-face`),
    ].filter(Boolean) as ScraperPoster[]

    const related = predictions
      .filter((item) => item.probability === 'high' || item === prediction)
      .slice(0, 12)

    const bio = buildBio([
      `${platformLabel(platform)} / ${name} · ${prediction.probability} (distance ${Number(prediction.distance).toFixed(3)})`,
      prediction.urls?.externalProfile || prediction.urls?.profile || '',
      ...related
        .filter((item) => accountKey(item.platform, item.model) !== accountKey(platform, name))
        .slice(0, 8)
        .map((item) => {
          const link = item.urls?.externalProfile || item.urls?.profile || ''
          return `${platformLabel(item.platform)}: ${item.model}${link ? ` · ${link}` : ''}`
        }),
    ])

    return {
      id: `${platform}:${name}:${index}`,
      name,
      face,
      fullImage,
      aliases,
      bio,
      extras: gender ? {gender} : {},
      posters,
      platform,
      platformLabel: platformLabel(platform),
      distance: prediction.distance,
      probability: String(prediction.probability || ''),
      source: 'face',
      accounts: related.map((item) => ({
        platform: item.platform,
        platformLabel: platformLabel(item.platform),
        model: item.model,
        distance: item.distance,
        probability: String(item.probability || ''),
        profileUrl: item.urls?.profile,
        externalProfileUrl: item.urls?.externalProfile,
      })),
    }
  })
}

export function mapNameSearchAccountsToPerformers(
  accounts: CamGirlFinderAccount[],
  {
    similarByAccount = {},
    limit = 24,
  }: {
    similarByAccount?: Record<string, CamGirlFinderPrediction[]>
    limit?: number
  } = {},
): CamGirlFinderMappedPerformer[] {
  const max = Math.min(Math.max(limit, 1), 50)

  return accounts.slice(0, max).map((account, index) => {
    const name = normalizeName(account.name) || `account-${index + 1}`
    const platform = normalizeName(account.platform)
    const key = accountKey(platform, name)
    const similar = similarByAccount[key] || []
    const gender = mapGender(account.gender)

    const aliases = uniqueNames([
      ...similar.map((item) => item.model),
      ...accounts.map((item) => item.name),
    ], name)

    const personFace = account.persons?.[0]?.urls?.faceImage
      || account.persons?.[0]?.urls?.fullImage
      || similar[0]?.urls?.faceImage
    const personFull = account.persons?.[0]?.urls?.fullImage
      || account.persons?.[0]?.urls?.faceImage
      || similar[0]?.urls?.fullImage

    const posters = [
      posterFromUrl(personFace, `${platform}-${name}-face`),
      posterFromUrl(personFull, `${platform}-${name}-full`),
      ...((account.persons || []).slice(0, 3).flatMap((person, personIndex) => ([
        posterFromUrl(person.urls?.faceImage, `${platform}-${name}-p${personIndex}-face`),
        posterFromUrl(person.urls?.fullImage, `${platform}-${name}-p${personIndex}-full`),
      ]))),
    ].filter(Boolean) as ScraperPoster[]

    const bio = buildBio([
      `${platformLabel(platform)} / ${name}`,
      account.urls?.externalProfile || account.urls?.profile || '',
      account.firstSeen ? `First seen: ${account.firstSeen}` : '',
      account.lastSeen ? `Last seen: ${account.lastSeen}` : '',
      ...similar.slice(0, 8).map((item) => {
        const link = item.urls?.externalProfile || item.urls?.profile || ''
        return `${platformLabel(item.platform)}: ${item.model}${link ? ` · ${link}` : ''}`
      }),
    ])

    return {
      id: `${platform}:${name}`,
      name,
      face: personFace,
      fullImage: personFull,
      aliases,
      bio,
      extras: gender ? {gender} : {},
      posters,
      platform,
      platformLabel: platformLabel(platform),
      distance: account.distance,
      source: 'name',
      accounts: [
        {
          platform,
          platformLabel: platformLabel(platform),
          model: name,
          profileUrl: account.urls?.profile,
          externalProfileUrl: account.urls?.externalProfile,
        },
        ...similar.slice(0, 12).map((item) => ({
          platform: item.platform,
          platformLabel: platformLabel(item.platform),
          model: item.model,
          distance: item.distance,
          probability: String(item.probability || ''),
          profileUrl: item.urls?.profile,
          externalProfileUrl: item.urls?.externalProfile,
        })),
      ],
    }
  })
}

export function flattenSimilarPredictions(
  similar: Record<string, CamGirlFinderPrediction[]>,
): CamGirlFinderPrediction[] {
  const out: CamGirlFinderPrediction[] = []
  const seen = new Set<string>()

  for (const list of Object.values(similar || {})) {
    for (const item of list || []) {
      const key = accountKey(item.platform, item.model)
      if (seen.has(key)) continue
      seen.add(key)
      out.push(item)
    }
  }

  return out.sort((a, b) => Number(a.distance) - Number(b.distance))
}
