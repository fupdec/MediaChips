import fs from 'fs'
import path from 'path'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryableFsError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException)?.code
  return code === 'EPERM' || code === 'EBUSY' || code === 'EACCES' || code === 'EEXIST'
}

/**
 * Replace `outputPath` with `tempPath`.
 *
 * On Windows, thumbs are often still open by the UI (`/api/get-file`), so a direct
 * overwrite or rename can fail with EPERM/EBUSY. Retry unlink+rename, then fall
 * back to copyFile over the destination.
 */
export async function replaceFileWithRetry(tempPath: string, outputPath: string): Promise<void> {
  if (process.platform !== 'win32') {
    await fs.promises.rename(tempPath, outputPath)
    return
  }

  const attempts = 10
  let lastError: unknown

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      try {
        await fs.promises.unlink(outputPath)
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
          // Destination may be locked; still try rename/copy below.
          if (!isRetryableFsError(error)) throw error
        }
      }

      await fs.promises.rename(tempPath, outputPath)
      return
    } catch (error) {
      lastError = error
      try {
        await fs.promises.copyFile(tempPath, outputPath)
        await fs.promises.unlink(tempPath).catch(() => undefined)
        return
      } catch (copyError) {
        lastError = copyError
        if (attempt >= attempts - 1 || !isRetryableFsError(copyError)) {
          break
        }
        await sleep(40 * (attempt + 1))
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

/**
 * Write via a sibling temp file, then replace the destination.
 * Avoids exclusive locks and partial/corrupt thumbs when overwrite fails mid-write.
 */
export async function writeFileAtomically(
  outputPath: string,
  writeTemp: (tempPath: string) => Promise<void>,
): Promise<string> {
  const resolved = path.normalize(outputPath)
  await fs.promises.mkdir(path.dirname(resolved), {recursive: true})

  const tempPath = `${resolved}.${process.pid}.${Date.now()}.tmp`
  try {
    await writeTemp(tempPath)
    await replaceFileWithRetry(tempPath, resolved)
    return resolved
  } catch (error) {
    await fs.promises.unlink(tempPath).catch(() => undefined)
    throw error
  }
}
