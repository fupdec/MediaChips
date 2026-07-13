export interface SceneScraperImage {
  url?: string
  width?: number
  height?: number
}

export interface SceneScraperPerformer {
  id?: string
  name?: string
}

export interface SceneScraperPerformerAppearance {
  performer?: SceneScraperPerformer
}

export interface SceneScraperTag {
  id?: string
  name?: string
}

export interface SceneScraperStudio {
  id?: string
  name?: string
}

export interface SceneScraperScene {
  id: string
  title?: string
  date?: string | null
  release_date?: string | null
  duration?: number | null
  details?: string | null
  code?: string | null
  images?: SceneScraperImage[]
  studio?: SceneScraperStudio | null
  performers?: SceneScraperPerformerAppearance[]
  tags?: SceneScraperTag[]
}

export interface SceneScraperSearchResponse {
  data?: SceneScraperScene[]
  matchMethod?: 'oshash' | 'search'
  oshash?: string | null
}

export interface SceneScraperBatchItem {
  media: { id: number; name?: string | null }
  status?: 'pending' | 'searching' | 'applying' | 'done' | 'error' | 'not_found' | 'skipped'
  error?: string
  sceneTitle?: string | null
}

export interface SceneScraperMarker {
  title: string
  time: number
  end?: number | null
}

export interface SceneScraperMarkerEntry extends SceneScraperMarker {
  selected: boolean
  alreadyExists: boolean
  tagId?: number | null
  tagExists?: boolean
  willCreate?: boolean
  unresolved?: boolean
}

export interface SceneScraperMarkersResponse {
  data?: SceneScraperMarker[]
}

export interface SceneScraperMarkersApplyResult {
  imported: number
  skipped: number
  total: number
}
