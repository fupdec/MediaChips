import {reactive} from 'vue'
import {typedApi} from '@/services/typedApi'

export type WatchFolderRiskGrade = 'green' | 'yellow' | 'red'

export type WatchFolderRiskAssessment = {
  path: string
  fileCount: number
  dirCount: number
  limit: number
  ratio: number
  grade: WatchFolderRiskGrade
  usePolling: boolean
  diskKind: 'ssd' | 'hdd' | 'unknown'
  hddFactorApplied: boolean
  failedOpen: boolean
  error?: string
}

export type WatchFolderRiskGateResult =
  | {action: 'proceed'; excludedPaths: string[]}
  | {action: 'skip'}

type GateState = {
  open: boolean
  loading: boolean
  assessment: WatchFolderRiskAssessment | null
  excludedPaths: string[]
  folderPath: string
}

const state = reactive<GateState>({
  open: false,
  loading: false,
  assessment: null,
  excludedPaths: [],
  folderPath: '',
})

let resolveGate: ((result: WatchFolderRiskGateResult) => void) | null = null

export function useWatchFolderRiskGateState() {
  return state
}

function closeGate(result: WatchFolderRiskGateResult) {
  state.open = false
  state.loading = false
  const resolve = resolveGate
  resolveGate = null
  resolve?.(result)
}

export function resolveWatchFolderRiskGate(result: WatchFolderRiskGateResult) {
  closeGate(result)
}

/**
 * Assess folder risk. Green (or fail-open) → proceed silently.
 * Yellow/red → show dialog; caller awaits user choice.
 */
export async function runWatchFolderRiskGate(options: {
  path: string
  excludedPaths?: string[]
}): Promise<WatchFolderRiskGateResult> {
  const folderPath = String(options.path || '').trim()
  const excludedPaths = [...(options.excludedPaths || [])]

  if (!folderPath) {
    return {action: 'proceed', excludedPaths}
  }

  let assessment: WatchFolderRiskAssessment
  try {
    const res = await typedApi.assessWatchedFolder({
      path: folderPath,
      excludedPaths,
    })
    assessment = res.data as WatchFolderRiskAssessment
  } catch (error) {
    console.warn('Watch folder risk assess failed (fail-open):', error)
    return {action: 'proceed', excludedPaths}
  }

  if (assessment.failedOpen || assessment.grade === 'green') {
    return {action: 'proceed', excludedPaths}
  }

  return new Promise<WatchFolderRiskGateResult>((resolve) => {
    resolveGate = resolve
    state.folderPath = folderPath
    state.excludedPaths = excludedPaths
    state.assessment = assessment
    state.loading = false
    state.open = true
  })
}

/** Re-assess after excludes change inside the dialog. */
export async function refreshWatchFolderRiskAssessment(): Promise<void> {
  if (!state.folderPath) return
  state.loading = true
  try {
    const res = await typedApi.assessWatchedFolder({
      path: state.folderPath,
      excludedPaths: state.excludedPaths,
    })
    state.assessment = res.data as WatchFolderRiskAssessment
  } catch (error) {
    console.warn('Watch folder risk re-assess failed:', error)
  } finally {
    state.loading = false
  }
}

export function setWatchFolderRiskExcludes(paths: string[]) {
  state.excludedPaths = [...paths]
}
