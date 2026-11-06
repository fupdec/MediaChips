import type {BackupEntry} from '@/types/settings'

const fileNames = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'})

export function backupFileName(backup: BackupEntry): string {
  return backup.name || backup.path?.split(/[\\/]/).pop() || backup.date
}

export function compareBackupFileNames(a: BackupEntry, b: BackupEntry): number {
  const left = backupFileName(a)
  const right = backupFileName(b)
  return fileNames.compare(left, right) || left.localeCompare(right)
}
