import type { ApiDb } from '../../api/types/db'
import type { Express } from 'express'
import { apiErrorMessage, apiErrorStack } from '../../api/types/errors'
import type { ApiRouteRegistrar } from '../../api/routes/types'
import registerPinnedMeta from '../../api/routes/PinnedMeta.routes'
import registerHome from '../../api/routes/Home.routes'
import registerFilterRow from '../../api/routes/FilterRow.routes'
import registerFilterRowsInSavedFilter from '../../api/routes/FilterRowsInSavedFilter.routes'
import registerTag from '../../api/routes/Tag.routes'
import registerTagsInFilterRow from '../../api/routes/TagsInFilterRow.routes'
import registerTagsInTag from '../../api/routes/TagsInTag.routes'
import registerTagsInMedia from '../../api/routes/TagsInMedia.routes'
import registerMark from '../../api/routes/Mark.routes'
import registerMedia from '../../api/routes/Media.routes'
import registerPlaylist from '../../api/routes/Playlist.routes'
import registerMediaInPlaylists from '../../api/routes/MediaInPlaylists.routes'
import registerMediaType from '../../api/routes/MediaType.routes'
import registerMeta from '../../api/routes/Meta.routes'
import registerMetaInMediaType from '../../api/routes/MetaInMediaType.routes'
import registerMediaTypesInWatchedFolders from '../../api/routes/MediaTypesInWatchedFolders.routes'
import registerMetaSetting from '../../api/routes/MetaSetting.routes'
import registerPageSetting from '../../api/routes/PageSetting.routes'
import registerSavedFilter from '../../api/routes/SavedFilter.routes'
import registerSetting from '../../api/routes/Setting.routes'
import registerPlugin from '../../api/routes/Plugin.routes'
import registerTab from '../../api/routes/Tab.routes'
import registerTask from '../../api/routes/Task.routes'
import registerBulkMeta from '../../api/routes/BulkMeta.routes'
import registerTasksBackups from '../../api/routes/tasks/TasksBackups.routes'
import registerValuesInTag from '../../api/routes/ValuesInTag.routes'
import registerValuesInMedia from '../../api/routes/ValuesInMedia.routes'
import registerVideoMetadata from '../../api/routes/VideoMetadata.routes'
import registerWatchedFolder from '../../api/routes/WatchedFolder.routes'
import { isSfwBuild } from '../../shared/buildFlags'

function buildRouteRegistrars(): Array<{ routeFile: string; register: ApiRouteRegistrar }> {
  const registrars: Array<{ routeFile: string; register: ApiRouteRegistrar }> = [
    { routeFile: 'PinnedMeta.routes', register: registerPinnedMeta },
    { routeFile: 'Home.routes', register: registerHome },
    { routeFile: 'FilterRow.routes', register: registerFilterRow },
    { routeFile: 'FilterRowsInSavedFilter.routes', register: registerFilterRowsInSavedFilter },
    { routeFile: 'Tag.routes', register: registerTag },
    { routeFile: 'TagsInFilterRow.routes', register: registerTagsInFilterRow },
    { routeFile: 'TagsInTag.routes', register: registerTagsInTag },
    { routeFile: 'TagsInMedia.routes', register: registerTagsInMedia },
    { routeFile: 'Mark.routes', register: registerMark },
    { routeFile: 'Media.routes', register: registerMedia },
    { routeFile: 'Playlist.routes', register: registerPlaylist },
    { routeFile: 'MediaInPlaylists.routes', register: registerMediaInPlaylists },
    { routeFile: 'MediaType.routes', register: registerMediaType },
    { routeFile: 'Meta.routes', register: registerMeta },
    { routeFile: 'MetaInMediaType.routes', register: registerMetaInMediaType },
    { routeFile: 'MediaTypesInWatchedFolders.routes', register: registerMediaTypesInWatchedFolders },
    { routeFile: 'MetaSetting.routes', register: registerMetaSetting },
    { routeFile: 'PageSetting.routes', register: registerPageSetting },
    { routeFile: 'SavedFilter.routes', register: registerSavedFilter },
  ]

  if (!isSfwBuild()) {
    // Lazy require keeps ThePornDB / adult plugin modules out of SFW process graphs.
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const registerScraper = require('../../api/routes/Scraper.routes').default as ApiRouteRegistrar
      registrars.push({ routeFile: 'Scraper.routes', register: registerScraper })
    } catch (err: unknown) {
      console.warn(
        '[routes] Scraper routes unavailable (adult plugin missing?):',
        err instanceof Error ? err.message : String(err),
      )
    }
  }

  registrars.push(
    { routeFile: 'Setting.routes', register: registerSetting },
    { routeFile: 'Plugin.routes', register: registerPlugin },
    { routeFile: 'Tab.routes', register: registerTab },
    { routeFile: 'Task.routes', register: registerTask },
    { routeFile: 'BulkMeta.routes', register: registerBulkMeta },
    { routeFile: 'tasks/TasksBackups.routes', register: registerTasksBackups },
    { routeFile: 'ValuesInTag.routes', register: registerValuesInTag },
    { routeFile: 'ValuesInMedia.routes', register: registerValuesInMedia },
    { routeFile: 'VideoMetadata.routes', register: registerVideoMetadata },
    { routeFile: 'WatchedFolder.routes', register: registerWatchedFolder },
  )

  return registrars
}

const ROUTE_REGISTRARS = buildRouteRegistrars()

export const ROUTE_FILES = ROUTE_REGISTRARS.map(({ routeFile }) => routeFile)

export function registerApiRoutes(app: Express, db: ApiDb) {
  const routeLoadErrors: Array<{ routeFile: string; message: string }> = []

  for (const { routeFile, register } of ROUTE_REGISTRARS) {
    try {
      register(app, db)
    } catch (err: unknown) {
      routeLoadErrors.push({
        routeFile,
        message: err instanceof Error ? apiErrorMessage(err) : String(err),
      })
      console.error(
        '\x1b[31m%s\x1b[0m',
        `Failed to register route ${routeFile}:`,
        err instanceof Error ? (apiErrorStack(err) || apiErrorMessage(err)) : String(err),
      )
    }
  }

  return routeLoadErrors
}

export default registerApiRoutes

