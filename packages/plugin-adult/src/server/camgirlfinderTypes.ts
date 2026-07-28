export interface CamGirlFinderMappedAccount {
  platform: string
  platformLabel: string
  model: string
  distance?: number
  probability?: string
  profileUrl?: string
  externalProfileUrl?: string
}

export interface CamGirlFinderMappedPerformer {
  id: string
  name?: string | null
  face?: string
  fullImage?: string
  aliases?: string[]
  bio?: string | null
  extras?: Record<string, unknown>
  posters?: Array<{id: string | number; url: string; size: number}>
  platform?: string
  platformLabel?: string
  distance?: number
  probability?: string
  source: 'face' | 'name'
  accounts: CamGirlFinderMappedAccount[]
}
