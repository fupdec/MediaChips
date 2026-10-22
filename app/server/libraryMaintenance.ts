import type {RequestHandler} from 'express'
import {beginLibraryOperation, isLibraryRestoring} from '../../api/services/libraryMaintenance'

/** Restore acquires its exclusive lease in the controller, never a shared one. */
export const libraryMaintenanceMiddleware: RequestHandler = (req, res, next) => {
  const path = req.path.replace(/\/+$/, '').toLowerCase()
  if (!path.startsWith('/api/') || ['/api/ping', '/api/config', '/api/health'].includes(path)) return next()
  if (isLibraryRestoring()) {
    res.status(409).set('Retry-After', '1').json({code: 'library_restoring', message: 'Library restoration is in progress. Try again after it finishes.'})
    return
  }
  if (req.method === 'POST' && path === '/api/tasksbackups/restorebackup') return next()
  const lease = beginLibraryOperation()
  res.once('finish', lease.release)
  res.once('close', lease.release)
  lease.run(next)
}
