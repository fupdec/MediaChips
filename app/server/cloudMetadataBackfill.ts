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
  const tick = () => { void fingerprints.tick().catch(() => {}); void worker.tick().catch(() => {}); void nas.tick().catch(() => {}) }
  const initial = setTimeout(tick, 5000)
  const timer = setInterval(tick, 10_000)
  initial.unref(); timer.unref()
  app.once('cloud-metadata:dispose', () => { clearTimeout(initial); clearInterval(timer); worker.dispose(); fingerprints.dispose(); nas.dispose() })
}
