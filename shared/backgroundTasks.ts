/** Work the server does on its own (no UI action started it), reported to the Tasks panel. */
export type BackgroundTaskKind =
  | 'remoteFingerprint'
  | 'cloudMetadata'
  | 'nasAssets'
  | 'sourceCatalog'
  | 'offlineCopy'
  | 'copyDiscovery'

export interface BackgroundTaskSnapshot {
  /** Stable while the task is running: the kind for worker runs, `kind:jobId` for jobs. */
  id: string
  kind: BackgroundTaskKind
  processed: number
  /** Null when the amount of work is not known up front. */
  total: number | null
  unit: 'items' | 'bytes'
  /** How long this run has been going, per the server clock. */
  runningMs: number
}

export interface BackgroundTasksResponse {
  tasks: BackgroundTaskSnapshot[]
}

/** The client shows a task only after it has run this long, so quick on-demand work stays invisible. */
export const BACKGROUND_TASK_MIN_VISIBLE_MS = 2000
