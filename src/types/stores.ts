import type { MediaItem } from '@shared/entities/media'
import type { MediaType } from '@shared/entities/media'
export type {
  MediaItem,
  ItemTagRef,
  ItemValueRef,
  Tag,
  Meta,
  Tab,
  Playlist,
  AssignedMeta,
  SavedFilter,
} from '@shared/entities'

export interface AppHoverState {
  show: boolean
  tagId: number | null
  metaId: number | null
  data_type: string | null
  label: string | null
  imageAspectRatio: number | null
  timeout: ReturnType<typeof setTimeout> | number
  delay: number
  x: number
  y: number
  previewWidth: number
  previewHeight: number
}

export interface AppLogEntry {
  type?: string
  text?: string
  color?: string
  time: number
}

export interface AppState {
  is_app_ready: boolean
  isServerError?: boolean
  localhost: string
  appVersion: string
  app_title: string
  dbPath: string
  mediaPath: string
  databases: unknown[]
  isElectron: boolean | null
  isLocked: boolean
  hover: AppHoverState
  media: unknown[]
  mediaTypes: MediaType[]
  meta: import('@shared/entities/meta').Meta[]
  tags: import('@shared/entities/meta').Tag[]
  playlists: import('@shared/entities/playlist').Playlist[]
  tabs: import('@shared/entities/tab').Tab[]
  filters: {
    visible: boolean
    attached: boolean
  }
  syncDarkModeOs: {
    matchMedia: boolean
    func: (() => void) | null
  }
  config: Record<string, unknown>
  window: { focused: boolean }
  log: AppLogEntry[]
}

export interface ItemsEnvironment {
  media_type_id: number | null
  meta_id: number | null
  tag_id: number | null
  tab_id: number | null
}

export interface MarkItem {
  id: number
  [key: string]: unknown
}

export type { MarkFilterMeta } from '@shared/entities/meta'

export interface ContextMenuEntry {
  id?: string
  show?: boolean
  type?: string
  name?: string
  icon?: string
  color?: string
  disabled?: boolean
  action?: (...args: unknown[]) => unknown
  menu?: ContextMenuEntry[]
  [key: string]: unknown
}

export interface ContextMenuPayload {
  x?: number
  y?: number
  content?: ContextMenuEntry[]
  tagMeta?: unknown
}

export interface TaskItem {
  id: string
  title?: string
  subtitle?: string
  icon?: string
  click?: (() => void) | unknown
  action?: (() => void) | unknown
  progress?: number
  color?: string
  done?: boolean
  [key: string]: unknown
}

export interface PlayerPlaylistItem extends MediaItem {
  key: string
}

export interface LicenseInfo {
  license_code?: string
  license_created?: string
  license_expiry?: string
  license_type?: string
  client_email?: string
  client_name?: string
  fingerprint_1?: string
  fingerprint_2?: string
  fingerprint_3?: string
  [key: string]: unknown
}

export interface MoveErrorMessage {
  code?: string
  fileName?: string
  folder?: string
  required?: number
  available?: number
  id?: number
  [key: string]: unknown
}

export interface MoveWsMessage {
  type: string
  total?: number
  totalBytes?: number
  preFailed?: number
  estimatedSeconds?: number
  current?: number
  fileName?: string
  etaSeconds?: number
  overallProgress?: number
  moved?: number
  failed?: number
  elapsedSeconds?: number
  id?: number
  [key: string]: unknown
}
