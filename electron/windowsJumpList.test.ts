/**
 * @vitest-environment node
 */
import {describe, expect, it, vi} from 'vitest'
import {
  JUMP_LIST_ACTION_PREFIX,
  buildJumpListActionArg,
  buildJumpListLaunchArguments,
  buildWindowsJumpListTasks,
  dispatchJumpListAction,
  parseJumpListAction,
} from './windowsJumpList'

describe('parseJumpListAction', () => {
  it('reads --mediachips-action from argv', () => {
    expect(parseJumpListAction([
      'electron.exe',
      'main.js',
      `${JUMP_LIST_ACTION_PREFIX}addMedia`,
    ])).toBe('addMedia')
    expect(parseJumpListAction(['electron.exe'])).toBe(null)
    expect(parseJumpListAction([`${JUMP_LIST_ACTION_PREFIX}nope`])).toBe(null)
  })
})

describe('buildJumpListLaunchArguments', () => {
  it('includes entry script in development', () => {
    expect(buildJumpListLaunchArguments('settings', {
      isPackaged: false,
      mainScriptPath: '/app/main.js',
    })).toBe(`/app/main.js ${buildJumpListActionArg('settings')}`)
  })

  it('omits entry script when packaged', () => {
    expect(buildJumpListLaunchArguments('quit', {
      isPackaged: true,
    })).toBe(buildJumpListActionArg('quit'))
  })
})

describe('buildWindowsJumpListTasks', () => {
  it('builds task entries for the tray-equivalent actions', () => {
    const tasks = buildWindowsJumpListTasks({
      isPackaged: true,
      execPath: 'C:\\MediaChips.exe',
      iconPath: 'C:\\icon.ico',
    })
    expect(tasks.map((task) => task.title)).toEqual([
      'Show MediaChips',
      'Hide MediaChips',
      'Add Media',
      'Settings',
      'Lock',
      'Check for Updates',
      'Exit',
    ])
    expect(tasks[2]?.arguments).toContain('addMedia')
    expect(tasks[0]?.program).toBe('C:\\MediaChips.exe')
  })

  it('localizes Jump List titles', () => {
    const tasks = buildWindowsJumpListTasks({
      isPackaged: true,
      execPath: 'C:\\MediaChips.exe',
      iconPath: 'C:\\icon.ico',
      locale: 'ru',
    })
    expect(tasks.map((task) => task.title)).toEqual([
      'Показать MediaChips',
      'Скрыть MediaChips',
      'Добавить медиа',
      'Настройки',
      'Заблокировать',
      'Проверить обновления',
      'Выход',
    ])
  })
})

describe('dispatchJumpListAction', () => {
  it('routes actions to the matching handlers', () => {
    const deps = {
      showMainWindow: vi.fn(),
      hideMainWindow: vi.fn(),
      sendMenuAction: vi.fn(),
      onLock: vi.fn(),
      quitApp: vi.fn(),
      setIsQuitting: vi.fn(),
    }

    dispatchJumpListAction('hide', deps)
    expect(deps.hideMainWindow).toHaveBeenCalled()

    dispatchJumpListAction('settings', deps)
    expect(deps.showMainWindow).toHaveBeenCalled()
    expect(deps.sendMenuAction).toHaveBeenCalledWith('settings')

    dispatchJumpListAction('lock', deps)
    expect(deps.onLock).toHaveBeenCalled()

    dispatchJumpListAction('quit', deps)
    expect(deps.setIsQuitting).toHaveBeenCalledWith(true)
    expect(deps.quitApp).toHaveBeenCalled()
  })
})
