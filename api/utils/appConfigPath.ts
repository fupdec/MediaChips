import path from 'path'
import {projectPath} from '../../shared/projectRoot'

function getAppConfigPath(): string {
  if (process.versions.electron && process.app_folder) {
    return path.join(process.app_folder, 'config.json')
  }

  return projectPath('public', 'config.json')
}

export { getAppConfigPath }
