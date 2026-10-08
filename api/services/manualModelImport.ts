import fs from 'fs'
import path from 'path'
import {Transform} from 'stream'
import {pipeline} from 'stream/promises'
import StreamZip from 'node-stream-zip'
import {MANUAL_MODELS, type ManualModelKind} from '../../shared/manualModels'

export function resolveModelEntries(kind: ManualModelKind, names: string[]): Map<string, string> {
  const result = new Map<string, string>()
  for (const required of MANUAL_MODELS[kind].files) {
    const matches = names.filter(name => !name.includes('..') && !name.includes('\\') && (name === required || name.endsWith('/' + required)))
    if (matches.length !== 1) throw new Error(`ZIP must contain exactly one ${required}`)
    result.set(required, matches[0])
  }
  return result
}

export async function validateModelFile(file: string) {
  const size = (await fs.promises.stat(file)).size
  if (file.endsWith('.json')) {
    if (size > 32 * 1024 * 1024) throw new Error('Model JSON is too large')
    JSON.parse(await fs.promises.readFile(file, 'utf8'))
  } else {
    if (size < 1024 * 1024) throw new Error('Model file is incomplete or invalid')
    const handle = await fs.promises.open(file, 'r')
    const header = Buffer.alloc(4)
    try { await handle.read(header, 0, 4, 0) } finally { await handle.close() }
    if (file.endsWith('.gguf')) {
      if (header.toString() !== 'GGUF') throw new Error('Expected a GGUF model')
      if (size < 900_000_000) throw new Error('Local AI model is incomplete; download the full Qwen2.5 1.5B Q4_K_M file')
    }
    if (file.endsWith('.onnx')) {
      const {getOrt} = await import('./faceOrtRuntime')
      await getOrt().InferenceSession.create(file)
    }
  }
}

// Extract only known model files; never use archive paths as destinations.
export async function installManualModel(upload: string, zip: boolean, kind: ManualModelKind, modelsRoot: string) {
  const model = MANUAL_MODELS[kind]
  const staging = await fs.promises.mkdtemp(path.join(modelsRoot, '.import-'))
  let archive: InstanceType<typeof StreamZip.async> | undefined
  try {
    if (zip) {
      archive = new StreamZip.async({file: upload})
      const entries = await archive.entries()
      const selected = resolveModelEntries(kind, Object.keys(entries).filter(name => !entries[name].isDirectory))
      for (const [relative, name] of selected) {
        if (entries[name].size > 2 * 1024 ** 3) throw new Error('Model file is too large')
        const destination = path.join(staging, relative)
        await fs.promises.mkdir(path.dirname(destination), {recursive: true})
        let extracted = 0
        const limit = new Transform({transform(chunk, _encoding, callback) {
          extracted += chunk.length
          callback(extracted > 2 * 1024 ** 3 ? new Error('Model file is too large') : null, chunk)
        }})
        await pipeline(await archive.stream(name), limit, fs.createWriteStream(destination))
        await validateModelFile(destination)
      }
    } else {
      if (model.files.length !== 1) throw new Error('CLIP requires a ZIP containing all model files')
      const destination = path.join(staging, model.files[0])
      await fs.promises.copyFile(upload, destination)
      await validateModelFile(destination)
    }
    const destination = path.join(modelsRoot, model.directory)
    await fs.promises.mkdir(path.dirname(destination), {recursive: true})
    const backup = staging + '-previous'
    const exists = fs.existsSync(destination)
    if (exists) await fs.promises.rename(destination, backup)
    try { await fs.promises.rename(staging, destination) }
    catch (error) {
      if (exists) await fs.promises.rename(backup, destination)
      throw error
    }
    await fs.promises.rm(backup, {recursive: true, force: true})
  } finally {
    await archive?.close()
    await fs.promises.rm(staging, {recursive: true, force: true})
  }
}
