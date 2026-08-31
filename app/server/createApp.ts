import type { Express, Request, Response, NextFunction } from 'express'
import {projectPath} from '../../shared/projectRoot'
import history from 'connect-history-api-fallback'
import express from 'express'
import { normalizeApiPath } from '../../api/utils/normalizeApiPath'
import { createCorsMiddleware } from './constants'

function createExpressApp() {
  const app = express()
  const router = express.Router()

  app.use(createCorsMiddleware())

  app.use(express.json({
    limit: '100mb',
  }))

  app.use(express.urlencoded({extended: true}))

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.url.startsWith('/api/')) {
      const normalized = normalizeApiPath(req.url)
      if (normalized !== req.url) {
        req.url = normalized
      }
    }
    next()
  })

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === 'production') {
      next()
      return
    }

    const url = req.originalUrl || req.url
    const isTranscodeStream = req.method === 'GET' && /\/api\/video\/\d+\/transcode\/stream(?:\?|$)/.test(url)
    const isQuietRoute = /^\/api\/(?:get-file|check-file|check-files|health|ping|auth\/status)(?:\?|$)/.test(url.split('?')[0])

    if (isTranscodeStream) {
      console.log(`${new Date().toISOString()} [transcode] ${req.method} ${url} ${req.headers.origin || 'no origin'}`)
    } else if (!isQuietRoute && !url.startsWith('/api/services/')) {
      console.log(`${new Date().toISOString()} ${req.method} ${url} ${req.headers.origin || 'no origin'}`)
    }

    next()
  })

  app.use(router)

  return {app, router}
}

function setupStaticApp(app: Express, staticDir: string = projectPath('dist')) {
  const src = staticDir
  const spaHistory = history({
    disableDotRule: true,
    verbose: false,
  })

  // Never run SPA fallback for API/socket — rewriting /api/* to pathname
  // strips ?url= and breaks /api/get-file thumbs when static is registered
  // before (or ahead of) the get-file route in the middleware stack.
  const skipApiAndSockets = (req: Request, res: Response, next: NextFunction) => {
    const path = (req.path || req.url || '').split('?')[0]
    if (path.startsWith('/api/') || path.startsWith('/socket.io/')) {
      next()
      return
    }
    spaHistory(req, res, next)
  }

  app.use(express.static(src))
  app.use(skipApiAndSockets)
  app.use(express.static(src))
}

export { createExpressApp, setupStaticApp }
