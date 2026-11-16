export type HistoryEntity = 'media' | 'tag' | 'mark'

export interface HistoryOperation {
  id: string
  source: string
  occurredAt: string
  fields: number
  items: number
  remaining: number
}

export interface HistoryField {
  id: number
  entityType: HistoryEntity
  entityId: number
  entityName: string
  field: string
  fieldLabel: string
  before: unknown
  after: unknown
  restoredAt: string | null
}

export interface HistoryPage<T> {
  items: T[]
  hasMore: boolean
}
