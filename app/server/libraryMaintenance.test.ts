// @vitest-environment node
import express from 'express'
import {expect, it} from 'vitest'
import type {AddressInfo} from 'node:net'
import {libraryMaintenanceMiddleware} from './libraryMaintenance'
import {withLibraryRestore} from '../../api/services/libraryMaintenance'

it('protects writes and repeat restore requests while keeping health available', async () => {
  const app = express()
  app.use(libraryMaintenanceMiddleware)
  app.get('/api/ping', (_req, res) => res.sendStatus(200))
  let writes = 0
  app.post('/api/Media', (_req, res) => { writes++; res.sendStatus(200) })
  app.post('/api/TasksBackups/restoreBackup', async (_req, res) => {
    await withLibraryRestore(async () => {})
    res.sendStatus(200)
  })
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject) })
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  try {
    await withLibraryRestore(async () => {
      const write = await fetch(`${url}/api/Media`, {method: 'POST'})
      expect(write.status).toBe(409)
      expect(await write.json()).toMatchObject({code: 'library_restoring'})
      expect((await fetch(`${url}/api/TasksBackups/restoreBackup`, {method: 'POST'})).status).toBe(409)
      expect((await fetch(`${url}/api/ping`)).status).toBe(200)
      expect(writes).toBe(0)
    })
    expect((await fetch(`${url}/api/Media`, {method: 'POST'})).status).toBe(200)
    // This request must not count itself among operations to drain.
    expect((await fetch(`${url}/api/TasksBackups/restoreBackup`, {method: 'POST'})).status).toBe(200)
    expect((await fetch(`${url}/API/tasksbackups/restoreBackup/`, {method: 'POST'})).status).toBe(200)
    expect(writes).toBe(1)
  } finally { await new Promise<void>(resolve => server.close(() => resolve())) }
})
