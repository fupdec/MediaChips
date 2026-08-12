declare module 'express-ws' {
  import type { Express } from 'express'

  interface ExpressWsInstance {
    app: Express
    getWss: () => {close: (callback?: (err?: Error) => void) => void}
    applyTo: (router: unknown) => void
  }

  function expressWs(
    app: Express,
    server?: unknown,
    options?: Record<string, unknown>,
  ): ExpressWsInstance

  export = expressWs
}
