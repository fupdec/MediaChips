import fs from 'fs'
import path from 'path'
import {app, type Task} from 'electron'
import {getTrayMenuLabels, type TrayMenuLabels} from '../shared/electron/trayMenuI18n'

/** CLI flag used by Windows Jump List taskbar items. */
export const JUMP_LIST_ACTION_PREFIX = '--mediachips-action='

export const JUMP_LIST_ACTIONS = [
  'show',
  'hide',
  'addMedia',
  'settings',
  'lock',
  'checkUpdates',
  'quit',
] as const

export type JumpListAction = (typeof JUMP_LIST_ACTIONS)[number]

export function isJumpListAction(value: string): value is JumpListAction {
  return (JUMP_LIST_ACTIONS as readonly string[]).includes(value)
}

export function parseJumpListAction(argv: readonly string[]): JumpListAction | null {
  for (const arg of argv) {
    if (!arg.startsWith(JUMP_LIST_ACTION_PREFIX)) continue
    const value = arg.slice(JUMP_LIST_ACTION_PREFIX.length)
    if (isJumpListAction(value)) return value
  }
  return null
}

export function buildJumpListActionArg(action: JumpListAction): string {
  return `${JUMP_LIST_ACTION_PREFIX}${action}`
}

/** Arguments for launching this app with a Jump List action (dev + packaged). */
export function buildJumpListLaunchArguments(
  action: JumpListAction,
  options: {
    isPackaged: boolean
    appPath?: string
    mainScriptPath?: string
  },
): string {
  const parts: string[] = []
  if (!options.isPackaged) {
    // In dev, Electron needs the app entry script before custom flags.
    const entry = options.mainScriptPath
      || options.appPath
      || process.argv[1]
    if (entry) parts.push(path.resolve(entry))
  }
  parts.push(buildJumpListActionArg(action))
  return parts.join(' ')
}

export type JumpListTaskSpec = {
  action: JumpListAction
  title: string
  description: string
}

export function buildJumpListTaskSpecs(labels: TrayMenuLabels): JumpListTaskSpec[] {
  return [
    {action: 'show', title: labels.show, description: labels.showDescription},
    {action: 'hide', title: labels.hide, description: labels.hideDescription},
    {action: 'addMedia', title: labels.addMedia, description: labels.addMediaDescription},
    {action: 'settings', title: labels.settings, description: labels.settingsDescription},
    {action: 'lock', title: labels.lock, description: labels.lockDescription},
    {
      action: 'checkUpdates',
      title: labels.checkUpdates,
      description: labels.checkUpdatesDescription,
    },
    {action: 'quit', title: labels.exit, description: labels.exitDescription},
  ]
}

export function buildWindowsJumpListTasks(options: {
  isPackaged: boolean
  execPath: string
  iconPath: string
  locale?: string
  appPath?: string
  mainScriptPath?: string
}): Task[] {
  const labels = getTrayMenuLabels(options.locale)
  return buildJumpListTaskSpecs(labels).map((spec) => ({
    program: options.execPath,
    arguments: buildJumpListLaunchArguments(spec.action, options),
    iconPath: options.iconPath,
    iconIndex: 0,
    title: spec.title,
    description: spec.description,
  }))
}

export function installWindowsJumpList(options: {
  getAppRoot: () => string
  locale?: string
}): boolean {
  if (process.platform !== 'win32') return false

  try {
    const icoPath = path.join(options.getAppRoot(), 'dist/icons/favicon.ico')
    const iconPath = fs.existsSync(icoPath) ? icoPath : process.execPath
    const tasks = buildWindowsJumpListTasks({
      isPackaged: app.isPackaged,
      execPath: process.execPath,
      iconPath,
      locale: options.locale,
      appPath: app.getAppPath(),
      mainScriptPath: process.argv[1],
    })
    app.setUserTasks(tasks)
    return true
  } catch (error) {
    console.warn('Failed to install Windows Jump List:', error)
    return false
  }
}

export type JumpListActionHandlerDeps = {
  showMainWindow: () => void
  hideMainWindow: () => void
  sendMenuAction: (action: string) => void
  onLock: () => void
  quitApp: () => void
  setIsQuitting: (value: boolean) => void
}

export function dispatchJumpListAction(
  action: JumpListAction,
  deps: JumpListActionHandlerDeps,
): void {
  switch (action) {
    case 'show':
      deps.showMainWindow()
      return
    case 'hide':
      deps.hideMainWindow()
      return
    case 'addMedia':
      deps.showMainWindow()
      deps.sendMenuAction('addMedia')
      return
    case 'settings':
      deps.showMainWindow()
      deps.sendMenuAction('settings')
      return
    case 'lock':
      deps.onLock()
      return
    case 'checkUpdates':
      deps.showMainWindow()
      deps.sendMenuAction('checkUpdates')
      return
    case 'quit':
      deps.setIsQuitting(true)
      deps.quitApp()
      return
  }
}
