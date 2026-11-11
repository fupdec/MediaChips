export interface MissingMediaSearchOptions {
  folders?: string[]
  originalFolder?: string
  shouldStop?: () => boolean
  onProgress?: (processed: number, total: number) => void
}
