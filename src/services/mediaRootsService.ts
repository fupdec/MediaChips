import axios from 'axios'
import {API_ROUTES} from '@shared/api/routes'

export type MediaRootEntry = {
  path: string
  name: string
  children: Array<{ path: string; name: string }>
}

export async function fetchMediaRoots(baseUrl = ''): Promise<MediaRootEntry[]> {
  const url = `${baseUrl.replace(/\/$/, '')}${API_ROUTES.mediaRoots}`
  const {data} = await axios.get<{roots?: MediaRootEntry[]}>(url, {timeout: 5000})
  return Array.isArray(data?.roots) ? data.roots : []
}
