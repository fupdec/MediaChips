export {}

declare global {
  namespace NodeJS {
    interface Process {
      app_folder?: string
      resourcesPath?: string
      server_config?: unknown
      electron_app?: {
        getPath(name: string): string
      }
    }
  }
}

declare module 'archiver' {
  import type { WriteStream } from 'fs'

  interface Archiver {
    pipe(destination: WriteStream): void
    directory(source: string, destPath?: string | false): void
    file(source: string, data: { name: string }): void
    finalize(): void
    on(event: string, listener: (...args: unknown[]) => void): void
  }

  function archiver(format: string, options?: Record<string, unknown>): Archiver

  export = archiver
}

export type { AnyRecord } from './db'
