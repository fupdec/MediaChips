export interface AutoScrapeBatchOutcome<T> {
  results: T[]
  cancelled: boolean
  total: number
}
