import { useAppStore } from '@/stores/app'
import { useDialogsStore } from '@/stores/dialogs'
import { useOperationsStore } from '@/stores/operations'
import {
  getChangelogEntriesSince,
  getChangelogEntry,
  isVersionNewerThan,
} from '@/services/changelog'
import {
  getLastSeenVersion,
  persistLastSeenVersion,
} from '@/services/updatePreferences'
import { normalizeVersion } from '@/utils/changelogParser'
import { markdownChangelogToHtml } from '@/utils/changelogMarkdown'

export function openChangelogDialog(options: {
  version: string
  markdown?: string
  title?: string
}): void {
  const entry = getChangelogEntry(options.version)
  const dialogsStore = useDialogsStore()

  dialogsStore.changelog = {
    show: true,
    title: options.title || '',
    entries: [{
      id: normalizeVersion(options.version),
      version: entry?.version || (options.version.startsWith('v') ? options.version : `v${options.version}`),
      name: entry?.name || '',
      date: entry?.date || '',
      content: entry?.content || markdownChangelogToHtml(options.markdown || ''),
    }],
    markSeenOnClose: false,
    seenVersion: '',
  }
}

export function openChangelogEntriesDialog(entries: Array<{
  id: string
  version: string
  name: string
  date?: string
  content: string
}>, title = ''): void {
  const dialogsStore = useDialogsStore()
  dialogsStore.changelog = {
    show: true,
    title,
    entries,
    markSeenOnClose: false,
    seenVersion: '',
  }
}

export async function openWhatsNewIfNeeded(isPlayerWindow: boolean): Promise<void> {
  if (isPlayerWindow) {
    return
  }

  const appStore = useAppStore()
  const operationsStore = useOperationsStore()
  const dialogsStore = useDialogsStore()

  if (appStore.isLocked) {
    return
  }

  if (operationsStore.migrationLowDb.dialog) {
    return
  }

  if (dialogsStore.onboarding.show) {
    return
  }

  const currentVersion = normalizeVersion(appStore.appVersion)
  if (!currentVersion) {
    return
  }

  const lastSeenVersion = getLastSeenVersion()

  if (!lastSeenVersion) {
    await persistLastSeenVersion(currentVersion)
    return
  }

  if (!isVersionNewerThan(currentVersion, lastSeenVersion)) {
    return
  }

  const entries = getChangelogEntriesSince(lastSeenVersion, currentVersion)
  if (entries.length === 0) {
    await persistLastSeenVersion(currentVersion)
    return
  }

  dialogsStore.changelog = {
    show: true,
    title: 'whats_new',
    entries,
    markSeenOnClose: true,
    seenVersion: currentVersion,
  }
}

export async function closeChangelogDialog(): Promise<void> {
  const dialogsStore = useDialogsStore()
  const { markSeenOnClose, seenVersion } = dialogsStore.changelog

  dialogsStore.changelog = {
    show: false,
    title: '',
    entries: [],
    markSeenOnClose: false,
    seenVersion: '',
  }

  if (markSeenOnClose && seenVersion) {
    await persistLastSeenVersion(seenVersion)
  }
}
