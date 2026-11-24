import {createRemoteFingerprintBackground} from '../../api/services/remoteFingerprintBackground'
import {getNasMediaAssets} from '../../api/services/nas/mediaAssets'
import type {Express} from 'express'
import type {ApiDb} from '../../api/types/db'
import {createCloudMetadataBackfill} from '../../api/services/cloudAccounts/metadataBackfill'

/** One worker follows the active library through database switches. */
export function registerCloudMetadataBackfill(app: Express, db: ApiDb) {
  const worker = createCloudMetadataBackfill(db)
  const fingerprints = createRemoteFingerprintBackground(db)
  const nas = getNasMediaAssets(db)
  // Each worker runs a synchronous scan; separate phases keep their stalls from adding up on the event loop.
  const workers = [
    {run: () => fingerprints.tick(), offset: 5000},
    {run: () => worker.tick(), offset: 8500},
    {run: () => nas.tick(), offset: 12000},
  ]
  const timeouts: ReturnType<typeof setTimeout>[] = []
  const intervals: ReturnType<typeof setInterval>[] = []
  for (const {run, offset} of workers) {
    const tick = () => { void run().catch(() => {}) }
    const initial = setTimeout(() => { tick(); intervals.push(setInterval(tick, 10_000).unref()) }, offset)
    timeouts.push(initial.unref())
  }
  app.once('cloud-metadata:dispose', () => {
    timeouts.forEach(clearTimeout); intervals.forEach(clearInterval)
    worker.dispose(); fingerprints.dispose(); nas.dispose()
  })
}
