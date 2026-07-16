import axios from 'axios'
import {API_ROUTES} from '@shared/api/routes'

export type BrowsePlace = {
  id: string
  path: string
  name: string
  icon: string
}

export type BrowsePlacesResponse = {
  places: BrowsePlace[]
  container: boolean
}

export async function fetchBrowsePlaces(baseUrl = ''): Promise<BrowsePlacesResponse> {
  const url = `${baseUrl.replace(/\/$/, '')}${API_ROUTES.browsePlaces}`
  const {data} = await axios.get<{places?: BrowsePlace[]; container?: boolean}>(url, {timeout: 5000})
  return {
    places: Array.isArray(data?.places) ? data.places : [],
    container: Boolean(data?.container),
  }
}
