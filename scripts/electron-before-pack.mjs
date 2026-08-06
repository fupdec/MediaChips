/**
 * Safety net: prune non-target native binaries even if packaging bypasses dist.mjs.
 * dist.mjs already calls pruneNativeBinaries before electron-builder; this is idempotent.
 */
import {pruneNativeBinaries} from './prune-native-binaries.mjs'

function resolvePruneTarget(context) {
  const platform = String(
    context?.electronPlatformName
    || context?.packager?.platform?.nodeName
    || context?.packager?.platform?.name
    || process.platform,
  )

  if (platform === 'darwin' || platform === 'mac') return 'mac'
  if (platform === 'win32' || platform === 'windows' || platform === 'win') return 'win'
  return 'linux'
}

export default async function beforePack(context) {
  pruneNativeBinaries(resolvePruneTarget(context))
}
