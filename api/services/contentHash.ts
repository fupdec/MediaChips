import crypto from 'crypto'
import fs from 'fs'
import { access } from 'fs/promises'

const pathVariants = (pathToFile: string): string[] => {
  const variants = new Set<string>()

  if (typeof pathToFile !== 'string' || !pathToFile) {
    return []
  }

  variants.add(pathToFile)

  if (typeof pathToFile.normalize === 'function') {
    variants.add(pathToFile.normalize('NFC'))
    variants.add(pathToFile.normalize('NFD'))
  }

  return [...variants]
}

const resolveExistingPath = async (pathToFile: string): Promise<string | null> => {
  for (const variant of pathVariants(pathToFile)) {
    try {
      await access(variant, fs.constants.F_OK)
      return variant
    } catch {
      // try next variant
    }
  }

  return null
}

const fileExists = async (pathToFile: string) => Boolean(await resolveExistingPath(pathToFile))

const hashCache = new Map<string, string>()

const computeContentHash = (pathToFile: string) => new Promise<string>((resolve, reject) => {
  const hash = crypto.createHash('sha256')
  const stream = fs.createReadStream(pathToFile)

  stream.on('data', (chunk: Buffer) => hash.update(chunk))
  stream.on('end', () => resolve(hash.digest('hex') as string))
  stream.on('error', reject)
})

const computeContentHashForPath = async (
  pathToFile: string,
  {useCache = true}: {useCache?: boolean} = {},
) => {
  const resolvedPath = await resolveExistingPath(pathToFile)

  if (!resolvedPath) {
    throw new Error(`File not found: ${pathToFile}`)
  }

  if (useCache && hashCache.has(resolvedPath)) {
    return hashCache.get(resolvedPath) as string
  }

  const hash = await computeContentHash(resolvedPath)
  hashCache.set(resolvedPath, hash)
  return hash
}

const verifyContentHashMatch = async (pathToFile: string, expectedHash: string | null | undefined) => {
  try {
    const actualHash = await computeContentHashForPath(pathToFile)
    return actualHash === expectedHash
  } catch {
    return false
  }
}

export {
  computeContentHash,
  computeContentHashForPath,
  verifyContentHashMatch,
  fileExists,
  resolveExistingPath,
  pathVariants,
}
