import type { NextFunction, Request, Response } from 'express'
import { FIXED_PORT } from './ports'
import { getBindHost, isLanAccessEnabled } from './lanAccess'

function getAllowLan(): boolean {
  return isLanAccessEnabled()
}

function getBindHostForServer(): string {
  return getBindHost()
}

function isLoopbackHost(hostname: string): boolean {
  return ['localhost', '127.0.0.1', '::1'].includes(hostname)
}

function isPrivateIpv4(hostname: string): boolean {
  return /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
}

function isAllowedOrigin(origin: string | string[] | undefined): boolean {
  if (!origin || Array.isArray(origin)) return !origin

  try {
    const parsed = new URL(origin)
    if (!['http:', 'https:'].includes(parsed.protocol)) return false

    const hostname = parsed.hostname.toLowerCase()
    return isLoopbackHost(hostname) || (getAllowLan() && isPrivateIpv4(hostname))
  } catch {
    return false
  }
}

function createCorsMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin
    if (!isAllowedOrigin(origin)) {
      return res.status(403).json({error: 'Origin is not allowed'})
    }

    if (origin) {
      res.header('Access-Control-Allow-Origin', origin)
      res.header('Vary', 'Origin')
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH')
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Content-Disposition, Range')
    res.header('Access-Control-Allow-Credentials', 'true')
    res.header('Access-Control-Expose-Headers', 'Content-Disposition, Content-Range, Accept-Ranges, Content-Length')

    if (req.method === 'OPTIONS') {
      return res.sendStatus(200)
    }

    next()
  }
}

export {
  FIXED_PORT,
  getAllowLan,
  getBindHostForServer,
  isLoopbackHost,
  isPrivateIpv4,
  isAllowedOrigin,
  createCorsMiddleware,
}
