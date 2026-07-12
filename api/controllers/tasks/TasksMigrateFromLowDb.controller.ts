import type { ApiDb, AnyRecord } from '../../types/db'
import type {
  LowDbImportObject,
  OldIdMapping,
} from '../../types/migration'
import type { ApiRequest, ApiResponse } from '../../types/http'
import { apiErrorMessage } from '../../types/errors'
import fs from 'fs'
import fse from 'fs-extra'
import path from 'path'
import { rimraf } from 'rimraf'
import StreamZip from 'node-stream-zip'
import archiver from 'archiver'
import { serializeCountries } from '../../utils/country'
import { resetDatabaseAndRunMigrations } from '../../db/migrationRunner'
import { importLowDbData } from '../../services/lowDbImport'

function asLegacyString(value: unknown): string {
  return String(value ?? '')
}

function asLegacyRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function readJsonFile<T = unknown>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
}

function asLegacyArray(value: unknown): AnyRecord[] {
  return Array.isArray(value) ? value as AnyRecord[] : []
}

export default function (db: ApiDb) {
  const getDbPath = () => db.path!
  const pathApp = process.app_folder
  let pathUserData;
  if (!pathApp) {
    pathUserData = path.join(__dirname, '../../../', 'userfiles')
  } else {
    pathUserData = path.join(pathApp, 'userfiles')
  }

  const rmrf = (folder: string) => rimraf(folder)

  // ДЛЯ ПОДДЕРЖКИ СТАРОЙ ВЕРСИИ ПРИЛОЖЕНИЯ (<= 0.11.3)
  const checkDataForMigrateFromLowDb = async (req: ApiRequest, res: ApiResponse) => {
    const pathSettings = path.join(pathUserData, 'dbs.json')
    const isSettingsExists = fs.existsSync(pathSettings)
    if (isSettingsExists) {
      res.sendStatus(201)
    } else {
      res.sendStatus(400)
    }
  }

  const cleanDataLowDb = async (req: ApiRequest, res: ApiResponse) => {
    try {
      await rmrf(pathUserData)
      console.log('\x1b[36m%s\x1b[0m', 'Old data was cleared successfully.', 'color: #bada55');
      res.status(201).send('deleted')
    } catch (err) {
      console.error(err)
      res.status(400).send({message: apiErrorMessage(err)})
    }
  }

  const createBackupLowDb = async (req: ApiRequest, res: ApiResponse) => {
    const currentdate = new Date(),
      date = currentdate.getDate(),
      month = currentdate.getMonth() + 1,
      hours = currentdate.getHours(),
      mins = currentdate.getMinutes(),
      secs = currentdate.getSeconds(),
      backupName = currentdate.getFullYear() + "." +
        (month > 9 ? month : '0' + month) + "." +
        (date > 9 ? date : '0' + date) + " " +
        (hours > 9 ? hours : '0' + hours) + "-" +
        (mins > 9 ? mins : '0' + mins) + "-" +
        (secs > 9 ? secs : '0' + secs),
      currentDB = path.join(pathUserData, "/databases/"),
      currentFiles = path.join(pathUserData, "/media/"),
      settings = path.join(pathUserData, "dbs.json");
    // console.log('found data from v0.11.3 or older')
    // console.log('backup creation started')
    const pathBackup = path.join(getDbPath(), "/backups/" + backupName + ".zip")
    const output = fs.createWriteStream(pathBackup);
    const archive = archiver('zip')
    console.log('Archive initialized.')
    output.on("close", async () => {
      console.log('\x1b[36m%s\x1b[0m', 'archive had created successfully.', 'color: #bada55');
      if (req.body.is_copy_backups) {
        const pathBackupsOld = path.join(pathUserData, 'backups')
        const pathBackupsNew = path.join(getDbPath(), 'backups')

        if (fs.existsSync(pathUserData)) {
          try {
            fse.copySync(pathBackupsOld, pathBackupsNew, {overwrite: false})
            console.log('\x1b[36m%s\x1b[0m', 'Backups copied successfully.', 'color: #bada55');
          } catch (err) {
            console.error(err)
            res.status(400).send({message: apiErrorMessage(err)})
          }
        }
      }

      await rmrf(pathUserData)

      res.status(201).send(backupName)
    });
    archive.on("error", (err: unknown) => {
      console.error(err);
      res.status(400).send({message: apiErrorMessage(err)})
    });
    archive.pipe(output);
    archive.directory(currentDB, "databases");
    archive.directory(currentFiles, "media");
    archive.file(settings, {name: "dbs.json"});
    await archive.finalize();
  }

  // importing old database from JSON
  const migrateFromLowDb = async function (backupPath: string) {
    const tempPath = path.join(getDbPath(), 'temp')
    if (fs.existsSync(tempPath)) {
      await rmrf(tempPath)
      fs.mkdirSync(tempPath)
    } else {
      fs.mkdirSync(tempPath)
    }

    const ext = path.extname(backupPath)
    if (!fs.existsSync(backupPath) || ext !== '.zip') {
      console.error('backup path does not exist')
      return "Invalid path or file does not exist"
    }

    const zip = new StreamZip.async({
      file: backupPath
    })

    await zip.extract(null, tempPath).catch((e: unknown) => {
      console.log(e)
      return e
    });
    await zip.close();
    console.log('\x1b[36m%s\x1b[0m', 'Archive with backup had extracted successfully.', 'color: #bada55');

    // очищаем папки с картинками новой БД
    const path_media_new = path.join(getDbPath(), 'media')
    const path_meta_new = path.join(getDbPath(), 'meta')
    await rmrf(path_media_new)
    await rmrf(path_meta_new)
    console.log('Current folders with media files had deleted.');

    // создаем заново все каталоги
    const createDefaultFoldersForDb = async () => {
      let userDirs: string[] = []
      const mediaPath = path.join(getDbPath(), 'media')
      const metaPath = path.join(getDbPath(), 'meta')
      const backupsPath = path.join(getDbPath(), 'backups')
      const videoPath = path.join(mediaPath, 'videos')
      const imagePath = path.join(mediaPath, 'images')
      const audioPath = path.join(mediaPath, 'audios')
      const textPath = path.join(mediaPath, 'texts')
      const videoDirs = ['thumbs', 'marks', 'grids'].map((dirName: string) => (
        path.join(videoPath, dirName)
      ))
      userDirs = [...userDirs, ...[getDbPath(), mediaPath, metaPath, backupsPath]]
      userDirs = [...userDirs, ...[videoPath, imagePath, audioPath, textPath]]
      userDirs = [...userDirs, ...videoDirs]

      for (const i of userDirs) {
        if (!fs.existsSync(i))
          try {
            fs.mkdirSync(i)
          } catch (err) {
            console.log(err)
          }
      }
    }

    await createDefaultFoldersForDb();
    console.log('\x1b[36m%s\x1b[0m', 'Default folders of current database recreated.', 'color: #bada55');

    // move thumbs and meta images
    const thumbsOld = path.join(tempPath, 'media/thumbs')
    const thumbsNew = path.join(getDbPath(), 'media/videos/thumbs')
    const metaOld = path.join(tempPath, 'media/meta')
    const metaNew = path.join(getDbPath(), 'meta')

    function moveDir(from: string, to: string) {
      return new Promise<string>(async (resolve, reject) => {
        if (fs.existsSync(from)) {
          // удаление необходимо, чтобы при перемещении каталога не было ошибки
          try {
            await rmrf(to)
            // перемещаем каталог
            fs.renameSync(from, to)
            resolve("Successfully moved directory.")
          } catch (err) {
            console.log(err)
            reject(err)
          }
        }
      })
    }

    await moveDir(thumbsOld, thumbsNew);
    console.log('\x1b[36m%s\x1b[0m', 'Thumbs of videos moved successfully.', 'color: #bada55');
    await moveDir(metaOld, metaNew);
    console.log('\x1b[36m%s\x1b[0m', 'Images of tags moved successfully.', 'color: #bada55');

    function createImportObject(): Promise<LowDbImportObject> {
      return new Promise((resolve) => {
        const Videos = readJsonFile(path.join(tempPath, 'databases', 'dbv.json')) as AnyRecord
        const Playlists = readJsonFile(path.join(tempPath, 'databases', 'dbpl.json')) as AnyRecord
        const Marks = readJsonFile(path.join(tempPath, 'databases', 'dbm.json')) as AnyRecord
        const Meta = readJsonFile(path.join(tempPath, 'databases', 'meta.json')) as AnyRecord
        const Settings = readJsonFile(path.join(tempPath, 'dbs.json')) as AnyRecord

        const obj: LowDbImportObject = {
          meta: [],
          tags: [],
          videos: [],
          videoMetadata: [],
          playlists: [],
          marks: [],
          onlyMeta: [],
          metaInTags: [],
          pinnedMeta: [],
          settings: Settings,
          watchedFolders: []
        }
        obj.videos = asLegacyArray(Videos.videos).map((i: AnyRecord) => {
          const pathStr = asLegacyString(i.path)
          const baseName = pathStr ? (pathStr.split('\\').pop()?.split('/').pop() ?? '') : ''
          return {
            oldId: i.id,
            path: i.path,
            basename: baseName,
            name: baseName.replace(/\.[^/.]+$/, ''),
            ext: pathStr ? `.${pathStr.split('.').pop()}` : '',
            filesize: i.size,
            rating: i.rating || 0,
            favorite: i.favorite || false,
            bookmark: i.bookmark || null,
            views: i.views || 0,
            mediaTypeId: 1,
            createdAt: (new Date(asLegacyString(i.date)).toISOString()).replace('T', ' ').replace('Z', ' +00:00'),
            updatedAt: (new Date(asLegacyString(i.edit)).toISOString()).replace('T', ' ').replace('Z', ' +00:00'),
          }
        })
        obj.videoMetadata = asLegacyArray(Videos.videos).map((i: AnyRecord) => {
          const resolution = asLegacyString(i.resolution)
          return {
            oldId: i.id,
            duration: i.duration || 0,
            width: +(resolution.match(/\d*/)?.[0] || 0),
            height: +(resolution.match(/x(.*)/)?.[1] || 0),
          }
        })
        obj.playlists = asLegacyArray(Playlists.playlists).map((i: AnyRecord) => ({
          oldId: i.id,
          name: i.name,
          favorite: i.favorite || false,
          videos: i.videos || [],
          createdAt: (new Date(asLegacyString(i.date)).toISOString()).replace('T', ' ').replace('Z', ' +00:00'),
          updatedAt: (new Date(asLegacyString(i.edit)).toISOString()).replace('T', ' ').replace('Z', ' +00:00'),
        }))
        obj.marks = asLegacyArray(Marks.markers).map((i: AnyRecord) => {
          const markType = asLegacyString(i.type).toLowerCase()
          const isFavoriteOrBookmark = ['favorite', 'bookmark'].includes(markType)
          return {
            time: i.time,
            videoId: i.videoId,
            text: isFavoriteOrBookmark ? i.name : null,
            type: isFavoriteOrBookmark ? markType : 'meta',
            oldTagId: isFavoriteOrBookmark ? null : i.name,
          }
        })
        // get meta
        for (const m of asLegacyArray(Meta.meta)) {
          const settings = asLegacyRecord(m.settings)
          if (m.type === 'specific') continue
          if (m.type === 'simple') {
            const sm = {
              oldId: m.id,
              type: m.dataType,
              name: settings.name,
              icon: settings.icon || 'shape',
              hint: settings.hint || null,
              createdAt: (new Date(asLegacyString(m.date)).toISOString()).replace('T', ' ').replace('Z', ' +00:00'),
              updatedAt: (new Date(asLegacyString(m.edit)).toISOString()).replace('T', ' ').replace('Z', ' +00:00'),
              metaSetting: {
                ...{
                  "oldId": m.id,
                  "hidden": true,
                  "parser": false,
                  "imageAspectRatio": 1,
                  "imageTypes": "main",
                  "chipLabel": false,
                  "chipOutlined": false,
                  "color": false,
                  "favorite": true,
                  "rating": false,
                  "synonyms": false,
                  "bookmark": false,
                  "country": false,
                  "career": false,
                  "scraper": false,
                  "nested": false,
                  "marks": false,
                },
                ...settings
              },
              pageSetting: m.dataType == "array" ? {
                page: 1
              } : null,
            }
            obj.meta.push(sm)
            if (m.dataType === 'array') {
              const tags = asLegacyArray(settings.items).map((i: AnyRecord) => ({
                oldId: i.id,
                name: i.name,
              }))
              obj.tags.push({
                [String(m.id)]: tags
              })
            }
          } else if (m.type === 'complex') {
            const cm: AnyRecord = {
              oldId: m.id,
              type: 'array',
              name: settings.name,
              icon: settings.icon || 'shape',
              hint: settings.hint || null,
              createdAt: (new Date(asLegacyString(m.date)).toISOString()).replace('T', ' ').replace('Z', ' +00:00'),
              updatedAt: (new Date(asLegacyString(m.edit)).toISOString()).replace('T', ' ').replace('Z', ' +00:00'),
            }
            const metaSettings = {...settings}
            if (metaSettings.metaInCard) {
              obj.pinnedMeta.push({
                metaId: m.id,
                pinnedMetaId: asLegacyArray(metaSettings.metaInCard).map((i: AnyRecord) => i.id),
                scraperField: asLegacyArray(metaSettings.metaInCard).map((i: AnyRecord) => i.scraperField),
              })
            }
            delete metaSettings.metaInCard
            metaSettings.oldId = m.id
            metaSettings.marks = metaSettings.markers
            cm.metaSetting = metaSettings
            cm.pageSetting = {
              page: 1
            }
            obj.meta.push(cm)
            const cards = asLegacyArray(Meta.cards).filter((card: AnyRecord) => card.metaId == m.id).map((i: AnyRecord) => {
              const meta = asLegacyRecord(i.meta)
              const synonyms = meta.synonyms
              return {
                oldId: i.id,
                name: meta.name,
                synonyms: Array.isArray(synonyms) ? synonyms.join(', ') : null,
                rating: meta.rating || 0,
                favorite: meta.favorite || false,
                bookmark: meta.bookmark || null,
                country: serializeCountries(meta.country as string[] | null | undefined),
                color: meta.color || null,
                views: i.views || 0,
                createdAt: (new Date(asLegacyString(i.date)).toISOString()).replace('T', ' ').replace('Z', ' +00:00'),
                updatedAt: (new Date(asLegacyString(i.edit)).toISOString()).replace('T', ' ').replace('Z', ' +00:00'),
              }
            })
            for (const z of cards) {
              const card = z as AnyRecord
              for (const y in card) {
                if (typeof card[y] == 'string' && String(card[y]).length == 0) delete card[y]
                else if (card[y] === 0 || card[y] === '0') delete card[y]
                else if (card[y] === null) delete card[y]
              }
            }
              obj.tags.push({
                [String(m.id)]: cards
              })
            const metaKeys = ['name', 'synonyms', 'favorite', 'rating', 'bookmark', 'country', 'color']
            asLegacyArray(Meta.cards).filter((card: AnyRecord) => card.metaId == m.id).map((i: AnyRecord) => {
              const cardMeta = asLegacyRecord(i.meta)
              const metas = Object.fromEntries(Object.entries(cardMeta).filter(([key]) => !metaKeys.includes(key)))
              obj.metaInTags.push({
                [String(i.id)]: metas
              })
            })
          }
        }
        // get videos meta values and meta tags
        const videoKeys = ['path', 'duration', 'size', 'rating', 'favorite', 'date', 'resolution', 'edit', 'views', 'viewed', 'bookmark']
        obj.onlyMeta = asLegacyArray(Videos.videos).map((i: AnyRecord) =>
          Object.fromEntries(Object.entries(i).filter(([key]) => !videoKeys.includes(key)))
        )
        for (const z of obj.onlyMeta) {
          for (const y in z) {
            if (typeof z[y] == 'string' && z[y].length == 0) delete z[y]
            else if (z[y] === 0 || z[y] === '0') delete z[y]
            else if (z[y] === null) delete z[y]
          }
        }
        obj.watchedFolders = asLegacyArray(Settings.folders)
        resolve(obj)
      })
    }

    console.log('Preparing object with data from previous version of app.');
    const obj: LowDbImportObject = await createImportObject()
    console.log('\x1b[36m%s\x1b[0m', 'Object prepared successfully.', 'color: #bada55');

    // очищаем таблицы новой БД
    const dbSqlitePath = path.join(getDbPath()!, 'db.sqlite')
    await resetDatabaseAndRunMigrations(dbSqlitePath)
    console.log('Current data in tables was cleared')
    console.log('\x1b[36m%s\x1b[0m', 'Migrations applied.', 'color: #bada55');

    try {
      const {mediaIds, metaIds, tagsIds} = await importLowDbData(db, obj)

      for (const id of metaIds) { // creating folders for meta images
        const folderMetaOldId = path.join(metaNew, String(id.oldId))
        const folderMetaNewId = path.join(metaNew, `${id.id}`)

        if (fs.existsSync(folderMetaOldId))
          fs.renameSync(folderMetaOldId, folderMetaNewId)
      }

      console.log('\x1b[36m%s\x1b[0m', 'Object with data had imported into database.', 'color: #bada55');

      let tree: string[] = []

      function mapDir(dir: string) {
        fs.readdirSync(dir).forEach((file: string) => {
          const abs = path.join(dir, file);
          if (fs.statSync(abs).isDirectory()) return mapDir(abs);
          else return tree.push(abs);
        });
      }

      mapDir(metaNew)

      function replaceMetaId(name: string) {
        const types = ["_main", "_alt", "_custom1", "_custom2", "_avatar", "_header"]
        for (const type of types) {
          if (!name.includes(type)) continue
          const oldId = name.replace(type, '')
          const found = tagsIds.find((x: OldIdMapping) => x.oldId === oldId)
          if (!found) continue
          name = found.id + type
          break
        }
        return name
      }

      for (const imgPath of tree) { // renaming meta images
        // getting image name with type from path e.g. _main, _alt, _custom1
        const nameOld = path.basename(imgPath, path.extname(imgPath))
        // finding new id of meta
        const nameNew = replaceMetaId(nameOld)
        const newPath = imgPath.replace(nameOld, nameNew)
        if (fs.existsSync(imgPath)) fs.renameSync(imgPath, newPath)
      }

      // составляем массив с путями файлов для будущего переименования
      tree = []
      mapDir(thumbsNew)
      console.log('Renaming media files...');

      function replaceMediaId(name: string) {
        const found = mediaIds.find((x: OldIdMapping) => x.oldId === name)
        if (found) return found.id
        else return name
      }

      for (const imgPath of tree) { // renaming media images
        const nameOld = path.basename(imgPath, path.extname(imgPath))
        const nameNew = String(replaceMediaId(nameOld))
        const newPath = imgPath.replace(nameOld, nameNew)
        if (fs.existsSync(imgPath)) fs.renameSync(imgPath, newPath)
      }
      console.log('\x1b[36m%s\x1b[0m', 'Media files had renamed successfully.', 'color: #bada55');

      rmrf(tempPath)
      console.log('Removing temp data...');
      console.log('\x1b[36m%s\x1b[0m', 'All data has been successfully imported.', 'color: #bada55');

      return "All data has been successfully imported."
    } catch (e: unknown) {
      console.log(e)
      return e
    }
  };

  return {
    checkDataForMigrateFromLowDb,
    cleanDataLowDb,
    createBackupLowDb,
    migrateFromLowDb,
  }
}