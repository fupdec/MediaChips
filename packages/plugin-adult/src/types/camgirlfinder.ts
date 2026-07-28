import type {ScraperSelectedResult} from './scraper'
import type {
  CamGirlFinderMappedAccount as ServerMappedAccount,
  CamGirlFinderMappedPerformer as ServerMappedPerformer,
} from '../server/camgirlfinderTypes'

export type CamGirlFinderMappedAccount = ServerMappedAccount

export interface CamGirlFinderMappedPerformer extends ScraperSelectedResult, ServerMappedPerformer {}
