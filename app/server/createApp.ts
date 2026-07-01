import type { Express, Request, Response, NextFunction } from 'express'
import path from 'path'
import history from 'connect-history-api-fallback'
import express from 'express'
import { normalizeApiPath } from '../../api/utils/normalizeApiPath'
import { createCorsMiddleware } from './constants'

interface HistoryRewriteContext {
  parsedUrl: { pathname?: string }
}

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

function setupStaticApp(app: Express) {
  const src = path.join(__dirname, '../../dist')
  const spaHistory = history({
    disableDotRule: true,
    verbose: false,
    rewrites: [
      {
        from: /^\/api\/.*$/,
        to(context: HistoryRewriteContext) {
          return context.parsedUrl.pathname ?? '/'
        },
      },
      {
        from: /^\/socket\.io\/.*$/,
        to(context: HistoryRewriteContext) {
          return context.parsedUrl.pathname ?? '/'
        },
      },
    ],
  })

  app.use(express.static(src))
  app.use(spaHistory)
  app.use(express.static(src))
}

export { createExpressApp, setupStaticApp }
