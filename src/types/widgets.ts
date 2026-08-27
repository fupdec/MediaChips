import type { MediaItem, Meta, Tag } from '@/types/stores'
import type { HomeWidgetId, HomeWidgetWithLimit } from '@/utils/homeWidgets'

export type {
  HomeMarkersResponse,
  HomeMediaStatsResponse,
  HomeTagCountResponse,
} from '@shared/entities/widgets'

export type {
  ExtendedStatsUi as ExtendedStats,
  ExtendedStatsByTypeUi as ExtendedStatsByType,
  ExtendedStatsFileUi as ExtendedStatsFile,
  HomeHealthDataUi as HomeHealthData,
} from '@shared/entities/widgets-ui'

export {
  emptyExtendedStatsUi,
  emptyHomeHealthUi,
  toExtendedStatsUi,
  toHomeHealthUi,
} from '@shared/entities/widgets-ui'

export interface HomeWidgetEditorItem {
  id: HomeWidgetId
  title: string
  icon: string
  enabled: boolean
  hasLimit: boolean
  limit?: number
}

export type HomeMediaCardVariant = 'continue' | 'favorite' | 'views' | 'inbox'

export interface HomeMediaSimilarity {
  score?: number
  signals?: {
    clip?: number
    tags?: number
  }
  tileIndex?: number
}

export interface HomeMediaItem extends MediaItem {
  thumb?: string
  rating?: number
  viewedAt?: string | number
  createdAt?: string | number
  isSeed?: boolean
  similarity?: HomeMediaSimilarity
}

export type HealthAlertType = 'error' | 'info' | 'success' | 'warning'

export interface HealthAlertItem {
  id: string
  type: HealthAlertType
  icon: string
  text: string
  actionLabel?: string
  action?: () => void
}

export interface TopTagItem extends Tag {
  image?: string
  views?: number
}

export interface TopTagsCategory {
  meta: Meta
  tags: TopTagItem[]
  limit: number
  total: number
  isNotAllLoaded: boolean
}

export type HomeWidgetLimits = Partial<Record<HomeWidgetWithLimit, number>>
