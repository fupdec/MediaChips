import type Database from 'better-sqlite3'
import type { DrizzleClient, DrizzleConnection } from './client'
import { closeDrizzleClient } from './client'

let activeConnection: DrizzleConnection | null = null

function bindProxyTarget<T extends object>(getTarget: () => T): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      const target = getTarget()
      const value = Reflect.get(target, prop, target)
      if (typeof value === 'function') {
        return (...args: unknown[]) => value.apply(target, args)
      }
      return value
    },
  })
}

const drizzleProxy = bindProxyTarget<DrizzleClient>(() => {
  if (!activeConnection) {
    throw new Error('Database connection is not initialized')
  }
  return activeConnection.drizzle
})

const sqliteProxy = bindProxyTarget<Database.Database>(() => {
  if (!activeConnection) {
    throw new Error('Database connection is not initialized')
  }
  return activeConnection.sqlite
})

export function setActiveConnection(connection: DrizzleConnection) {
  activeConnection = connection
}

export function getActiveConnection(): DrizzleConnection | null {
  return activeConnection
}

export function closeActiveConnection() {
  if (!activeConnection) return
  closeDrizzleClient(activeConnection)
  activeConnection = null
}

export function getDrizzleProxy(): DrizzleClient {
  return drizzleProxy
}

export function getSqliteProxy(): Database.Database {
  return sqliteProxy
}

