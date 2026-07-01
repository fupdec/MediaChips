import type { TaskControllerShared } from '../../types/tasks'
import { apiErrorMessage } from '../../types/errors'
import type { ApiRequest, ApiResponse } from '../../types/http'
import type { DatabaseSizesResponse } from '@shared/api/responses'
import fs from 'fs'
import path from 'path'
import { rimraf } from 'rimraf'
import { readdir, stat } from 'fs/promises'
import { machineId } from 'node-machine-id'
import { getAppConfigPath } from '../../utils/appConfigPath'
import { loadConfigFile, createDefaultConfig } from '../../../app/server/configFile'

export default function createTasksDatabaseController(shared: TaskControllerShared) {
  const {db, resolveGeneratedFolderPath} = shared

  const rmrf = (folder: string) => rimraf(folder)

  const deleteDb = async function (req: ApiRequest, res: ApiResponse) {
    const dbDir = path.join(db.path_databases ?? '', String(req.body.id))
    try {
      await rmrf(dbDir)
      res.status(201).send('successfully deleted')
    } catch (err) {
      res.status(400).send(err)
    }
  }

  const getDirectorySize = async (directory: string): Promise<number> => {
    if (!fs.existsSync(directory)) return 0

    const entries = await readdir(directory, {withFileTypes: true})
    const sizes = await Promise.all(entries.map(async (entry: import("fs").Dirent) => {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) return getDirectorySize(entryPath)
      if (entry.isFile()) {
        const {size} = await stat(entryPath)
        return size
      }
      return 0
    }))

    return sizes.reduce((sum: number, size: number) => sum + size, 0)
  }

  const getDatabaseSizes = async function (req: ApiRequest, res: ApiResponse) {
    const ids = req.body.ids as Array<string | number>

    try {
      const sizes: DatabaseSizesResponse['sizes'] = {}
      await Promise.all(ids.map(async (id) => {
        const dbDir = path.join(db.path_databases ?? '', String(id))
        sizes![id] = await getDirectorySize(dbDir)
      }))
      const payload: DatabaseSizesResponse = { sizes }
      res.status(201).send(payload)
    } catch (err) {
      res.status(400).send({message: apiErrorMessage(err) || String(err)})
    }
  }

  const getFolderSize = async function (req: ApiRequest, res: ApiResponse) {
    const dirPath = resolveGeneratedFolderPath(req.body.folder)
    if (!dirPath) {
      res.status(400).send({message: 'Unknown folder type'})
      return
    }

    const dirSize = async (directory: string) => {
      if (!fs.existsSync(directory)) return 0

      const files = await readdir(directory)
      const stats = files.map((file) => stat(path.join(directory, String(file))))

      return (await Promise.all(stats)).reduce((accumulator, {size}) => accumulator + size, 0)
    }

    const size = await dirSize(dirPath)
    res.status(201).send({size})
  }

  const clearData = async function (req: ApiRequest, res: ApiResponse) {
    const delPath = resolveGeneratedFolderPath(String(req.body.imageType ?? ''))

    if (!delPath) {
      res.status(400).send({message: 'Unknown folder type'})
      return
    }

    try {
      await rmrf(delPath)
      if (!fs.existsSync(delPath)) fs.mkdirSync(delPath, {recursive: true})
      res.sendStatus(201)
    } catch (err) {
      res.status(400).send(err)
    }
  }

  const getConfig = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const configPath = getAppConfigPath()
      const result = loadConfigFile(configPath)
      const config_json = result.config || createDefaultConfig()
      res.status(200).json(config_json)
    } catch (error) {
      res.status(500).json({message: apiErrorMessage(error) || 'Failed to read config'})
    }
  }

  const getMachineId = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const id = await machineId()
      res.status(200).send(id)
    } catch (error) {
      console.error('getMachineId failed:', error)
      res.status(500).send({message: 'Failed to get machine id'})
    }
  }

  return {
    deleteDb,
    getDatabaseSizes,
    getFolderSize,
    clearData,
    getConfig,
    getMachineId,
  }
}
