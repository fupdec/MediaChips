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

export {
  fileExists,
  resolveExistingPath,
  pathVariants,
}
