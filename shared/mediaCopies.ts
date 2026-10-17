import type {SourceAvailability} from './mediaSources'

export type MediaCopy = {
  id: string
  path: string
  provider: 'local' | 'nas' | 'gdrive'
  availability: SourceAvailability
  verifiedAt: string | null
  verified: boolean
}
export type MediaCopies = {copies: MediaCopy[]; preferredId: string | null}
