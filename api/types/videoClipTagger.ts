export interface ClipPromptEntry {
  key: string
  prompt: string
}

export interface ClipFrame {
  framePath: string
  mediaId?: unknown
  mediaPath?: string
  timestamp?: string
}

export interface ClipClassificationRow {
  key: string
  score: number
  prompt?: string
  mediaId?: unknown
  mediaPath?: string
  timestamp?: string
}

export interface ClipTaggerOptions {
  locale?: string
  topK?: number
  minScore?: number
}
