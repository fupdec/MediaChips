/**
 * Portable / AppImage builds extract to a temp path; relaunch must use the
 * persistent launcher so the process does not spawn into a deleted folder.
 */
export function resolveRelaunchExecPath(
  env: NodeJS.ProcessEnv = process.env,
  fallbackExecPath: string = process.execPath,
): string {
  const portable = env.PORTABLE_EXECUTABLE_FILE?.trim()
  if (portable) return portable
  const appImage = env.APPIMAGE?.trim()
  if (appImage) return appImage
  return fallbackExecPath
}
