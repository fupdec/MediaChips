/** Bundled resources root (models/, etc.) for Electron main or spawned server child. */
export function resolveProcessResourcesPath(
  env: NodeJS.ProcessEnv = process.env,
  processLike: {resourcesPath?: string} = process,
): string | undefined {
  const fromEnv = env.MEDIA_CHIPS_RESOURCES_PATH?.trim()
  if (fromEnv) return fromEnv
  const fromProcess = processLike.resourcesPath?.trim()
  return fromProcess || undefined
}
