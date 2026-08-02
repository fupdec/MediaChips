import type { ApiDb } from '../types/db'
import type { ApiRequest, ApiResponse } from '../types/http'
import createTaskControllerShared from './tasks/taskControllerShared'
import createTasksFileController from './tasks/TasksFile.controller'
import createTasksMediaController from './tasks/TasksMedia.controller'
import createTasksVideoPreviewController from './tasks/TasksVideoPreview.controller'
import createTasksDatabaseController from './tasks/TasksDatabase.controller'
import createTasksTaggingController from './tasks/TasksTagging.controller'
import createTasksFacesController from './tasks/TasksFaces.controller'
import createTasksMaintenanceController from './tasks/TasksMaintenance.controller'
import createTasksLocalAiController from './tasks/TasksLocalAi.controller'

export default function createTaskController(db: ApiDb) {
  const shared = createTaskControllerShared(db)

  const importSavedFilters = (_req: ApiRequest, _res: ApiResponse) => {
    // res.status(201).send(_saved_filters.savedFilters)
  }

  return {
    importSavedFilters,
    ...createTasksFileController(shared),
    ...createTasksMediaController(shared),
    ...createTasksVideoPreviewController(shared),
    ...createTasksDatabaseController(shared),
    ...createTasksTaggingController(shared),
    ...createTasksFacesController(shared),
    ...createTasksMaintenanceController(shared),
    ...createTasksLocalAiController(shared),
  }
}
