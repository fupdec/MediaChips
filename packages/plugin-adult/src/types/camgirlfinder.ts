import type {ScraperSelectedResult, ScraperPoster} from './scraper'
import type {
  CamGirlFinderMappedAccount as ServerMappedAccount,
  CamGirlFinderMappedPerformer as ServerMappedPerformer,
} from '../server/camgirlfinderTypes'

export type CamGirlFinderMappedAccount = ServerMappedAccount

export interface CamGirlFinderMappedPerformer
  extends Omit<ServerMappedPerformer, 'posters'>,
    Omit<ScraperSelectedResult, 'posters'> {
  posters?: ScraperPoster[]
}
