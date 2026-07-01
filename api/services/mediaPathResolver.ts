
import { resolveActiveDbFilePath } from './activeDbFileResolver'

async function resolveMediaInputPath(inputPath: string, dbPath: string) {
  return resolveActiveDbFilePath(inputPath, dbPath)
}

export { resolveMediaInputPath, resolveActiveDbFilePath }
