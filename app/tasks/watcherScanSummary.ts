import type { WatcherFolderReport } from '../types/websockets'

export interface WatcherScanFolderSummary {
  name?: string
  path: string
  newCount: number
  lostCount: number
}

export interface WatcherScanSummary {
  folderCount: number
  newCount: number
  lostCount: number
  folders: WatcherScanFolderSummary[]
}

function folderDisplayName(folder: WatcherFolderReport['folder']): string | undefined {
  const name = (folder as {name?: string}).name
  if (typeof name === 'string' && name.trim()) {
    return name.trim()
  }

  return undefined
}

export function buildWatcherScanSummary(reports: WatcherFolderReport[]): WatcherScanSummary {
  const folders: WatcherScanFolderSummary[] = reports.map((report) => {
    let newCount = 0
    let lostCount = 0

    for (const group of report.files) {
      newCount += group.new.length
      lostCount += group.lost.length
    }

    return {
      name: folderDisplayName(report.folder),
      path: report.folder.path,
      newCount,
      lostCount,
    }
  })

  return {
    folderCount: folders.length,
    newCount: folders.reduce((total, folder) => total + folder.newCount, 0),
    lostCount: folders.reduce((total, folder) => total + folder.lostCount, 0),
    folders,
  }
}
