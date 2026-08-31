import fs from 'fs'
import path from 'path'
import {GENERATED_MEDIA_FOLDERS} from '../../../shared/generatedMediaFolders'

const TIMELINE_PARTS = [5, 15, 25, 35, 45, 55, 65, 75, 85, 95]
const TAG_IMAGE_SUFFIXES = ['main', 'avatar', 'alt', 'header', 'custom1', 'custom2']

function copyFileIfMissing(sourcePath: string, destPath: string): boolean {
  if (!fs.existsSync(sourcePath)) return false
  if (fs.existsSync(destPath)) return false
  fs.mkdirSync(path.dirname(destPath), {recursive: true})
  fs.copyFileSync(sourcePath, destPath)
  return true
}

function copyDirIfMissing(sourceDir: string, destDir: string): number {
  if (!fs.existsSync(sourceDir)) return 0
  if (fs.existsSync(destDir)) return 0
  fs.mkdirSync(path.dirname(destDir), {recursive: true})
  fs.cpSync(sourceDir, destDir, {recursive: true})
  return 1
}

export function copyGeneratedMediaAssets(options: {
  sourceLibraryPath: string
  targetLibraryPath: string
  sourceMediaId: number
  targetMediaId: number
}): number {
  const {sourceLibraryPath, targetLibraryPath, sourceMediaId, targetMediaId} = options
  let copied = 0

  const pairCopies: Array<{rel: string, name: (id: number) => string}> = [
    {rel: GENERATED_MEDIA_FOLDERS.thumbs, name: (id) => `${id}.jpg`},
    {rel: GENERATED_MEDIA_FOLDERS.grids, name: (id) => `${id}.jpg`},
    {rel: GENERATED_MEDIA_FOLDERS['image-thumbs'], name: (id) => `${id}.jpg`},
    {rel: GENERATED_MEDIA_FOLDERS['audio-thumbs'], name: (id) => `${id}.jpg`},
  ]

  for (const entry of pairCopies) {
    if (copyFileIfMissing(
      path.join(sourceLibraryPath, entry.rel, entry.name(sourceMediaId)),
      path.join(targetLibraryPath, entry.rel, entry.name(targetMediaId)),
    )) {
      copied += 1
    }
  }

  for (const part of TIMELINE_PARTS) {
    if (copyFileIfMissing(
      path.join(sourceLibraryPath, 'media/videos/timelines', `${sourceMediaId}_${part}.jpg`),
      path.join(targetLibraryPath, 'media/videos/timelines', `${targetMediaId}_${part}.jpg`),
    )) {
      copied += 1
    }
  }

  copied += copyDirIfMissing(
    path.join(sourceLibraryPath, GENERATED_MEDIA_FOLDERS.faces, String(sourceMediaId)),
    path.join(targetLibraryPath, GENERATED_MEDIA_FOLDERS.faces, String(targetMediaId)),
  )

  return copied
}

export function copyMarkAsset(options: {
  sourceLibraryPath: string
  targetLibraryPath: string
  sourceMarkId: number
  targetMarkId: number
}): boolean {
  return copyFileIfMissing(
    path.join(options.sourceLibraryPath, GENERATED_MEDIA_FOLDERS.marks, `${options.sourceMarkId}.jpg`),
    path.join(options.targetLibraryPath, GENERATED_MEDIA_FOLDERS.marks, `${options.targetMarkId}.jpg`),
  )
}

export function copyTagAssets(options: {
  sourceLibraryPath: string
  targetLibraryPath: string
  sourceMetaId: number
  targetMetaId: number
  sourceTagId: number
  targetTagId: number
}): number {
  const {
    sourceLibraryPath,
    targetLibraryPath,
    sourceMetaId,
    targetMetaId,
    sourceTagId,
    targetTagId,
  } = options

  const sourceDir = path.join(sourceLibraryPath, 'meta', String(sourceMetaId))
  const targetDir = path.join(targetLibraryPath, 'meta', String(targetMetaId))
  if (!fs.existsSync(sourceDir)) return 0

  let copied = 0
  fs.mkdirSync(targetDir, {recursive: true})

  const prefix = `${sourceTagId}_`
  for (const file of fs.readdirSync(sourceDir)) {
    if (!file.startsWith(prefix)) continue
    if (!/\.(jpg|jpeg|png|webp)$/i.test(file)) continue
    const suffix = file.slice(prefix.length)
    const destName = `${targetTagId}_${suffix}`
    if (copyFileIfMissing(path.join(sourceDir, file), path.join(targetDir, destName))) {
      copied += 1
    }
  }

  // Common suffixes even if directory listing missed them
  for (const suffix of TAG_IMAGE_SUFFIXES) {
    const src = path.join(sourceDir, `${sourceTagId}_${suffix}.jpg`)
    const dest = path.join(targetDir, `${targetTagId}_${suffix}.jpg`)
    if (copyFileIfMissing(src, dest)) copied += 1
  }

  return copied
}
