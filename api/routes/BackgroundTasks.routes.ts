import express, {type Express} from 'express'
import type {ApiDb} from '../types/db'
import {listBackgroundTasks} from '../services/backgroundTasks'

/** Snapshot of server-owned background work; the UI polls it and mirrors running items into Tasks. */
export default function registerBackgroundTasks(app: Express, _db: ApiDb) {
  const router = express.Router()
  router.get('/', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json({tasks: listBackgroundTasks()})
  })
  app.use('/api/background-tasks', router)
}
