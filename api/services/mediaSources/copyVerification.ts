import type {ApiDb} from '../../types/db'
import {createSettingsRepository} from '../../db/repositories/settings'
import {COPY_SHA256_SETTING, type CopyVerificationMethod} from '../../../shared/copyVerification'

export function copyVerificationMethod(db: ApiDb): CopyVerificationMethod {
  return createSettingsRepository(db.drizzle).findByOption(COPY_SHA256_SETTING)?.value === '1' ? 'sha256' : 'oshash'
}
