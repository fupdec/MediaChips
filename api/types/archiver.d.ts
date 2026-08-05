declare module 'archiver' {
  import type { Readable } from 'stream'
  import type { WriteStream } from 'fs'

  interface Archiver {
    pipe(destination: WriteStream): void
    directory(source: string, destPath?: string | false): void
    file(source: string, data: { name: string }): void
    append(
      source: Buffer | string | Readable,
      data: { name: string },
    ): this
    finalize(): Promise<void> | void
    on(event: string, listener: (...args: unknown[]) => void): this
  }

  function archiver(format: string, options?: Record<string, unknown>): Archiver

  export = archiver
}
