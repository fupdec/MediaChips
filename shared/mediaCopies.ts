import type {CopyVerificationMethod} from './copyVerification'
import type {SourceAvailability} from './mediaSources'

export type MediaCopy = {
  id: string
  path: string
  provider: 'local' | 'nas' | 'gdrive' | 'onedrive' | 'dropbox'
  availability: SourceAvailability
  verifiedAt: string | null
  verificationMethod?: CopyVerificationMethod
  verified: boolean
}
export type MediaCopies = {copies: MediaCopy[]; preferredId: string | null}
