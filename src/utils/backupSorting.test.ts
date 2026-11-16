import {expect, it} from 'vitest'
import {compareBackupFileNames} from './backupSorting'

it('sorts by the actual file name instead of the date field', () => {
  const entries = [
    {name: 'backup-10.zip', date: '2020-01-01'},
    {name: 'backup-2.zip', date: '2026-01-01'},
  ]
  expect([...entries].sort(compareBackupFileNames).map(entry => entry.name))
    .toEqual(['backup-2.zip', 'backup-10.zip'])
})

it('supports older responses containing only the file stem in date', () => {
  expect(compareBackupFileNames({date: '2026-11-05T20-00-00'}, {date: '2026-11-04T20-00-00'})).toBeGreaterThan(0)
})
